export const dynamic = 'force-dynamic';
import fs from 'node:fs';
import { NextRequest, NextResponse } from 'next/server';
import { rawDb } from '@/db/index';
import { STORAGE_DIR } from '@/lib/app-paths';
import { activeJobFor } from '@/lib/jobs/queue';
import { rejectUnlessSyncAuthorized } from '@/lib/sync/receive';
import { SYNC_TABLES, isValidProjectId, mapRowPaths, fromPortablePath } from '@/lib/sync/sync-core';

/**
 * "Send to production", step 2 (after the files): replace this project's rows with the sender's copy.
 * Body: { rows: { <table>: Row[] } } with paths in portable form ("@storage/..."). Rows are re-rooted to this
 * server's storage, filtered to columns this server's schema has, and written in one transaction (each write is
 * also replicated to PostgreSQL by rawDb). Every referenced file must already be here, so rows never point at
 * missing media.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = rejectUnlessSyncAuthorized(req);
  if (denied) return denied;
  const { id } = await params;
  if (!isValidProjectId(id)) return NextResponse.json({ error: 'Invalid project id.' }, { status: 400 });
  if (activeJobFor(id)) return NextResponse.json({ error: 'This project is processing on production right now; try again when it finishes.' }, { status: 409 });

  const body = await req.json().catch(() => null);
  const incoming = body?.rows;
  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.projects) || incoming.projects.length !== 1 || incoming.projects[0]?.id !== id) {
    return NextResponse.json({ error: 'Expected rows.projects with exactly this project.' }, { status: 400 });
  }

  // Validate ownership of every row and re-root paths, before writing anything.
  const prepared: Array<{ table: string; key: string; rows: Record<string, any>[] }> = [];
  for (const { table, key } of SYNC_TABLES) {
    const rows = Array.isArray(incoming[table]) ? incoming[table] : [];
    if (rows.some((r: any) => !r || typeof r !== 'object' || r[key] !== id)) {
      return NextResponse.json({ error: `Rows in ${table} must all belong to ${id}.` }, { status: 400 });
    }
    try {
      prepared.push({ table, key, rows: rows.map((r: any) => mapRowPaths(r, (s) => fromPortablePath(s, STORAGE_DIR))) });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }
  // The source video and each short's current render/thumbnail must already be uploaded. (Older renders in the
  // renders history may have been pruned from the sender's disk; those are allowed to be missing.)
  const rowsOf = (t: string) => prepared.find((p) => p.table === t)?.rows || [];
  const required = [
    ...rowsOf('media_assets').map((r) => r.file_path),
    ...rowsOf('shorts').flatMap((r) => [r.output_path, r.thumbnail_path]),
  ].filter((p): p is string => typeof p === 'string' && p.startsWith(STORAGE_DIR));
  const missing = required.filter((p) => !fs.existsSync(p));
  if (missing.length) {
    return NextResponse.json({ error: `Upload these files first: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` (+${missing.length - 5} more)` : ''}` }, { status: 409 });
  }

  const counts: Record<string, number> = {};
  rawDb.exec('BEGIN');
  try {
    // Children first when deleting, parents first when inserting (foreign keys are enforced).
    for (const { table, key } of [...prepared].reverse()) rawDb.prepare(`DELETE FROM ${table} WHERE ${key} = ?`).run(id);
    for (const { table, rows } of prepared) {
      const cols = new Set((rawDb.prepare(`PRAGMA table_info(${table})`).all() as any[]).map((c) => c.name));
      for (const row of rows) {
        const keys = Object.keys(row).filter((k) => cols.has(k));
        rawDb
          .prepare(`INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
          .run(...keys.map((k) => (row[k] === undefined ? null : row[k])));
      }
      counts[table] = rows.length;
    }
    rawDb.exec('COMMIT');
  } catch (err: any) {
    rawDb.exec('ROLLBACK');
    console.error(`[SyncAPI] Import of ${id} failed:`, err);
    return NextResponse.json({ error: `Import failed: ${err.message}` }, { status: 500 });
  }
  console.log(`[SyncAPI] Imported ${id} from a PC: ${JSON.stringify(counts)}`);
  return NextResponse.json({ success: true, counts });
}
