// Full user workflow through the real HTTP API (the same calls the UI makes), against a running server.
//   node scripts/test-http-workflow.mjs <baseUrl> <password> upload <video-file>
//   node scripts/test-http-workflow.mjs <baseUrl> <password> youtube <url>
// Verifies: source intake -> processing -> 3 distinct shorts -> editor payload -> downloads (FFprobe) ->
// edits (trim, captions, aspect, speed) -> re-render reflects edits -> regenerate -> version history -> auth.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [base, password, mode, source] = process.argv.slice(2);
if (!base || !mode || !source) { console.error('usage: <baseUrl> <password> upload|youtube <file|url>'); process.exit(2); }
const auth = { Authorization: 'Basic ' + Buffer.from(`test:${password}`).toString('base64') };
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gta6-http-'));
const failures = [];
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures.push(name); return ok; };
const api = async (p, init = {}) => {
  const res = await fetch(base + p, { ...init, headers: { ...auth, ...(init.headers || {}) } });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
};
const json = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const ffprobe = (f) => {
  const r = spawnSync(process.env.FFPROBE || 'ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', f], { encoding: 'utf8' });
  const j = JSON.parse(r.stdout || '{}');
  const v = (j.streams || []).find((s) => s.codec_type === 'video');
  const a = (j.streams || []).find((s) => s.codec_type === 'audio');
  return { duration: Number(j.format?.duration || 0), width: v?.width, height: v?.height, vcodec: v?.codec_name, acodec: a?.codec_name };
};
const download = async (url, name) => {
  const res = await fetch(base + url, { headers: auth });
  const file = path.join(outDir, name);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return { status: res.status, file, disposition: res.headers.get('content-disposition') };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const totalDuration = (edit) => edit.segments.reduce((a, s) => a + (s.end - s.start) / s.speed, 0);
const overlap = (a, b) => Math.max(0, Math.min(a.endTime, b.endTime) - Math.max(a.startTime, b.startTime));

async function waitShortJob(id, label) {
  let last = '';
  for (let i = 0; i < 1800; i++) {
    const r = await api(`/api/shorts/${id}`);
    const j = r.json;
    const line = j.job ? `${j.job.type} ${j.job.status} ${j.job.progress}% ${j.job.message || ''}` : `done (${j.lastJob?.status})`;
    if (line !== last) { console.log(`  ${label}: ${line}`); last = line; }
    if (!j.job) return j;
    await sleep(2000);
  }
  throw new Error('timeout');
}

// ---------------------------------------------------------------------------------------------
check('Unauthenticated request is rejected', (await fetch(base + '/api/projects')).status === 401);

let sourcePayload;
if (mode === 'upload') {
  const stat = fs.statSync(source);
  const t = Date.now();
  const res = await fetch(base + '/api/upload', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/octet-stream', 'x-file-name': encodeURIComponent(path.basename(source)), 'Content-Length': String(stat.size) },
    body: fs.createReadStream(source),
    duplex: 'half',
  });
  const up = await res.json();
  check('Upload accepted and FFprobe-validated', res.status === 200 && up.uploadId && up.duration > 0 && up.hasAudio, `${(stat.size / 1048576).toFixed(1)} MB in ${((Date.now() - t) / 1000).toFixed(1)}s, ${up.width}x${up.height}, ${up.duration?.toFixed(1)}s, audio=${up.hasAudio}`);
  sourcePayload = { type: 'upload', uploadId: up.uploadId, fileName: path.basename(source) };
  const bad = await api('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'x-file-name': 'notes.txt' }, body: 'hello' });
  check('Unsupported file type rejected', bad.status === 415);
} else {
  const r = await api('/api/ingest', json({ url: source }));
  const v = r.json?.video;
  check('YouTube URL inspected', r.status === 200 && v?.videoId, v ? `"${v.title}" by ${v.channelTitle}, ${v.durationSeconds}s, ${v.privacyStatus}` : r.text);
  check('YouTube video is acquirable', v?.canAcquire === true, v?.message || '');
  const bad = await api('/api/ingest', json({ url: 'https://example.com/x' }));
  check('Invalid URL rejected with message', bad.status === 422 && bad.json?.error);
  sourcePayload = { type: 'youtube', url: source };
}

const created = await api('/api/projects', json({ source: sourcePayload, options: { durations: [30], maxShorts: 3, aspect: '9:16', captionPreset: 'bold_pop' } }));
check('Project created and queued', created.status === 200 && created.json?.projectId, created.text.slice(0, 200));
const projectId = created.json.projectId;

// SSE delivers real state
const sse = await fetch(`${base}/api/projects/${projectId}/events`, { headers: auth });
const reader = sse.body.getReader();
const first = new TextDecoder().decode((await reader.read()).value || new Uint8Array());
reader.cancel();
check('SSE stream delivers project state', sse.headers.get('content-type')?.includes('text/event-stream') && first.includes('"stages"'));

let snap;
const t0 = Date.now();
let lastLine = '';
for (;;) {
  snap = (await api(`/api/projects/${projectId}`)).json;
  const line = `${snap.project.status} ${snap.project.progress}% ${snap.project.currentStage}`;
  if (line !== lastLine) { console.log(`  processing: ${line}`); lastLine = line; }
  if (['ready', 'error', 'cancelled'].includes(snap.project.status) && !(snap.job && ['queued', 'running'].includes(snap.job.status))) break;
  await sleep(3000);
}
console.log(`  processing took ${((Date.now() - t0) / 1000).toFixed(0)}s`);
check('Processing completed', snap.project.status === 'ready', snap.job?.error || snap.project.error || '');
check('All 12 stages completed', snap.stages.filter((s) => s.status === 'COMPLETED').length === 12, snap.stages.map((s) => `${s.n}:${s.status}`).join(' '));
check('Source has video and audio streams', snap.asset?.probe?.hasVideo && snap.asset?.probe?.hasAudio, `${snap.asset?.probe?.width}x${snap.asset?.probe?.height} ${snap.asset?.probe?.videoCodec}/${snap.asset?.probe?.audioCodec}`);
check('AI audio agent ran on real audio', snap.asset?.ai?.audio?.used === true, JSON.stringify(snap.asset?.ai?.audio));
check('AI video agent ran on real frames', snap.asset?.ai?.video?.used === true, JSON.stringify(snap.asset?.ai?.video));
const agentNames = [...new Set((snap.agentLogs || []).filter((l) => l.status === 'completed').map((l) => l.agent_name))];
check('Six agents have execution records', agentNames.length >= 6, agentNames.join(', '));

const shorts = snap.shorts;
check('Three shorts generated', shorts.length === 3, `${shorts.length}`);
check('All shorts rendered and passed QC', shorts.every((s) => s.status === 'ready' && s.qc?.passed), shorts.map((s) => `${s.status}/${s.qc?.passed}`).join(' '));
let distinct = true;
for (let i = 0; i < shorts.length; i++) for (let j = i + 1; j < shorts.length; j++) {
  const o = overlap(shorts[i], shorts[j]);
  if (o > 0.2 * Math.min(shorts[i].endTime - shorts[i].startTime, shorts[j].endTime - shorts[j].startTime)) distinct = false;
}
check('Shorts are genuinely different moments (≤20% overlap)', distinct && new Set(shorts.map((s) => s.title)).size === shorts.length);
for (const s of shorts) console.log(`  #${s.rank} ${s.startTime.toFixed(1)}-${s.endTime.toFixed(1)}s (${s.duration.toFixed(1)}s) "${s.title}"\n      ${s.reason}`);

// Open each short in the editor and download it
for (const s of shorts) {
  const ed = await api(`/api/shorts/${s.id}`);
  const e = ed.json;
  const preview = await fetch(base + e.source.previewUrl, { headers: { ...auth, Range: 'bytes=0-1023' } });
  check(`Short ${s.rank}: editor payload loads (edit doc, waveform, playable source)`, ed.status === 200 && e.edit?.segments?.length > 0 && e.waveform?.peaks?.length > 0 && preview.status === 206, `${e.edit.segments.length} segments, ${e.edit.captions.cues.length} cues, preview ${preview.status}`);
  const dl = await download(s.downloadUrl, `short_${s.rank}.mp4`);
  const p = ffprobe(dl.file);
  check(`Short ${s.rank}: download is a valid 1080x1920 H.264/AAC MP4 of the right length`, dl.status === 200 && /attachment/.test(dl.disposition || '') && p.width === 1080 && p.height === 1920 && p.vcodec === 'h264' && p.acodec === 'aac' && Math.abs(p.duration - totalDuration(e.edit)) < 0.4, `${p.width}x${p.height} ${p.vcodec}/${p.acodec} ${p.duration.toFixed(2)}s`);
}

// Edit short 1: trim, caption text, aspect ratio -> re-render
{
  const s = shorts[0];
  const e = (await api(`/api/shorts/${s.id}`)).json.edit;
  const seg = e.segments[0];
  seg.start = +(seg.start + 2).toFixed(2);
  const last = e.segments[e.segments.length - 1];
  last.end = +(last.end - 1).toFixed(2);
  e.aspect = '1:1';
  e.framing.mode = 'blur';
  const cue = e.captions.cues.find((c) => c.start >= seg.start + 0.5 && c.end <= last.end) || null;
  if (cue) {
    cue.text = 'EDITED CAPTION';
    cue.words = [{ start: cue.start, end: (cue.start + cue.end) / 2, text: 'EDITED', highlight: true }, { start: (cue.start + cue.end) / 2, end: cue.end, text: 'CAPTION' }];
  } else {
    e.captions.cues.push({ id: 'cue_test', start: seg.start + 1, end: seg.start + 2.5, text: 'EDITED CAPTION', words: [{ start: seg.start + 1, end: seg.start + 1.7, text: 'EDITED', highlight: true }, { start: seg.start + 1.7, end: seg.start + 2.5, text: 'CAPTION' }] });
    e.captions.enabled = true;
  }
  e.captions.style.font = 'Anton';
  const saved = await api(`/api/shorts/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ edit: e, title: s.title + ' (edited)' }) });
  check('Edit saved (trim + caption + 1:1)', saved.status === 200 && saved.json.short.version > s.version);
  const reloaded = (await api(`/api/shorts/${s.id}`)).json;
  check('Saved edits persist on reload', reloaded.edit.aspect === '1:1' && reloaded.edit.captions.cues.some((c) => c.text === 'EDITED CAPTION') && reloaded.short.title.endsWith('(edited)'));
  await api(`/api/shorts/${s.id}/render`, { method: 'POST' });
  const done = await waitShortJob(s.id, 'edit render');
  check('Edited render completed and passed QC', done.lastJob?.status === 'completed' && done.short.qc?.passed, done.lastJob?.error || '');
  const dl = await download(done.short.downloadUrl, 'short_1_edited.mp4');
  const p = ffprobe(dl.file);
  const expected = totalDuration(reloaded.edit);
  check('Re-render reflects edits: 1080x1080 and trimmed length', p.width === 1080 && p.height === 1080 && Math.abs(p.duration - expected) < 0.4 && expected < shorts[0].duration - 2.5, `${p.width}x${p.height} ${p.duration.toFixed(2)}s (expected ${expected.toFixed(2)}s; was ${shorts[0].duration.toFixed(2)}s)`);
  // Grab the frame where the edited caption is on screen, for visual confirmation.
  const c = reloaded.edit.captions.cues.find((x) => x.text === 'EDITED CAPTION');
  let at = 0;
  for (const sg of reloaded.edit.segments) { if (c.start >= sg.start && c.start <= sg.end) { at += (c.start - sg.start) / sg.speed + 0.3; break; } at += (sg.end - sg.start) / sg.speed; }
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(at), '-i', dl.file, '-frames:v', '1', '-vf', 'scale=480:-2,format=yuvj420p', path.join(outDir, 'edited_caption_frame.jpg')]);
  console.log(`  caption frame: ${path.join(outDir, 'edited_caption_frame.jpg')}`);
  check('Render history keeps the earlier version', done.renders.length >= 2 && done.renders.filter((r) => r.status === 'completed').length >= 2, `${done.renders.length} renders`);
  const older = done.renders.find((r) => r.editVersion < done.short.version && r.downloadUrl);
  const odl = older ? await download(older.downloadUrl, 'short_1_v_old.mp4') : null;
  check('Previous render still downloadable', Boolean(odl && odl.status === 200 && ffprobe(odl.file).height === 1920));
}

// Short 2: change duration via speed, 16:9
{
  const s = shorts[1];
  const e = (await api(`/api/shorts/${s.id}`)).json.edit;
  e.segments.forEach((x) => (x.speed = 1.5));
  e.aspect = '16:9';
  e.framing.mode = 'fit';
  const put = await api(`/api/shorts/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ edit: e }) });
  check('Speed/16:9 edit saved', put.status === 200);
  await api(`/api/shorts/${s.id}/render`, { method: 'POST' });
  const done = await waitShortJob(s.id, 'speed render');
  const p = ffprobe((await download(done.short.downloadUrl, 'short_2_edited.mp4')).file);
  check('Speed + 16:9 render correct', p.width === 1920 && p.height === 1080 && Math.abs(p.duration - totalDuration(e)) < 0.4, `${p.width}x${p.height} ${p.duration.toFixed(2)}s vs ${totalDuration(e).toFixed(2)}s`);
}

