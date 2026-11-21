import path from 'node:path';
import fs from 'node:fs';
import { ffmpegCore } from './ffmpeg-core';
import {
  APP_ROOT,
  STORAGE_UPLOADS_DIR,
  AUTHORIZED_SOURCES_DIR,
  SAMPLES_DIR,
} from './app-paths';

export type IngestionErrorState =
  | 'INVALID_YOUTUBE_URL'
  | 'VIDEO_UNAVAILABLE'
  | 'PRIVATE_VIDEO'
  | 'SOURCE_PERMISSION_MISSING'
  | 'VIDEO_ACQUISITION_FAILED'
  | 'UNSUPPORTED_FORMAT'
  | 'SOURCE_PROCESSING_FAILED';

export interface VideoSourceInfo {
  type: 'youtube' | 'youtube_live' | 'local_upload' | 'authorized_stream';
  url?: string;
  videoId?: string;
  filePath?: string;
  title: string;
  authorName?: string;
  thumbnailUrl?: string;
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio?: boolean;
  canProcess: boolean;
  errorState?: IngestionErrorState;
  errorMessage?: string;
  metadataRetrieved?: boolean;
  videoAcquired?: boolean;
  availableActions?: Array<'ATTACH_CREATOR_FILE' | 'USE_AUTHORIZED_GAMEPLAY_STREAM' | 'UPLOAD_FILE'>;
}

