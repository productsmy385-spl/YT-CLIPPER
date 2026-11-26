// End-to-end test of the unified engine without the web server:
//   upload -> 6 agents -> shorts -> render -> QC -> edit -> re-render -> regenerate
// Runs in an isolated SQLite file + storage dir. Uses real FFmpeg and (if GEMINI_API_KEY is set) real Gemini.
// Usage: node scripts/test-pipeline-e2e.mjs <video-file> [TEST_DATABASE_URL]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const video = process.argv[2];
const isUrl = /^https?:\/\//.test(video || '');
if (!video || (!isUrl && !fs.existsSync(video))) { console.error('usage: node scripts/test-pipeline-e2e.mjs <video-file | youtube-url>'); process.exit(2); }

// Load .env for API keys, but never the production DATABASE_URL.
if (fs.existsSync('.env')) {
  for (const l of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(l);
    if (m && m[1] !== 'DATABASE_URL') process.env[m[1]] ??= m[2].replace(/^"|"$/g, '');
  }
}
delete process.env.DATABASE_URL;
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gta6-e2e-'));
process.env.STORAGE_DIR = path.join(root, 'storage');
process.env.SQLITE_PATH = path.join(root, 'test.db');
console.log('Isolated test root:', root);

const { dbReady } = await import('../src/db/index.ts');
await dbReady;
const { dbRepo } = await import('../src/db/repository.ts');
const { STORAGE_UPLOADS_DIR } = await import('../src/lib/app-paths.ts');
const { enqueueJob, getJob } = await import('../src/lib/jobs/queue.ts');
const { startWorker } = await import('../src/lib/jobs/worker.ts');
const store = await import('../src/lib/studio/store.ts');
const { probe } = await import('../src/lib/media/ff.ts');
const { flushReplication, getReplicationStats } = await import('../src/db/postgres.ts');

const failures = [];
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures.push(name); };

