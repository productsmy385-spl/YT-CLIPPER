// Node.js server startup:
//  1. restore the database from PostgreSQL (a fresh container gets every connection, project and job), then
//  2. start the background worker that runs processing / render jobs.
import { dbReady } from './db/index';
import { startWorker } from './lib/jobs/worker';

await dbReady;
if (process.env.WORKER_DISABLED === 'true') {
  console.log('[Startup] WORKER_DISABLED=true: this process will not run background jobs.');
} else {
  startWorker();
  // PC only: keep production in step with finished local projects (no-op unless AUTO_SYNC_TO_PRODUCTION=true).
  const { startAutoSync } = await import('./lib/sync/auto-push');
  startAutoSync();
  const { publishingScheduler } = await import('./lib/publishing/scheduler');
  publishingScheduler.startDaemon(Number(process.env.SCHEDULER_INTERVAL_SECONDS || 30) * 1000);
}
