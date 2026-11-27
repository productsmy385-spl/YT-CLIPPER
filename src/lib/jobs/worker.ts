import fs from 'node:fs';
import path from 'node:path';
import { dbRepo } from '../../db/repository.ts';
import { rawDb } from '../../db/index.ts';
import { STORAGE_UPLOADS_DIR, STORAGE_TMP_DIR } from '../app-paths.ts';
import { claimNextJob, completeJob, failJob, isCancelled, recoverStaleJobs, type Job } from './queue.ts';
import { runProcessProject, runRenderShort, runRegenerateShort, PipelineError, AwaitingMediaError } from '../../pipeline/pipeline.ts';
import { youtubeOAuth } from '../youtube/oauth.ts';
import * as store from '../studio/store.ts';

/**
 * In-process background worker. Started once per server process (instrumentation.ts) or by scripts/worker.mjs.
 * Long FFmpeg/AI work runs outside the request cycle, so HTTP timeouts never kill a job; job state lives in the
 * database, so a restart re-queues interrupted work instead of losing it.
 */

const G = globalThis as any;

/** Delete abandoned uploads (never turned into a project) and work dirs of jobs that are not running. */
export function sweepTemporaryFiles(runningJobIds: Set<string>, maxAgeMs = Number(process.env.UPLOAD_RETENTION_HOURS || 168) * 60 * 60_000) {
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  // Never delete a file any project still points at (older projects kept their source inside uploads/).
  const referenced = new Set<string>();
  try {
    const rows = [
      ...(rawDb.prepare(`SELECT source_file AS p FROM projects WHERE source_file IS NOT NULL`).all() as any[]),
      ...(rawDb.prepare(`SELECT file_path AS p FROM source_videos WHERE file_path IS NOT NULL`).all() as any[]),
      ...(rawDb.prepare(`SELECT file_path AS p FROM media_assets`).all() as any[]),
    ];
    for (const r of rows) referenced.add(path.basename(String(r.p)));
  } catch (err: any) {
    console.error(`[Worker] Cleanup skipped: could not read referenced files (${err.message}).`);
    return;
  }
  for (const [dir, isDir] of [[STORAGE_UPLOADS_DIR, false], [STORAGE_TMP_DIR, true]] as const) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith('.')) continue;
      const p = path.join(dir, name);
      try {
        const st = fs.statSync(p);
        if (st.mtimeMs > cutoff || (isDir && runningJobIds.has(name)) || (!isDir && referenced.has(name))) continue;
        fs.rmSync(p, { recursive: true, force: true });
        removed++;
      } catch (err: any) {
        console.error(`[Worker] Could not remove temporary ${p}: ${err.message}`);
      }
    }
  }
  if (removed) console.log(`[Worker] Cleaned up ${removed} temporary item(s).`);
}

export function startWorker(opts: { concurrency?: number } = {}) {
  if (G.__gta6Worker) return G.__gta6Worker;
  const concurrency = Math.max(1, opts.concurrency ?? Number(process.env.WORKER_CONCURRENCY || 1));
  const workerId = `worker_${process.pid}_${Date.now().toString(36)}`;
  const running = new Map<string, AbortController>();
  let lastRecover = 0;
  let lastTokenCheck = 0;
  let lastSweep = 0;
  let stopped = false;

  const recovered = recoverStaleJobs(90_000);
  if (recovered.requeued || recovered.failed) {
    console.log(`[Worker] Recovered interrupted jobs: ${recovered.requeued} re-queued, ${recovered.failed} failed (attempts exhausted).`);
  }

  async function execute(job: Job) {
    const ac = new AbortController();
    running.set(job.id, ac);
    const cancelPoll = setInterval(() => {
      if (isCancelled(job.id)) ac.abort();
    }, 2000);
    console.log(`[Worker] ▶ ${job.type} ${job.id} (project ${job.project_id}, attempt ${job.attempts}/${job.max_attempts})`);
    try {
      const msg =
        job.type === 'process_project' ? await runProcessProject(job, ac.signal, workerId)
        : job.type === 'render_short' ? await runRenderShort(job, ac.signal)
        : job.type === 'regenerate_short' ? await runRegenerateShort(job, ac.signal)
        : (() => { throw new PipelineError(`Unknown job type ${job.type}`, false); })();
      if (!isCancelled(job.id)) completeJob(job.id, msg);
      console.log(`[Worker] ✓ ${job.id}: ${msg}`);
    } catch (err: any) {
      if (ac.signal.aborted || isCancelled(job.id)) {
        console.log(`[Worker] ■ ${job.id} cancelled`);
        if (job.type === 'process_project') dbRepo.updateProjectStatus(job.project_id, 'cancelled', 0, 'Cancelled', { stageStatus: 'CANCELLED' });
        if (job.short_id) {
          const s = store.getShort(job.short_id);
          if (s && s.status === 'rendering') store.updateShort(job.short_id, { status: s.outputPath ? 'ready' : 'draft' });
        }
        return;
      }
      if (err instanceof AwaitingMediaError) {
        // Parked, not failed: the PC fetch helper's upload re-queues the project. Never retried from here.
        completeJob(job.id, err.message);
        console.log(`[Worker] ⏸ ${job.id}: ${err.message}`);
        return;
      }
      const retryable = err instanceof PipelineError ? err.retryable : true;
      const message = String(err?.message || err).slice(0, 1000);
      const requeued = failJob(job.id, message, retryable);
      console.error(`[Worker] ✗ ${job.id}: ${message}${requeued ? ' (will retry)' : ''}`);
      if (job.type === 'process_project') {
        if (requeued) dbRepo.updateProjectStatus(job.project_id, 'in_progress', 0, `Retrying after error: ${message}`.slice(0, 300), { stageStatus: 'ACTIVE' });
        else dbRepo.updateProjectStatus(job.project_id, 'error', 0, message.slice(0, 300), { stageStatus: 'FAILED', errorMessage: message });
      } else if (job.short_id && !requeued) {
        const s = store.getShort(job.short_id);
        if (s && s.status === 'rendering') store.updateShort(job.short_id, { status: 'failed' });
      }
    } finally {
      clearInterval(cancelPoll);
      running.delete(job.id);
    }
  }

  const tick = async () => {
    if (stopped) return;
    const now = Date.now();
    try {
      if (now - lastRecover > 30_000) {
        lastRecover = now;
        recoverStaleJobs(90_000);
      }
      if (now - lastTokenCheck > 5 * 60_000) {
        lastTokenCheck = now;
        youtubeOAuth.refreshIfExpiringSoon().catch(() => {});
      }
      if (now - lastSweep > 60 * 60_000) {
        lastSweep = now;
        sweepTemporaryFiles(new Set(running.keys()));
      }
      while (running.size < concurrency) {
        const job = claimNextJob(workerId);
        if (!job) break;
        execute(job);
      }
    } catch (err: any) {
      console.error('[Worker] Tick failed:', err.message);
    }
  };

  const interval = setInterval(tick, 1500);
  tick();
  console.log(`[Worker] Started ${workerId} (concurrency ${concurrency}).`);

  G.__gta6Worker = {
    workerId,
    running,
    /** Stop claiming work. Running jobs are not cancelled: if the process exits, they are re-queued on next boot. */
    async stop() {
      stopped = true;
      clearInterval(interval);
    },
  };
  return G.__gta6Worker;
}