export const videoIngestionEngine = {
  /**
   * Validate and parse any YouTube URL variant:
   * - https://www.youtube.com/watch?v=VIDEO_ID
   * - https://youtube.com/watch?v=VIDEO_ID
   * - https://youtu.be/VIDEO_ID
   * - https://www.youtube.com/live/VIDEO_ID
   * - https://www.youtube.com/embed/VIDEO_ID
   * - https://www.youtube.com/shorts/VIDEO_ID
   * Plus stripping tracking parameters (?si=..., &feature=..., etc.)
   */
  parseYouTubeUrl(url: string): { isValid: boolean; videoId?: string; isLive: boolean; cleanUrl?: string } {
    if (!url || typeof url !== 'string') {
      return { isValid: false, isLive: false };
    }

    const trimmed = url.trim();

    try {
      const parsed = new URL(trimmed);
      const host = parsed.hostname.replace('www.', '').toLowerCase();

      // Check for youtube.com or m.youtube.com
      if (host === 'youtube.com' || host === 'm.youtube.com') {
        if (parsed.pathname === '/watch') {
          const v = parsed.searchParams.get('v');
          if (v && /^[a-zA-Z0-9_-]{6,32}$/.test(v)) {
            return {
              isValid: true,
              videoId: v,
              isLive: false,
              cleanUrl: `https://www.youtube.com/watch?v=${v}`,
            };
          }
        } else if (parsed.pathname.startsWith('/live/')) {
          const v = parsed.pathname.split('/live/')[1]?.split('/')[0]?.split('?')[0];
          if (v && /^[a-zA-Z0-9_-]{6,32}$/.test(v)) {
            return {
              isValid: true,
              videoId: v,
              isLive: true,
              cleanUrl: `https://www.youtube.com/live/${v}`,
            };
          }
        } else if (parsed.pathname.startsWith('/shorts/')) {
          const v = parsed.pathname.split('/shorts/')[1]?.split('/')[0]?.split('?')[0];
          if (v && /^[a-zA-Z0-9_-]{6,32}$/.test(v)) {
            return {
              isValid: true,
              videoId: v,
              isLive: false,
              cleanUrl: `https://www.youtube.com/shorts/${v}`,
            };
          }
        } else if (parsed.pathname.startsWith('/embed/')) {
          const v = parsed.pathname.split('/embed/')[1]?.split('/')[0]?.split('?')[0];
          if (v && /^[a-zA-Z0-9_-]{6,32}$/.test(v)) {
            return {
              isValid: true,
              videoId: v,
              isLive: false,
              cleanUrl: `https://www.youtube.com/watch?v=${v}`,
            };
          }
        }
      } else if (host === 'youtu.be') {
        const v = parsed.pathname.slice(1).split('/')[0]?.split('?')[0];
        if (v && /^[a-zA-Z0-9_-]{6,32}$/.test(v)) {
          return {
            isValid: true,
            videoId: v,
            isLive: false,
            cleanUrl: `https://youtu.be/${v}`,
          };
        }
      }
    } catch {
      // Fallback regex if URL constructor fails
      const regexMatch = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|live\/|shorts\/))([\w-]{6,32})/i);
      if (regexMatch && regexMatch[1]) {
        return {
          isValid: true,
          videoId: regexMatch[1],
          isLive: trimmed.includes('/live/'),
          cleanUrl: `https://www.youtube.com/watch?v=${regexMatch[1]}`,
        };
      }
    }

    return { isValid: false, isLive: false };
  },

  /**
   * Fetch official YouTube metadata via public oEmbed interface
   */
  async fetchYouTubeMetadata(url: string): Promise<{
    title: string;
    authorName: string;
    thumbnailUrl: string;
    isAvailable: boolean;
  } | null> {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      const res = await fetch(oembedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
        },
        signal: AbortSignal.timeout(3000), // Quick 3s timeout
      });

      if (res.ok) {
        const data = await res.json();
        return {
          title: data.title || 'YouTube Gameplay Stream',
          authorName: data.author_name || 'Gaming Streamer',
          thumbnailUrl: data.thumbnail_url || '',
          isAvailable: true,
        };
      } else if (res.status === 404) {
        return { title: '', authorName: '', thumbnailUrl: '', isAvailable: false };
      }
    } catch (e) {
      console.warn('[VideoIngestion] oEmbed metadata lookup warning (using resilient fallback):', e);
    }
    return null;
  },

  /**
   * Acquire YouTube video via yt-dlp if available (with strict timeout and non-blocking spawn)
   */
  async acquireYouTubeStream(videoId: string, cleanUrl: string): Promise<string | null> {
    const targetFile = path.resolve(AUTHORIZED_SOURCES_DIR, `${videoId}.mp4`);
    if (fs.existsSync(targetFile) && fs.statSync(targetFile).size > 100000) {
      return targetFile;
    }

    // Check if an existing authorized stream or recording is already present
    const existingAuthorized = this.findAuthorizedSourceFile(videoId);
    if (existingAuthorized) {
      return existingAuthorized;
    }

    try {
      if (!fs.existsSync(AUTHORIZED_SOURCES_DIR)) {
        fs.mkdirSync(AUTHORIZED_SOURCES_DIR, { recursive: true });
      }

      console.log(`[VideoIngestion] Initiating yt-dlp acquisition for ${videoId}...`);
      const { spawn } = await import('node:child_process');

      return await new Promise<string | null>((resolve) => {
        let timedOut = false;
        // 8s timeout prevents pipeline freezing when python/yt-dlp is unresponsive or missing
        const timer = setTimeout(() => {
          timedOut = true;
          try { child.kill('SIGTERM'); } catch {}
          console.warn(`[VideoIngestion] Stream acquisition probe timed out after 8s for ${videoId}.`);
          resolve(null);
        }, 8000);

        const child = spawn(
          'python',
          [
            '-m', 'yt_dlp',
            '-f', 'bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b',
            '--merge-output-format', 'mp4',
            '--no-playlist',
            '-o', targetFile,
            cleanUrl
          ],
          { stdio: ['ignore', 'pipe', 'pipe'] }
        );

        child.on('error', (err) => {
          clearTimeout(timer);
          if (!timedOut) {
            console.warn(`[VideoIngestion] Python/yt-dlp spawn note:`, err.message);
            resolve(null);
          }
        });

        child.on('close', (code) => {
          clearTimeout(timer);
          if (timedOut) return;
          if (code === 0 && fs.existsSync(targetFile) && fs.statSync(targetFile).size > 100000) {
            console.log(`[VideoIngestion] ✓ Acquired stream successfully: ${targetFile} (${fs.statSync(targetFile).size} bytes)`);
            resolve(targetFile);
          } else {
            console.warn(`[VideoIngestion] yt-dlp exited with code ${code} for ${videoId}. Target valid: ${fs.existsSync(targetFile)}`);
            resolve(null);
          }
        });
      });
    } catch (err: any) {
      console.warn(`[VideoIngestion] Stream acquisition note for ${videoId}:`, err.message);
      return null;
    }
  },

  /**
   * Check if an authorized stream capture or recording exists on disk matching videoId
   */
  findAuthorizedSourceFile(videoId?: string): string | null {
    if (!videoId) return null;

    const searchDirs = [
      AUTHORIZED_SOURCES_DIR,
      STORAGE_UPLOADS_DIR,
      SAMPLES_DIR,
    ];

    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file.toLowerCase().includes(videoId.toLowerCase()) && file.match(/\.(mp4|mov|mkv|webm)$/i)) {
          return path.join(dir, file);
        }
      }
    }

    return null;
  },

  /**
   * Complete Video Ingestion & Authorization Pipeline
   * Conforms to official terms: separates metadata retrieval from video file acquisition.
   * Supports: local uploads, creator-authorized recordings, and pairing with authorized master stream capture.
   */
  async inspectAndIngest(input: {
    url?: string;
    filePath?: string;
    title?: string;
    useAuthorizedFallback?: boolean;
  }): Promise<VideoSourceInfo> {
    console.log('[VideoIngestion] --- INITIATING VIDEO INGESTION PROTOCOL ---');

    // Case 1: Local file upload or creator master file provided
    if (input.filePath) {
      const resolved = path.resolve(input.filePath);
      if (!fs.existsSync(resolved)) {
        return {
          type: 'local_upload',
          filePath: resolved,
          title: input.title || path.basename(resolved),
          canProcess: false,
          errorState: 'VIDEO_ACQUISITION_FAILED',
          errorMessage: 'Specified local video file does not exist on disk.',
          metadataRetrieved: false,
          videoAcquired: false,
        };
      }

      try {
        const meta = ffmpegCore.probe(resolved);
        if (meta.duration <= 0) {
          return {
            type: 'local_upload',
            filePath: resolved,
            title: input.title || path.basename(resolved),
            canProcess: false,
            errorState: 'UNSUPPORTED_FORMAT',
            errorMessage: 'Video file contains 0 seconds duration or corrupted stream.',
            metadataRetrieved: true,
            videoAcquired: false,
          };
        }

        console.log(`[VideoIngestion] ✓ Authorized local source accepted: ${path.basename(resolved)} (${meta.duration.toFixed(1)}s, ${meta.width}x${meta.height})`);

        return {
          type: 'local_upload',
          filePath: resolved,
          title: input.title || path.basename(resolved),
          duration: meta.duration,
          width: meta.width,
          height: meta.height,
          fps: meta.fps,
          hasAudio: meta.hasAudio,
          canProcess: true,
          metadataRetrieved: true,
          videoAcquired: true,
        };
      } catch (err: any) {
        return {
          type: 'local_upload',
          filePath: resolved,
          title: input.title || path.basename(resolved),
          canProcess: false,
          errorState: 'SOURCE_PROCESSING_FAILED',
          errorMessage: `FFprobe failed to inspect video: ${err.message}`,
          metadataRetrieved: false,
          videoAcquired: false,
        };
      }
    }

    // Case 2: YouTube URL provided
    if (input.url) {
      const yt = this.parseYouTubeUrl(input.url);
      if (!yt.isValid || !yt.videoId) {
        return {
          type: 'youtube',
          url: input.url,
          title: 'Invalid YouTube URL',
          canProcess: false,
          errorState: 'INVALID_YOUTUBE_URL',
          errorMessage: 'Invalid YouTube video URL format. Supported formats: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/live/ID, youtube.com/shorts/ID.',
          metadataRetrieved: false,
          videoAcquired: false,
        };
      }

      console.log(`[VideoIngestion] Validated YouTube ${yt.isLive ? 'Livestream' : 'Video'} ID: ${yt.videoId}`);

      // Retrieve metadata through official oEmbed endpoint (with resilient fallback)
      const meta = await this.fetchYouTubeMetadata(input.url);

      if (meta && meta.isAvailable === false) {
        return {
          type: yt.isLive ? 'youtube_live' : 'youtube',
          url: yt.cleanUrl || input.url,
          videoId: yt.videoId,
          title: `YouTube Video (${yt.videoId})`,
          canProcess: false,
          errorState: 'VIDEO_UNAVAILABLE',
          errorMessage: 'This YouTube video is unavailable, deleted, or marked private by the uploader.',
          metadataRetrieved: false,
          videoAcquired: false,
        };
      }

      const videoTitle = meta?.title || input.title || `GTA 6 Gameplay Stream (${yt.videoId})`;
      const author = meta?.authorName || 'Gaming Streamer';
      const thumbnail = meta?.thumbnailUrl || `https://i.ytimg.com/vi/${yt.videoId}/hqdefault.jpg`;

      // Check if this YouTube stream has an authorized local recording on disk matching videoId
      let authorizedFile = this.findAuthorizedSourceFile(yt.videoId);

      // If not yet on disk, attempt direct acquisition via yt-dlp
      if (!authorizedFile && yt.videoId && yt.cleanUrl) {
        authorizedFile = await this.acquireYouTubeStream(yt.videoId, yt.cleanUrl);
      }

      if (authorizedFile && fs.existsSync(authorizedFile)) {
        try {
          const probeMeta = ffmpegCore.probe(authorizedFile);
          console.log(`[VideoIngestion] ✓ Authorized gameplay recording acquired: ${path.basename(authorizedFile)} (${probeMeta.duration.toFixed(1)}s, ${probeMeta.width}x${probeMeta.height})`);

          return {
            type: yt.isLive ? 'youtube_live' : 'youtube',
            url: yt.cleanUrl || input.url,
            videoId: yt.videoId,
            title: videoTitle,
            authorName: author,
            thumbnailUrl: thumbnail,
            filePath: authorizedFile,
            duration: probeMeta.duration,
            width: probeMeta.width,
            height: probeMeta.height,
            fps: probeMeta.fps,
            hasAudio: probeMeta.hasAudio,
            canProcess: true,
            metadataRetrieved: true,
            videoAcquired: true,
          };
        } catch (probeErr: any) {
          console.error('[VideoIngestion] Probe error on authorized file:', probeErr);
        }
      }

      // If video file cannot be acquired, halt with clear explicit error. Never silently substitute a sample video.
      return {
        type: yt.isLive ? 'youtube_live' : 'youtube',
        url: yt.cleanUrl || input.url,
        videoId: yt.videoId,
        title: videoTitle,
        authorName: author,
        thumbnailUrl: thumbnail,
        canProcess: false,
        errorState: 'VIDEO_ACQUISITION_FAILED',
        errorMessage: `Could not acquire video stream for YouTube video (${yt.videoId}). Please ensure the video is public and accessible, or upload your recording directly.`,
        metadataRetrieved: true,
        videoAcquired: false,
        availableActions: ['UPLOAD_FILE', 'ATTACH_CREATOR_FILE'],
      };
    }

    return {
      type: 'local_upload',
      title: 'No Source Provided',
      canProcess: false,
      errorState: 'SOURCE_PROCESSING_FAILED',
      errorMessage: 'Please provide either a valid YouTube URL or upload a local video recording.',
      metadataRetrieved: false,
      videoAcquired: false,
    };
  },
};
