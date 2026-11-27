import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { rawDb } from '../../db/index.ts';
import { STORAGE_DIR } from '../app-paths.ts';
import { activeJobFor } from '../jobs/queue.ts';
import { SYNC_TABLES, mapRowPaths, toPortablePath, isValidProjectId, MIN_TOKEN_LENGTH } from './sync-core.ts';

/**
 * "Send to production": copy one finished local project (its files under storage/projects/<id>/ and its rows) to
 * the production server, so work done on this PC shows up there. Production then owns the copy: edits and
 * re-renders made there do not flow back, and pushing again replaces production's copy with this PC's.
 */

export interface PushTarget {
  url: string;
  token: string;
}

/** Production URL + token from PRODUCTION_URL / SYNC_TOKEN, or null when this server is not set up to push. */
export function pushTarget(): PushTarget | null {
  const url = (process.env.PRODUCTION_URL || '').trim().replace(/\/+$/, '');
  const token = process.env.SYNC_TOKEN || '';
  if (!/^https?:\/\//.test(url) || token.length < MIN_TOKEN_LENGTH) return null;
  return { url, token };
}

function walk(dir: string, out: string[]) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && !/\.(incoming-|part\.)/.test(e.name)) out.push(p);
  }
}

async function call(t: PushTarget, method: string, route: string, init: RequestInit = {}) {
  const res = await fetch(`${t.url}${route}`, { ...init, method, headers: { ...(init.headers || {}), Authorization: `Bearer ${t.token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Production refused ${method} ${route.split('?')[0]} (${res.status}): ${body.error || res.statusText}`);
  return body;
}

export interface PushResult {
  projectId: string;
  filesSent: number;
  filesSkipped: number;
  bytesSent: number;
  counts: Record<string, number>;
  url: string;
}

export async function pushProjectToProduction(projectId: string, onProgress: (msg: string) => void = () => {}): Promise<PushResult> {
  const t = pushTarget();
  if (!t) throw new Error('Set PRODUCTION_URL and SYNC_TOKEN in this computer\'s .env to send projects to production.');
  if (!isValidProjectId(projectId)) throw new Error('Invalid project id.');
  const project = rawDb.prepare(`SELECT id, status FROM projects WHERE id = ?`).get(projectId) as any;
  if (!project) throw new Error('Project not found.');
  if (activeJobFor(projectId) || project.status === 'in_progress') throw new Error('Wait for this project to finish processing before sending it.');

  // 1. Rows, with storage paths made portable.
  const rows: Record<string, any[]> = {};
  for (const { table, key } of SYNC_TABLES) {
    rows[table] = (rawDb.prepare(`SELECT * FROM ${table} WHERE ${key} = ?`).all(projectId) as any[]).map((r) =>
      mapRowPaths({ ...r }, (s) => toPortablePath(s, STORAGE_DIR))
    );
  }
  const external = rows.media_assets.map((r) => r.file_path).filter((p) => typeof p === 'string' && !p.startsWith(`@storage/projects/${projectId}/`));
  if (external.length) throw new Error('This project\'s source video is stored outside its project folder (created by an older version), so it cannot be sent.');

  // 2. Files production does not have yet (compared by size).
  const remote: Record<string, number> = (await call(t, 'GET', `/api/sync/projects/${projectId}/files`)).files || {};
  const local: string[] = [];
  walk(path.join(STORAGE_DIR, 'projects', projectId), local);
  let filesSent = 0, filesSkipped = 0, bytesSent = 0;
  for (const [i, file] of local.entries()) {
    const rel = path.relative(STORAGE_DIR, file).split(path.sep).join('/');
    const size = fs.statSync(file).size;
    if (remote[rel] === size) {
      filesSkipped++;
      continue;
    }
    onProgress(`Uploading ${rel} (${(size / 1048576).toFixed(1)} MB, file ${i + 1} of ${local.length})`);
    await call(t, 'PUT', `/api/sync/projects/${projectId}/files?path=${encodeURIComponent(rel)}`, {
      body: Readable.toWeb(fs.createReadStream(file)) as any,
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(size) },
      // @ts-expect-error Node fetch needs this for streamed request bodies
      duplex: 'half',
    });
    filesSent++;
    bytesSent += size;
  }

  // 3. Rows last, so production never points at a file that has not arrived.
  onProgress('Saving the project on production');
  const imported = await call(t, 'POST', `/api/sync/projects/${projectId}/import`, {
    body: JSON.stringify({ rows }),
    headers: { 'Content-Type': 'application/json' },
  });
  return { projectId, filesSent, filesSkipped, bytesSent, counts: imported.counts || {}, url: `${t.url}/projects/${projectId}` };
}
