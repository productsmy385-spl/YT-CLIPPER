import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { youtubeOAuth, OAuthReauthRequiredError } from './oauth.ts';
import { videoIngestionEngine } from '../video-ingestion.ts';

/**
 * YouTube media source.
 *
 * The YouTube Data API returns metadata only; it never returns video bytes. This module therefore separates
 * INSPECTION (metadata, always available for public videos) from ACQUISITION (actual media), and only acquires
 * media for videos that belong to the YouTube channel the user connected via OAuth: the user is the rights
 * holder of those videos. Ownership is verified automatically against the Data API (no forms, no prompts).
 *
 * Videos from other channels are never downloaded; the user is told once, plainly, and can drop the original
 * file into the same screen instead.
 *
 * Operators can switch owned-video acquisition off entirely with YOUTUBE_OWNER_ACQUISITION=off.
 */

export type YouTubeAcquisitionBlocker =
  | 'NOT_CONNECTED'
  | 'REAUTH_REQUIRED'
  | 'NOT_OWNED'
  | 'PRIVATE_VIDEO'
  | 'LIVE_IN_PROGRESS'
  | 'DISABLED'
  | 'NOT_FOUND';

export interface YouTubeInspection {
  videoId: string;
  url: string;
  title: string;
  channelId: string | null;
  channelTitle: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string;
  privacyStatus: string | null;
  isLive: boolean;
  connectedChannelId: string | null;
  owned: boolean;
  canAcquire: boolean;
  blocker?: YouTubeAcquisitionBlocker;
  message?: string;
}

function parseIsoDuration(iso?: string): number | null {
  if (!iso) return null;
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return null;
  const [, d, h, mi, s] = m.map((x) => (x ? Number(x) : 0)) as any;
  return d * 86400 + h * 3600 + mi * 60 + s;
}

