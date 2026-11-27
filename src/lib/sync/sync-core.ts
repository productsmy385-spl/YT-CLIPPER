import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Shared pieces of the PC ↔ production link (fetch helper + "Send to production"). No app imports, so both the
 * server and scripts can use it.
 *
 * Authentication: machine-to-machine calls carry `Authorization: Bearer <SYNC_TOKEN>`. The endpoints are disabled
 * unless SYNC_TOKEN is set (≥ 24 chars) on the server, independent of APP_PASSWORD.
 */

export const MIN_TOKEN_LENGTH = 24;

export function syncTokenConfigured(): boolean {
  return (process.env.SYNC_TOKEN || '').length >= MIN_TOKEN_LENGTH;
}

/** Constant-time check of a Bearer header against SYNC_TOKEN. */
export function checkSyncToken(authorization: string | null): boolean {
  const expected = process.env.SYNC_TOKEN || '';
  if (expected.length < MIN_TOKEN_LENGTH || !authorization?.startsWith('Bearer ')) return false;
  const a = Buffer.from(authorization.slice(7).trim());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------------------------
// Portable storage paths. Rows store absolute paths (C:\...\storage\projects\x\a.mp4 locally, /app/storage/... on
// Railway). On the wire they become "@storage/projects/x/a.mp4" and are re-rooted on arrival.
// ---------------------------------------------------------------------------------------------

export const PORTABLE_PREFIX = '@storage/';

function norm(p: string) {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function toPortablePath(value: string, storageDir: string): string {
  const root = norm(storageDir);
  const v = norm(value);
  const ci = /^[a-zA-Z]:\//.test(root); // Windows paths compare case-insensitively
  const hit = ci ? v.toLowerCase().startsWith(root.toLowerCase() + '/') : v.startsWith(root + '/');
  return hit ? PORTABLE_PREFIX + v.slice(root.length + 1) : value;
}

/** Storage-relative path ("projects/x/a.mp4") or null if it is unsafe (absolute, traversal, empty). */
export function safeRelative(rel: string): string | null {
  const parts = rel.replace(/\\/g, '/').split('/').filter(Boolean);
  if (!parts.length || parts.some((p) => p === '..' || p === '.' || p.includes(':') || p.includes('\0'))) return null;
  return parts.join('/');
}

export function fromPortablePath(value: string, storageDir: string): string {
  if (!value.startsWith(PORTABLE_PREFIX)) return value;
  const rel = safeRelative(value.slice(PORTABLE_PREFIX.length));
  if (!rel) throw new Error(`Unsafe path in synced data: ${value}`);
  return path.join(storageDir, ...rel.split('/'));
}

/** Apply `fn` to every string inside a value (recursing into arrays/objects). */
export function mapStrings(v: any, fn: (s: string) => string): any {
  if (typeof v === 'string') return fn(v);
  if (Array.isArray(v)) return v.map((x) => mapStrings(x, fn));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapStrings(x, fn)]));
  return v;
}

/** Rewrite paths in one DB row. JSON columns (*_json) are parsed so paths inside them are rewritten too. */
export function mapRowPaths(row: Record<string, any>, fn: (s: string) => string): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'string' && k.endsWith('_json')) {
      try {
        out[k] = JSON.stringify(mapStrings(JSON.parse(v), fn));
        continue;
      } catch {
        /* not JSON: treat as text */
      }
    }
    out[k] = typeof v === 'string' ? fn(v) : v;
  }
  return out;
}

/**
 * Tables copied by "Send to production", keyed by how rows belong to a project. Jobs are deliberately excluded:
 * the receiving server must not pick up the sender's work.
 */
export const SYNC_TABLES: Array<{ table: string; key: 'id' | 'project_id' }> = [
  { table: 'projects', key: 'id' },
  { table: 'project_pipeline_stages', key: 'project_id' },
  { table: 'media_assets', key: 'project_id' },
  { table: 'source_videos', key: 'project_id' },
  { table: 'shorts', key: 'project_id' },
  { table: 'renders', key: 'project_id' },
  { table: 'generated_clips', key: 'project_id' },
  { table: 'agent_execution_logs', key: 'project_id' },
];

/** Project ids look like proj_<digits>_<alnum>. Anything else is rejected before touching paths or SQL. */
export function isValidProjectId(id: string): boolean {
  return /^proj_[A-Za-z0-9_]{3,80}$/.test(id);
}
