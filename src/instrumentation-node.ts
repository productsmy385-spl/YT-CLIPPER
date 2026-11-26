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
  const { publishingScheduler } = await import('./lib/publishing/scheduler');
  publishingScheduler.startDaemon(Number(process.env.SCHEDULER_INTERVAL_SECONDS || 30) * 1000);
}