async function fetchVideoResource(videoId: string): Promise<any | null> {
  const parts = 'snippet,contentDetails,status,liveStreamingDetails';
  // Prefer the OAuth token: it can see the owner's unlisted and private videos.
  let auth: Record<string, string> | null = null;
  try {
    auth = { Authorization: `Bearer ${await youtubeOAuth.getValidAccessToken()}` };
  } catch {
    auth = null;
  }
  const key = process.env.YOUTUBE_API_KEY;
  const attempts: Array<{ url: string; headers: Record<string, string> }> = [];
  if (auth) attempts.push({ url: `https://www.googleapis.com/youtube/v3/videos?part=${parts}&id=${videoId}`, headers: auth });
  if (key) attempts.push({ url: `https://www.googleapis.com/youtube/v3/videos?part=${parts}&id=${videoId}&key=${encodeURIComponent(key)}`, headers: {} });

  let lastError = '';
  for (const a of attempts) {
    try {
      const res = await fetch(a.url, { headers: a.headers, signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      const item = (await res.json()).items?.[0];
      if (item) return item;
    } catch (err: any) {
      lastError = err.message;
    }
  }
  if (lastError) console.error(`[YouTubeMediaSource] Data API lookup for ${videoId} failed: ${lastError}`);
  return null;
}

export async function inspectYouTubeVideo(rawUrl: string): Promise<YouTubeInspection | { error: string }> {
  const parsed = videoIngestionEngine.parseYouTubeUrl(rawUrl);
  if (!parsed.isValid || !parsed.videoId) {
    return { error: 'That is not a valid YouTube video link. Paste a youtube.com/watch, youtu.be, /shorts or /live link.' };
  }
  const videoId = parsed.videoId;
  const connectedChannelId = youtubeOAuth.connectedChannelId();
  const item = await fetchVideoResource(videoId);

  let title = `YouTube video ${videoId}`;
  let channelTitle: string | null = null;
  let thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  if (!item) {
    // Data API unavailable (no key / quota). oEmbed still gives title + channel for public videos.
    const o = await videoIngestionEngine.fetchYouTubeMetadata(`https://www.youtube.com/watch?v=${videoId}`);
    if (o && o.isAvailable === false) {
      return { error: 'This video is private, deleted, or unavailable.' };
    }
    if (o) {
      title = o.title;
      channelTitle = o.authorName;
      thumbnailUrl = o.thumbnailUrl || thumbnailUrl;
    }
  }

  const snippet = item?.snippet || {};
  const channelId: string | null = snippet.channelId || null;
  const owned = Boolean(channelId && connectedChannelId && channelId === connectedChannelId);
  const privacyStatus: string | null = item?.status?.privacyStatus || null;
  const isLive = snippet.liveBroadcastContent === 'live' || parsed.isLive;

  const base: YouTubeInspection = {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: snippet.title || title,
    channelId,
    channelTitle: snippet.channelTitle || channelTitle,
    durationSeconds: parseIsoDuration(item?.contentDetails?.duration),
    thumbnailUrl: snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || thumbnailUrl,
    privacyStatus,
    isLive,
    connectedChannelId,
    owned,
    canAcquire: false,
  };

  const status = connectedChannelId ? null : await youtubeOAuth.getStatusReport().catch(() => null);
  if (process.env.YOUTUBE_OWNER_ACQUISITION === 'off') {
    return { ...base, blocker: 'DISABLED', message: 'Fetching from YouTube is turned off on this server. Add the video file instead.' };
  }
  if (!connectedChannelId) {
    const reauth = status?.state === 'REAUTH_REQUIRED';
    return {
      ...base,
      blocker: reauth ? 'REAUTH_REQUIRED' : 'NOT_CONNECTED',
      message: reauth
        ? 'Your YouTube connection needs renewing before videos from your channel can be fetched.'
        : 'Connect your YouTube channel to fetch your own videos automatically, or add the video file.',
    };
  }
  if (!item) {
    return { ...base, blocker: 'NOT_FOUND', message: 'YouTube did not return this video. It may be private to another account, or removed.' };
  }
  if (!owned) {
    return {
      ...base,
      blocker: 'NOT_OWNED',
      message: `This video belongs to ${base.channelTitle || 'another channel'}, not your connected channel, so it can't be fetched. Add the original video file to make shorts from it.`,
    };
  }
  if (privacyStatus === 'private') {
    return { ...base, blocker: 'PRIVATE_VIDEO', message: 'Private videos cannot be fetched. Set it to Unlisted on YouTube, or add the file.' };
  }
  if (isLive) {
    return { ...base, blocker: 'LIVE_IN_PROGRESS', message: 'This stream is still live. Start once the stream has ended and been processed by YouTube.' };
  }
  return { ...base, canAcquire: true };
}

// ---------------------------------------------------------------------------------------------
// Acquisition of an owned video
// ---------------------------------------------------------------------------------------------

function resolveYtDlp(): { cmd: string; prefix: string[] } | null {
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

export class AcquisitionError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

/**
 * Download an owned video (verified by inspectYouTubeVideo) to `destFile` as H.264/AAC MP4 (≤1080p).
 * Progress is reported 0..100. Throws AcquisitionError with a user-readable message.
 */
export async function acquireOwnedYouTubeVideo(
  inspection: YouTubeInspection,
  destFile: string,
  onProgress: (pct: number) => void,
  signal?: AbortSignal
): Promise<string> {
  if (!inspection.canAcquire || !inspection.owned) {
    throw new AcquisitionError(inspection.message || 'This video cannot be fetched.', false);
  }
  const tool = resolveYtDlp();
  if (!tool) throw new AcquisitionError('The media fetcher (yt-dlp) is not installed on this server.', false);

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
    inspection.url,
  ];
  const ffmpeg = process.env.FFMPEG;
  if (ffmpeg && path.isAbsolute(ffmpeg)) args.splice(tool.prefix.length, 0, '--ffmpeg-location', ffmpeg);

  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(tool.cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderrTail = '';
    let finalPath = '';
    const onAbort = () => child.kill('SIGKILL');
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => child.kill('SIGKILL'), Number(process.env.YOUTUBE_ACQUISITION_TIMEOUT_MS || 45 * 60 * 1000));

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
      reject(new AcquisitionError(`Could not start the media fetcher: ${err.message}`, false));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) return reject(new AcquisitionError('Cancelled.', false));
      if (code !== 0) {
        const errLine = stderrTail.split('\n').reverse().find((l) => l.includes('ERROR')) || stderrTail.trim().split('\n').pop() || '';
        const botWall = /Sign in to confirm|not a bot|HTTP Error 429/i.test(stderrTail);
        return reject(
          new AcquisitionError(
            botWall
              ? 'YouTube refused the download from this server (it rate-limits datacenter IPs). Retry later, or add the file.'
              : `Fetching the video failed: ${errLine.replace(/^ERROR:\s*/, '').slice(0, 300)}`,
            true
          )
        );
      }
      resolve(finalPath);
    });
  });

  // Locate the merged file and move it to the destination.
  const dir = path.dirname(destFile);
  const stem = path.basename(destFile).replace(/\.mp4$/i, '') + '.part.';
  const produced = output && fs.existsSync(output)
    ? output
    : fs.readdirSync(dir).map((f) => path.join(dir, f)).find((f) => path.basename(f).startsWith(stem) && /\.(mp4|mkv|webm)$/i.test(f));
  if (!produced) throw new AcquisitionError('The fetcher finished but produced no video file.', true);
  fs.renameSync(produced, destFile);
  onProgress(100);
  return destFile;
}

export { OAuthReauthRequiredError };
