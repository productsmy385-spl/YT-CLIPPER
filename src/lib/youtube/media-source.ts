import { youtubeOAuth, OAuthReauthRequiredError } from './oauth.ts';
import { videoIngestionEngine } from '../video-ingestion.ts';
import { downloadWithYtDlp, YtDlpError, type YtDlpFailureKind } from './ytdlp.ts';

/**
 * YouTube media source.
 *
 * The YouTube Data API returns metadata only; it never returns video bytes. This module separates INSPECTION
 * (metadata) from ACQUISITION (actual media, fetched with yt-dlp). By default any public or unlisted video can be
 * fetched; private / members-only / sign-in-required videos never are. YOUTUBE_ACQUISITION=owned restricts fetching
 * to the OAuth-connected channel, =off disables it.
 *
 * Note for operators: downloading other channels' videos is against YouTube's Terms of Service, and re-publishing
 * clips of others' content can trigger Content ID claims. That is the operator's decision (default: allowed).
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

  // Acquisition policy (operator-controlled): "all" (default) fetches any public or unlisted video; "owned" only
  // videos on the connected channel; "off" disables fetching. Private, members-only and sign-in-required videos are
  // never fetched (that would require bypassing authentication).
  const legacyOff = process.env.YOUTUBE_OWNER_ACQUISITION === 'off';
  const mode = legacyOff ? 'off' : (process.env.YOUTUBE_ACQUISITION || 'all').toLowerCase();
  if (mode === 'off') {
    return { ...base, blocker: 'DISABLED', message: 'Fetching from YouTube is turned off on this server. Add the video file instead.' };
  }
  if (privacyStatus === 'private') {
    return { ...base, blocker: 'PRIVATE_VIDEO', message: 'This video is private, so it cannot be fetched. Ask for it to be made public or unlisted, or add the file.' };
  }
  if (isLive) {
    return { ...base, blocker: 'LIVE_IN_PROGRESS', message: 'This stream is still live. Start once the stream has ended and been processed by YouTube.' };
  }
  if (mode === 'owned' && !owned) {
    if (!connectedChannelId) {
      const status = await youtubeOAuth.getStatusReport().catch(() => null);
      const reauth = status?.state === 'REAUTH_REQUIRED';
      return {
        ...base,
        blocker: reauth ? 'REAUTH_REQUIRED' : 'NOT_CONNECTED',
        message: reauth ? 'Your YouTube connection needs renewing before videos from your channel can be fetched.' : 'Connect your YouTube channel to fetch your own videos, or add the video file.',
      };
    }
    return { ...base, blocker: 'NOT_OWNED', message: `This server only fetches videos from your connected channel; this one belongs to ${base.channelTitle || 'another channel'}. Add the video file instead.` };
  }
  return { ...base, canAcquire: true };
}

// ---------------------------------------------------------------------------------------------
// Acquisition (only for inspections with canAcquire = true)
// ---------------------------------------------------------------------------------------------

export class AcquisitionError extends Error {
  readonly retryable: boolean;
  readonly kind: YtDlpFailureKind;
  constructor(message: string, retryable: boolean, kind: YtDlpFailureKind = 'other') {
    super(message);
    this.retryable = retryable;
    this.kind = kind;
  }
}

/**
 * Where YouTube media is downloaded (YOUTUBE_FETCH_VIA):
 * - server: on this server only (the original behaviour).
 * - helper: never on this server; the project waits for the PC fetch helper (scripts/fetch-helper.mjs). Use on
 *   Railway, whose datacenter IPs YouTube blocks, so no time is wasted on an attempt that cannot succeed.
 * - auto (default): try this server; if YouTube blocks its IP, hand the project to the PC fetch helper.
 * The helper path needs SYNC_TOKEN (the helper authenticates with it); without it, "helper"/"auto" behave as "server".
 */
export function youtubeFetchMode(): 'server' | 'helper' | 'auto' {
  if (!process.env.SYNC_TOKEN) return 'server';
  const v = (process.env.YOUTUBE_FETCH_VIA || 'auto').toLowerCase();
  return v === 'server' || v === 'helper' ? v : 'auto';
}

/**
 * Download a video that inspectYouTubeVideo cleared to `destFile` as H.264/AAC MP4 (≤1080p).
 * Progress is reported 0..100. Throws AcquisitionError with a user-readable message and a failure kind.
 */
export async function acquireYouTubeVideo(
  inspection: YouTubeInspection,
  destFile: string,
  onProgress: (pct: number) => void,
  signal?: AbortSignal
): Promise<string> {
  if (!inspection.canAcquire) {
    throw new AcquisitionError(inspection.message || 'This video cannot be fetched.', false, 'access');
  }
  try {
    return await downloadWithYtDlp(inspection.url, destFile, onProgress, {
      signal,
      ffmpegPath: process.env.FFMPEG,
      timeoutMs: Number(process.env.YOUTUBE_ACQUISITION_TIMEOUT_MS || 45 * 60 * 1000),
    });
  } catch (err: any) {
    if (!(err instanceof YtDlpError)) throw new AcquisitionError(err.message || String(err), true);
    // A blocked IP stays blocked: retrying from the same server only burns the attempt budget.
    const retryable = err.kind === 'other';
    const message = err.kind === 'bot_wall' ? 'YouTube refused the download from this server (it blocks datacenter IPs). Add the file, or run the PC fetch helper.' : err.message;
    throw new AcquisitionError(message, retryable, err.kind);
  }
}

export { OAuthReauthRequiredError };
