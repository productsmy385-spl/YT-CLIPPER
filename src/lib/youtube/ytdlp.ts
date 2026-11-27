import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

/**
 * yt-dlp runner with no app dependencies (no database, no OAuth), so it is shared by the server pipeline
 * (src/lib/youtube/media-source.ts) and the PC fetch helper (scripts/fetch-helper.mjs).
 */

/**
 * Why a download failed:
 * - bot_wall: YouTube refused this machine's IP ("Sign in to confirm you're not a bot", HTTP 429). Typical for
 *   datacenter IPs such as Railway; retrying from the same server does not help.
 * - access: the video needs a signed-in account or no longer exists. Permanent.
 * - setup: yt-dlp is missing or could not start. Permanent until the server is fixed.
 * - other: anything else (network, disk, transient YouTube error). Worth one retry.
 */
export type YtDlpFailureKind = 'bot_wall' | 'access' | 'setup' | 'other' | 'cancelled';

export class YtDlpError extends Error {
  readonly kind: YtDlpFailureKind;
  readonly detail: string;
  constructor(kind: YtDlpFailureKind, message: string, detail = '') {
    super(message);
    this.kind = kind;
    this.detail = detail;
  }
}

export function resolveYtDlp(): { cmd: string; prefix: string[] } | null {
  const candidates: Array<{ cmd: string; prefix: string[] }> = [];
  if (process.env.YTDLP_PATH) candidates.push({ cmd: process.env.YTDLP_PATH, prefix: [] });
  candidates.push({ cmd: '/usr/local/bin/yt-dlp', prefix: [] }, { cmd: 'yt-dlp', prefix: [] });
  candidates.push({ cmd: process.platform === 'win32' ? 'python' : 'python3', prefix: ['-m', 'yt_dlp'] });
  for (const c of candidates) {
    if (c.cmd.startsWith('/') && !fs.existsSync(c.cmd)) continue;
    const r = spawnSync(c.cmd, [...c.prefix, '--version'], { encoding: 'utf8', timeout: 15000 });
    if (r.status === 0) return c;
  }
  return null;
}

/** Classify yt-dlp stderr. Exported for unit tests. */
export function classifyYtDlpFailure(stderr: string): YtDlpFailureKind {
  if (/confirm your age|members-only|join this channel|Private video|This video is private|video is unavailable|has been removed/i.test(stderr)) return 'access';
  if (/Sign in to confirm|not a bot|HTTP Error 429|Too Many Requests/i.test(stderr)) return 'bot_wall';
  return 'other';
}

/**
 * Download `url` to `destFile` as H.264/AAC MP4 (≤1080p). Progress is reported 0..100.
 * Throws YtDlpError. The file appears at `destFile` only when complete.
 */
export async function downloadWithYtDlp(
  url: string,
  destFile: string,
  onProgress: (pct: number) => void,
  opts: { signal?: AbortSignal; ffmpegPath?: string; timeoutMs?: number } = {}
): Promise<string> {
  const tool = resolveYtDlp();
  if (!tool) throw new YtDlpError('setup', 'The media fetcher (yt-dlp) is not installed on this machine.');

  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  const tmpTemplate = destFile.replace(/\.mp4$/i, '') + '.part.%(ext)s';
  const args = [
    ...tool.prefix,
    '--no-playlist',
    '--newline',
    '--js-runtimes', 'node',
    '-f', 'bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]/b',
    '--merge-output-format', 'mp4',
    '-o', tmpTemplate,
    url,
  ];
  if (opts.ffmpegPath && path.isAbsolute(opts.ffmpegPath)) args.splice(tool.prefix.length, 0, '--ffmpeg-location', opts.ffmpegPath);
  const { signal } = opts;

  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(tool.cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderrTail = '';
    let finalPath = '';
    const onAbort = () => child.kill('SIGKILL');
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs ?? 45 * 60 * 1000);

    child.stdout.on('data', (buf) => {
      for (const line of buf.toString().split(/\r?\n/)) {
        const pct = /\[download\]\s+(\d+(?:\.\d+)?)%/.exec(line);
        if (pct) onProgress(Math.min(99, Number(pct[1])));
        const merged = /\[Merger\] Merging formats into "(.+)"/.exec(line) || /\[download\] (.+) has already been downloaded/.exec(line);
        if (merged) finalPath = merged[1];
        const dest = /\[download\] Destination: (.+)/.exec(line);
        if (dest && !finalPath) finalPath = dest[1];
      }
    });
    child.stderr.on('data', (buf) => {
      stderrTail = (stderrTail + buf.toString()).slice(-2000);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new YtDlpError('setup', `Could not start the media fetcher: ${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) return reject(new YtDlpError('cancelled', 'Cancelled.'));
      if (code === 0) return resolve(finalPath);
      const errLine = stderrTail.split('\n').reverse().find((l) => l.includes('ERROR')) || stderrTail.trim().split('\n').pop() || '';
      const kind = classifyYtDlpFailure(stderrTail);
      const message =
        kind === 'access'
          ? 'This video needs a signed-in YouTube account (age-restricted, members-only, private or removed), so it cannot be fetched. Add the video file instead.'
          : kind === 'bot_wall'
            ? 'YouTube refused the download from this machine (it blocks datacenter IPs such as Railway\'s).'
            : `Fetching the video failed: ${errLine.replace(/^ERROR:\s*/, '').slice(0, 300)}`;
      reject(new YtDlpError(kind, message, errLine.slice(0, 500)));
    });
  });

  // Locate the merged file and move it to the destination.
  const dir = path.dirname(destFile);
  const stem = path.basename(destFile).replace(/\.mp4$/i, '') + '.part.';
  const produced = output && fs.existsSync(output)
    ? output
    : fs.readdirSync(dir).map((f) => path.join(dir, f)).find((f) => path.basename(f).startsWith(stem) && /\.(mp4|mkv|webm)$/i.test(f));
  if (!produced) throw new YtDlpError('other', 'The fetcher finished but produced no video file.');
  fs.renameSync(produced, destFile);
  onProgress(100);
  return destFile;
}
