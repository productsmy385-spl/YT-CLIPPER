import { rawDb } from '../../db/index.ts';

/**
 * Durable job queue stored in the database (SQLite, replicated to PostgreSQL).
 * Jobs survive HTTP timeouts and server restarts: on boot, jobs left "running" by a dead process are re-queued
 * (or failed once their attempts are used up). Workers claim jobs atomically.
 */

export type JobType = 'process_project' | 'render_short' | 'regenerate_short';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  project_id: string;
  short_id: string | null;
  type: JobType;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  payload_json: string | null;
  progress: number;
  stage: string | null;
  message: string | null;
  error: string | null;
  worker_id: string | null;
  heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

const now = () => new Date().toISOString();

export function enqueueJob(p: { type: JobType; projectId: string; shortId?: string; payload?: any; maxAttempts?: number }): Job {
  const id = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const t = now();
  rawDb
    .prepare(
      `INSERT INTO jobs (id, project_id, short_id, type, status, attempts, max_attempts, payload_json, progress, stage, message, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', 0, ?, ?, 0, 'queued', 'Waiting for a worker', ?, ?)`
    )
    .run(id, p.projectId, p.shortId || null, p.type, p.maxAttempts ?? 2, p.payload ? JSON.stringify(p.payload) : null, t, t);
  return getJob(id)!;
}

export function getJob(id: string): Job | null {
  return (rawDb.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as unknown as Job) || null;
}

export function listJobs(projectId: string): Job[] {
  return rawDb.prepare(`SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC`).all(projectId) as unknown as Job[];
}

export function activeJobFor(projectId: string, type?: JobType, shortId?: string): Job | null {
  const rows = rawDb
    .prepare(`SELECT * FROM jobs WHERE project_id = ? AND status IN ('queued','running') ORDER BY created_at DESC`)
    .all(projectId) as unknown as Job[];
  return rows.find((j) => (!type || j.type === type) && (!shortId || j.short_id === shortId)) || null;
}

/** Atomically claim the oldest queued job. */
export function claimNextJob(workerId: string, types?: JobType[]): Job | null {
  const candidates = rawDb.prepare(`SELECT id, type FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 20`).all() as any[];
  for (const c of candidates) {
    if (types && !types.includes(c.type)) continue;
    const t = now();
    const res = rawDb
      .prepare(
        `UPDATE jobs SET status = 'running', attempts = attempts + 1, worker_id = ?, heartbeat_at = ?, started_at = ?, updated_at = ?, error = NULL
         WHERE id = ? AND status = 'queued'`
      )
      .run(workerId, t, t, t, c.id);
    if (Number(res.changes) === 1) return getJob(c.id);
  }
  return null;
}

export function updateJobProgress(id: string, progress: number, stage: string, message: string) {
  const t = now();
  rawDb
    .prepare(`UPDATE jobs SET progress = ?, stage = ?, message = ?, heartbeat_at = ?, updated_at = ? WHERE id = ? AND status = 'running'`)
    .run(Math.max(0, Math.min(100, Math.round(progress))), stage, message, t, t, id);
}

export function heartbeat(id: string) {
  const t = now();
  rawDb.prepare(`UPDATE jobs SET heartbeat_at = ?, updated_at = ? WHERE id = ? AND status = 'running'`).run(t, t, id);
}

export function completeJob(id: string, message: string) {
  const t = now();
  rawDb
    .prepare(`UPDATE jobs SET status = 'completed', progress = 100, stage = 'completed', message = ?, finished_at = ?, updated_at = ?, heartbeat_at = ? WHERE id = ?`)
    .run(message, t, t, t, id);
}

/** Fail a job; re-queue it if it is retryable and has attempts left. Returns true if it was re-queued. */
export function failJob(id: string, error: string, retryable: boolean): boolean {
  const job = getJob(id);
  if (!job) return false;
  const t = now();
  if (retryable && job.attempts < job.max_attempts) {
    rawDb
      .prepare(`UPDATE jobs SET status = 'queued', error = ?, message = ?, worker_id = NULL, updated_at = ? WHERE id = ?`)
      .run(error, `Retrying after error: ${error}`.slice(0, 500), t, id);
    return true;
  }
  rawDb.prepare(`UPDATE jobs SET status = 'failed', error = ?, message = ?, finished_at = ?, updated_at = ? WHERE id = ?`).run(error, error.slice(0, 500), t, t, id);
  return false;
}

export function requestCancel(id: string): boolean {
  const t = now();
  const res = rawDb
    .prepare(`UPDATE jobs SET status = 'cancelled', message = 'Cancelled by user', finished_at = ?, updated_at = ? WHERE id = ? AND status IN ('queued','running')`)
    .run(t, t, id);
  return Number(res.changes) === 1;
}

export function isCancelled(id: string): boolean {
  return (rawDb.prepare(`SELECT status FROM jobs WHERE id = ?`).get(id) as any)?.status === 'cancelled';
}

/**
 * Jobs whose worker stopped heartbeating (process restarted / crashed). On boot every "running" job belongs to
 * a dead process, so pass staleMs = 0 then.
 */
export function recoverStaleJobs(staleMs: number): { requeued: number; failed: number } {
  const cutoff = new Date(Date.now() - staleMs).toISOString();
  const stale = rawDb.prepare(`SELECT * FROM jobs WHERE status = 'running' AND (heartbeat_at IS NULL OR heartbeat_at < ?)`).all(cutoff) as unknown as Job[];
  let requeued = 0;
  let failed = 0;
  for (const j of stale) {
    if (failJob(j.id, 'The server restarted while this job was running.', true)) requeued++;
    else failed++;
  }
  return { requeued, failed };
}
