// Simulates a Railway redeploy: phase "write" persists data through the real repository into a throwaway SQLite
// file (replicated to PostgreSQL); phase "read" starts with a brand-new empty SQLite file and must restore it.
// Usage: TEST_DATABASE_URL=postgresql://... node scripts/test-db-durability.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const self = fileURLToPath(import.meta.url);
const phase = process.argv[2];

if (!phase) {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) { console.error('TEST_DATABASE_URL is required (never point this at production).'); process.exit(2); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gta6-durability-'));
  const run = (p, db) => spawnSync(process.execPath, [self, p], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, SQLITE_PATH: path.join(dir, db), STORAGE_DIR: path.join(dir, 'storage') },
  }).status;
  if (run('write', 'a.db') !== 0) process.exit(1);
  const code = run('read', 'b.db');
  console.log(code === 0 ? '\nPASS: data survived a fresh-container restart.' : '\nFAIL');
  process.exit(code);
}

const { dbReady } = await import('../src/db/index.ts');
const { dbRepo } = await import('../src/db/repository.ts');
const { flushReplication, getReplicationStats } = await import('../src/db/postgres.ts');
await dbReady;

if (phase === 'write') {
  dbRepo.saveConnectedAccount({ id: 'yt_TESTCHAN', userId: 'usr_creator_01', platform: 'youtube', accountName: 'Test Channel', accountId: 'TESTCHAN' });
  dbRepo.saveOAuthToken({ id: 'tok_yt_TESTCHAN', accountId: 'yt_TESTCHAN', platform: 'youtube', accessTokenEncrypted: 'enc-access', refreshTokenEncrypted: 'enc-refresh', scope: 'youtube', expiresAt: new Date().toISOString() });
  // Upsert again (exercises INSERT OR REPLACE -> ON CONFLICT DO UPDATE)
  dbRepo.saveOAuthToken({ id: 'tok_yt_TESTCHAN', accountId: 'yt_TESTCHAN', platform: 'youtube', accessTokenEncrypted: 'enc-access-2', refreshTokenEncrypted: 'enc-refresh', scope: 'youtube', expiresAt: new Date().toISOString() });
  dbRepo.createProject({ id: 'proj_durability', title: 'Durability', sourceUrl: 'x' });
  dbRepo.updateProjectStatus('proj_durability', 'ready', 100, 'done');
  await flushReplication();
  const s = getReplicationStats();
  console.log(`write phase: replicated ok=${s.ok} failed=${s.failed}${s.lastError ? ' last=' + s.lastError : ''}`);
  process.exit(s.failed === 0 ? 0 : 1);
}

if (phase === 'read') {
  const tok = dbRepo.getOAuthToken('yt_TESTCHAN');
  const proj = dbRepo.getProject('proj_durability');
  console.log('read phase: token=', tok?.access_token_encrypted, 'refresh=', tok?.refresh_token_encrypted, 'project status=', proj?.status);
  const ok = tok?.access_token_encrypted === 'enc-access-2' && tok?.refresh_token_encrypted === 'enc-refresh' && proj?.status === 'ready';
  process.exit(ok ? 0 : 1);
}