// Invalid edit is rejected
{
  const s = shorts[1];
  const e = (await api(`/api/shorts/${s.id}`)).json.edit;
  e.segments[0].end = 999999;
  const r = await api(`/api/shorts/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ edit: e }) });
  check('Invalid edit (segment beyond source) rejected', r.status === 422, r.json?.error);
}

// Regenerate short 3 at a different duration
{
  const s = shorts[2];
  const before = (await api(`/api/shorts/${s.id}`)).json;
  await api(`/api/shorts/${s.id}/regenerate`, json({ duration: 15 }));
  const done = await waitShortJob(s.id, 'regenerate');
  const after = done.short;
  check('Regeneration completed and passed QC', done.lastJob?.status === 'completed' && after.qc?.passed, done.lastJob?.error || '');
  check('Regenerated short is a new ~15s cut', Math.abs(after.duration - 15) < 5 && (after.startTime !== before.short.startTime || after.endTime !== before.short.endTime), `${before.short.startTime.toFixed(1)}-${before.short.endTime.toFixed(1)} -> ${after.startTime.toFixed(1)}-${after.endTime.toFixed(1)} (${after.duration.toFixed(1)}s) "${after.title}"`);
  check('Pre-regeneration render preserved in history', done.renders.filter((r) => r.status === 'completed').length >= 2, `${done.renders.length} renders`);
  const p = ffprobe((await download(after.downloadUrl, 'short_3_regenerated.mp4')).file);
  check('Regenerated download valid', p.height === 1920 && Math.abs(p.duration - after.duration) < 0.4, `${p.duration.toFixed(2)}s`);
}

console.log(`\nDownloads in ${outDir}`);
console.log(failures.length ? `${failures.length} FAILURE(S): ${failures.join(' | ')}` : 'ALL CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
