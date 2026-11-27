import fs from 'node:fs';
import path from 'node:path';
import { rawDb } from '../../db/index.ts';
import { STORAGE_DIR } from '../app-paths.ts';
import { activeJobFor } from '../jobs/queue.ts';
import { pushTarget, pushProjectToProduction } from './push.ts';
import { isValidProjectId } from './sync-core.ts';

/**
 * Automatic "Send to production" (PC only). With AUTO_SYNC_TO_PRODUCTION=true plus PRODUCTION_URL and SYNC_TOKEN,
 * the local server re-sends every finished project whose shorts changed since its last sync: new projects, editor
 * saves and re-renders reach production within about a minute, with no button to press.
 *
 * State (what was last sent) lives in storage/sync-state.json rather than the database, so it is never replicated
 * anywhere. Production must not enable this (it has no PRODUCTION_URL).
 */

const STATE_FILE = path.join(STORAGE_DIR, 'sync-state.json');
const INTERVAL_MS = 30_000;
const RETRY_AFTER_MS = 5 * 60_000;
const G = globalThis as any;

type State = Record<string, { stamp: string; at: string; error?: string; failedAt?: string }>;

function readState(): State {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(s: State) {
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

/** Latest change to anything that is synced for this project (project row, shorts, renders). */
function changeStamp(projectId: string): string {
  const r = rawDb
    .prepare(
      `SELECT MAX(t) AS t FROM (
         SELECT updated_at AS t FROM projects WHERE id = ?
         UNION ALL SELECT updated_at FROM shorts WHERE project_id = ?
         UNION ALL SELECT COALESCE(finished_at, created_at) FROM renders WHERE project_id = ?
       )`
    )
    .get(projectId, projectId, projectId) as any;
  return String(r?.t || '');
}

export function autoSyncEnabled(): boolean {
  return process.env.AUTO_SYNC_TO_PRODUCTION === 'true' && Boolean(pushTarget());
}

export function syncStatus(projectId: string) {
  const s = readState()[projectId];
  if (!s) return null;
  return { syncedAt: s.at, upToDate: s.stamp === changeStamp(projectId), error: s.error || null };
}

async function sweep() {
  // Finished projects with at least one ready short (the new engine); nothing mid-processing or mid-render.
  const candidates = rawDb
    .prepare(
      `SELECT DISTINCT p.id FROM projects p JOIN shorts s ON s.project_id = p.id
       WHERE s.status = 'ready' AND p.status = 'ready' AND (p.is_deleted = 0 OR p.is_deleted IS NULL)
       ORDER BY p.updated_at DESC`
    )
    .all() as any[];
  for (const { id } of candidates) {
    if (!isValidProjectId(id) || activeJobFor(id)) continue;
    const state = readState();
    const prev = state[id];
    const stamp = changeStamp(id);
    if (prev?.stamp === stamp && !prev.error) continue;
    if (prev?.error && prev.failedAt && Date.now() - Date.parse(prev.failedAt) < RETRY_AFTER_MS && prev.stamp === stamp) continue;
    try {
      const r = await pushProjectToProduction(id, (m) => console.log(`[AutoSync] ${id}: ${m}`));
      // Re-read: the project may have changed while it was uploading; then the next sweep sends it again.
      const s = readState();
      s[id] = { stamp, at: new Date().toISOString() };
      writeState(s);
      console.log(`[AutoSync] ${id} is on production (${r.filesSent} file(s) sent, ${(r.bytesSent / 1048576).toFixed(1)} MB).`);
    } catch (err: any) {
      const s = readState();
      s[id] = { stamp, at: prev?.at || '', error: err.message, failedAt: new Date().toISOString() };
      writeState(s);
      console.error(`[AutoSync] ${id} could not be sent: ${err.message} (will retry in 5 min or after the next change)`);
    }
  }
}

export function startAutoSync() {
  if (G.__gta6AutoSync || !autoSyncEnabled()) return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await sweep();
    } catch (err: any) {
      console.error('[AutoSync] Sweep failed:', err.message);
    } finally {
      running = false;
    }
  };
  G.__gta6AutoSync = setInterval(tick, INTERVAL_MS);
  setTimeout(tick, 5_000);
  console.log(`[AutoSync] Sending finished projects to ${new URL(pushTarget()!.url).host} automatically (every ${INTERVAL_MS / 1000}s).`);
}
