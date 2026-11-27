#!/usr/bin/env node
/**
 * PC fetch helper.
 *
 * YouTube blocks downloads from datacenter IPs (Railway), so production parks YouTube projects as
 * "awaiting_media". This script runs on your own computer: it asks production which videos are waiting, downloads
 * each with yt-dlp over your connection, and uploads the file to production, which then runs the normal pipeline
 * (AI agents, shorts, captions, rendering) on it.
 *
 *   npm run fetch-helper            keep running, checking every 20 s
 *   npm run fetch-helper -- --once  one pass, then exit
 *
 * Needs in .env (or .env.local): PRODUCTION_URL=https://<your-app>.up.railway.app and SYNC_TOKEN=<same value as
 * on Railway>. Needs yt-dlp (pip install yt-dlp) and FFmpeg on PATH.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { downloadWithYtDlp, resolveYtDlp, YtDlpError } from '../src/lib/youtube/ytdlp.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['.env.local', '.env']) {
  // loadEnvFile never overrides variables that are already set, so .env.local wins over .env.
  if (fs.existsSync(path.join(root, f))) process.loadEnvFile(path.join(root, f));
}

const BASE = (process.env.PRODUCTION_URL || '').trim().replace(/\/+$/, '');
const TOKEN = process.env.SYNC_TOKEN || '';
const ONCE = process.argv.includes('--once');
const POLL_MS = Number(process.env.FETCH_HELPER_POLL_SECONDS || 20) * 1000;
const MAX_TRIES = 3;
const workDir = path.join(os.tmpdir(), 'gta6-fetch-helper');

if (!/^https?:\/\//.test(BASE) || TOKEN.length < 24) {
  console.error('Set PRODUCTION_URL and SYNC_TOKEN (24+ characters, same as on the server) in .env, then run again.');
  process.exit(1);
}
if (!resolveYtDlp()) {
  console.error('yt-dlp was not found. Install it (pip install -U yt-dlp) or set YTDLP_PATH.');
  process.exit(1);
}

const log = (m) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);
const tries = new Map(); // projectId -> failed attempts in this session

async function api(method, route, init = {}) {
  const res = await fetch(`${BASE}${route}`, { ...init, method, headers: { ...(init.headers || {}), Authorization: `Bearer ${TOKEN}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

async function handle(p) {
  const file = path.join(workDir, `${p.projectId}.mp4`);
  log(`Downloading "${p.title}" (${p.url})`);
  let last = -10;
  try {
    await downloadWithYtDlp(p.url, file, (pct) => {
      if (pct - last >= 10 || pct === 100) {
        last = pct;
        log(`  ${Math.round(pct)}%`);
      }
    }, { ffmpegPath: process.env.FFMPEG });
  } catch (err) {
    const n = (tries.get(p.projectId) || 0) + 1;
    tries.set(p.projectId, n);
    const permanent = !(err instanceof YtDlpError) || err.kind === 'access' || err.kind === 'setup' || n >= MAX_TRIES;
    log(`  Download failed (${err.kind || 'error'}): ${err.message}${permanent ? '' : ` — will retry (${n}/${MAX_TRIES})`}`);
    if (permanent) await api('POST', `/api/helper/projects/${p.projectId}/fail`, { body: JSON.stringify({ error: err.message }), headers: { 'Content-Type': 'application/json' } }).catch((e) => log(`  Could not report the failure: ${e.message}`));
    return;
  }

  const size = fs.statSync(file).size;
  log(`  Uploading ${(size / 1048576).toFixed(1)} MB to production…`);
  try {
    const r = await api('PUT', `/api/helper/projects/${p.projectId}/source`, {
      body: Readable.toWeb(fs.createReadStream(file)),
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(size) },
      duplex: 'half',
    });
    log(`  Done. Production is processing it now (${BASE}/projects/${p.projectId}).`);
    tries.delete(p.projectId);
    void r;
  } catch (err) {
    log(`  Upload failed: ${err.message}${err.status === 409 ? '' : ' — will retry next round'}`);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

async function pass() {
  let pending;
  try {
    pending = (await api('GET', '/api/helper/pending')).projects || [];
  } catch (err) {
    log(`Could not reach production: ${err.message}`);
    return;
  }
  for (const p of pending) await handle(p);
}

fs.mkdirSync(workDir, { recursive: true });
log(`Fetch helper connected to ${new URL(BASE).host}. ${ONCE ? 'Running one pass.' : `Checking every ${POLL_MS / 1000}s. Leave this window open; Ctrl+C to stop.`}`);
do {
  await pass();
  if (!ONCE) await new Promise((r) => setTimeout(r, POLL_MS));
} while (!ONCE);