async function waitJob(id, label) {
  let last = '';
  for (;;) {
    const j = getJob(id);
    const line = `${j.status} ${j.progress}% [${j.stage}] ${j.message}`;
    if (line !== last) { console.log(`  ${label}: ${line}`); last = line; }
    if (['completed', 'failed', 'cancelled'].includes(j.status)) return j;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

startWorker({ concurrency: 1 });

// 1. Upload (copy into uploads dir as the upload API would)
const projectId = `proj_e2e_${Date.now()}`;
const common = { durations: [30], maxShorts: 3, aspect: '9:16', captionPreset: 'bold_pop', removeDeadAir: true };
let payload;
if (isUrl) {
  dbRepo.createProject({ id: projectId, title: 'E2E YouTube test', sourceUrl: video });
  payload = { sourceType: 'youtube', sourceUrl: video, ...common };
} else {
  const uploadName = `test_${Date.now()}${path.extname(video)}`;
  fs.copyFileSync(video, path.join(STORAGE_UPLOADS_DIR, uploadName));
  dbRepo.createProject({ id: projectId, title: 'E2E test', sourceFile: uploadName });
  payload = { sourceType: 'upload', uploadFile: uploadName, ...common };
}
const t0 = Date.now();
const job = enqueueJob({ type: 'process_project', projectId, payload });
const done = await waitJob(job.id, 'process');
check('Pipeline job completed', done.status === 'completed', done.error || done.message);
console.log(`  took ${((Date.now() - t0) / 1000).toFixed(0)}s`);

const logs = dbRepo.getAgentLogs(projectId);
const agentNames = [...new Set(logs.filter((l) => l.status === 'completed').map((l) => l.agent_name || l.agentName))];
check('All six agents recorded executions', agentNames.length >= 6, agentNames.join(', '));

const asset = store.getProjectAsset(projectId);
check('Media asset stored with probe + waveform', Boolean(asset?.probe && asset.waveform), asset ? `${asset.probe?.width}x${asset.probe?.height} ${asset.probe?.duration?.toFixed(1)}s, ${asset.waveform?.length} peaks` : 'missing');
console.log(`  transcript segments: ${asset?.transcript?.transcript?.segments?.length ?? 0}; ai: ${JSON.stringify(asset?.transcript?.ai)}`);
console.log(`  visual events: ${asset?.analysis?.video?.events?.length ?? 0}; ai: ${JSON.stringify(asset?.analysis?.video?.ai)}`);

const shorts = store.listShorts(projectId);
check('Shorts generated', shorts.length > 0, `${shorts.length}`);
for (const s of shorts) {
  const ok = s.status === 'ready' && s.outputPath && fs.existsSync(s.outputPath);
  console.log(`  #${s.rank} [${s.status}] ${s.startTime.toFixed(1)}-${s.endTime.toFixed(1)} "${s.title}" — ${s.reason?.slice(0, 100)}`);
  console.log(`     segments=${s.edit.segments.length} cues=${s.edit.captions.cues.length} qc=${s.qc?.passed} ${s.qc?.checks?.filter((c) => !c.ok).map((c) => c.name + ':' + c.detail).join('; ')}`);
  if (ok) {
    const p = await probe(s.outputPath);
    check(`Short ${s.rank} is 1080x1920 H.264/AAC`, p.width === 1080 && p.height === 1920 && p.videoCodec === 'h264' && p.audioCodec === 'aac', `${p.width}x${p.height} ${p.videoCodec}/${p.audioCodec} ${p.duration.toFixed(2)}s`);
  }
}
const ready = shorts.filter((s) => s.status === 'ready');
check('At least one short ready', ready.length > 0);

// 2. Edit -> re-render
if (ready[0]) {
  const s = ready[0];
  const edit = structuredClone(s.edit);
  edit.aspect = '1:1';
  edit.framing.mode = 'blur';
  const seg = edit.segments[0];
  const mid = (seg.start + seg.end) / 2;
  edit.segments.splice(0, 1, { ...seg, end: mid }, { id: 'seg_split', start: mid, end: seg.end, speed: 1.25 });
  edit.texts.push({ id: 't1', text: 'EDITED', start: 0, end: 2, x: 0.5, y: 0.1, size: 80, color: '#FFD400', font: 'Anton', box: true });
  edit.captions.style.position = 'top';
  store.saveShortEdit(s.id, edit, { title: s.title + ' (edited)' });
  const rj = enqueueJob({ type: 'render_short', projectId, shortId: s.id });
  const rdone = await waitJob(rj.id, 'render');
  const after = store.getShort(s.id);
  check('Edited render completed', rdone.status === 'completed', rdone.error || '');
  if (after?.outputPath && fs.existsSync(after.outputPath)) {
    const p = await probe(after.outputPath);
    const { totalOutputDuration } = await import('../src/lib/render/edit-doc.ts');
    check('Edited output is 1080x1080 and matches edited duration', p.width === 1080 && p.height === 1080 && Math.abs(p.duration - totalOutputDuration(edit)) < 0.35, `${p.width}x${p.height} ${p.duration.toFixed(2)}s vs ${totalOutputDuration(edit).toFixed(2)}s`);
  }
  check('Render history recorded', store.listRenders(s.id).length >= 2, `${store.listRenders(s.id).length} renders`);

  // 3. Regenerate with a different duration
  const gj = enqueueJob({ type: 'regenerate_short', projectId, shortId: s.id, payload: { duration: 15 } });
  const gdone = await waitJob(gj.id, 'regenerate');
  const regen = store.getShort(s.id);
  check('Regenerate completed', gdone.status === 'completed', gdone.error || '');
  check('Regenerated clip is ~15s', regen && Math.abs(regen.endTime - regen.startTime - 15) < 5, regen ? `${(regen.endTime - regen.startTime).toFixed(1)}s "${regen.title}"` : '');
}

// 4. Corrupted input is rejected with a clear message
const badName = `bad_${Date.now()}.mp4`;
const buf = isUrl ? Buffer.from('not a video at all, just bytes'.repeat(1000)) : fs.readFileSync(video).subarray(0, 200_000);
fs.writeFileSync(path.join(STORAGE_UPLOADS_DIR, badName), buf);
const badProject = `proj_bad_${Date.now()}`;
dbRepo.createProject({ id: badProject, title: 'Bad', sourceFile: badName });
const bj = enqueueJob({ type: 'process_project', projectId: badProject, payload: { sourceType: 'upload', uploadFile: badName, durations: [30], maxShorts: 2, aspect: '9:16', captionPreset: 'bold_pop', removeDeadAir: true } });
const bdone = await waitJob(bj.id, 'corrupt');
check('Corrupted upload fails cleanly (no retry loop)', bdone.status === 'failed' && bdone.attempts === 1, bdone.error || '');

if (process.env.DATABASE_URL) {
  await flushReplication();
  const st = getReplicationStats();
  check('PostgreSQL replication had no failures', st.failed === 0, `ok=${st.ok} failed=${st.failed} ${st.lastError || ''}`);
}

console.log(failures.length ? `\n${failures.length} FAILURE(S): ${failures.join(', ')}` : '\nALL CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
