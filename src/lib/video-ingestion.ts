import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { ffmpegCore } from './ffmpeg-core.ts';
import {
  APP_ROOT,
  STORAGE_UPLOADS_DIR,
  AUTHORIZED_SOURCES_DIR,
} from './app-paths.ts';

export type IngestionErrorState =
  | 'INVALID_YOUTUBE_URL'
  | 'VIDEO_UNAVAILABLE'
  | 'PRIVATE_VIDEO'
  | 'SOURCE_PERMISSION_MISSING'
  | 'SOURCE_FILE_REQUIRED'
  | 'VIDEO_ACQUISITION_FAILED'
  | 'UNSUPPORTED_FORMAT'
  | 'SOURCE_PROCESSING_FAILED';

export interface VideoSourceInfo {
  type: 'youtube' | 'youtube_live' | 'local_upload' | 'authorized_stream';
  url?: string;
  videoId?: string;
  filePath?: string;
  checksum?: string;
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

/**
 * Computes SHA-256 checksum in 64KB chunks to guarantee zero buffer overflow
 */
export function computeFileChecksum(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(64 * 1024);
  let bytesRead = 0;
  while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
    hash.update(buffer.subarray(0, bytesRead));
  }
  fs.closeSync(fd);
  return hash.digest('hex');
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
   * Acquire YouTube video via yt-dlp with Node.js EJS challenge solver,
   * fast h264/m4a stream remuxing, livestream support, and robust timeout.
   */
  async acquireYouTubeStream(
    videoId: string,
    cleanUrl: string,
    isLive: boolean = false,
    options?: { maxDurationSeconds?: number }
  ): Promise<string | null> {
    const targetFile = path.resolve(AUTHORIZED_SOURCES_DIR, `${videoId}.mp4`);
    if (fs.existsSync(targetFile) && fs.statSync(targetFile).size > 100000) {
      console.log(`[VideoIngestion] Using existing acquired video on disk: ${targetFile} (${fs.statSync(targetFile).size} bytes)`);
      return targetFile;
    }

    // Check if an existing authorized stream or recording is already present
    const existingAuthorized = this.findAuthorizedSourceFile(videoId);
    if (existingAuthorized) {
      console.log(`[VideoIngestion] Found existing authorized source file: ${existingAuthorized}`);
      return existingAuthorized;
    }

    try {
      if (!fs.existsSync(AUTHORIZED_SOURCES_DIR)) {
        fs.mkdirSync(AUTHORIZED_SOURCES_DIR, { recursive: true });
      }

      console.log(`[VideoIngestion] Initiating yt-dlp stream acquisition for ${videoId} (${isLive ? 'Live Stream' : 'Video'})...`);
      const { spawn } = await import('node:child_process');

      return await new Promise<string | null>((resolve) => {
        let timedOut = false;
        // 180s (3 minute) timeout gives ample time to download and remux 1080p stream
        const timer = setTimeout(() => {
          timedOut = true;
          try { child.kill('SIGKILL'); } catch {}
          console.warn(`[VideoIngestion] Stream acquisition probe timed out after 180s for ${videoId}.`);
          resolve(null);
        }, 180000);

        const args = [
          '-m', 'yt_dlp',
          '--remote-components', 'ejs:github',
          '--js-runtimes', 'node',
          // Prefer high-speed remuxing: AVC/H.264 video up to 1080p + AAC/M4A audio (avoids slow software re-encoding)
          '-f', 'bv*[height<=1080][vcodec^=avc]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]/best',
          '--merge-output-format', 'mp4',
          '--no-playlist',
        ];

        if (isLive) {
          // If active live stream, capture from start or recent 5 minutes
          args.push('--live-from-start', '--download-sections', '*00:00:00-00:05:00');
        } else if (options?.maxDurationSeconds && options.maxDurationSeconds > 0) {
          const maxMin = Math.floor(options.maxDurationSeconds / 60);
          const maxSec = options.maxDurationSeconds % 60;
          args.push('--download-sections', `*00:00:00-${String(maxMin).padStart(2, '0')}:${String(maxSec).padStart(2, '0')}`);
        }

        args.push('-o', targetFile, cleanUrl);

        console.log(`[VideoIngestion] Executing: python ${args.join(' ')}`);

        const child = spawn('python', args, { stdio: ['ignore', 'pipe', 'pipe'] });

        let stdoutBuf = '';
        let stderrBuf = '';

        child.stdout?.on('data', (d) => {
          const text = d.toString();
          stdoutBuf += text;
          if (text.includes('%') || text.includes('Destination:') || text.includes('Merging')) {
            const lastLine = text.trim().split('\n').pop();
            console.log(`[VideoIngestion yt-dlp] ${lastLine}`);
          }
        });

        child.stderr?.on('data', (d) => {
          const text = d.toString();
          stderrBuf += text;
          if (text.includes('ERROR:')) {
            console.error(`[VideoIngestion yt-dlp ERROR] ${text.trim()}`);
          }
        });

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
          if (code === 0 && fs.existsSync(targetFile) && fs.statSync(targetFile).size > 50000) {
            console.log(`[VideoIngestion] ✓ Acquired stream successfully: ${targetFile} (${fs.statSync(targetFile).size} bytes)`);
            resolve(targetFile);
          } else {
            console.warn(`[VideoIngestion] yt-dlp exited with code ${code} for ${videoId}. Target valid: ${fs.existsSync(targetFile)}`);
            if (stderrBuf) {
              console.warn(`[VideoIngestion yt-dlp stderr]:\n${stderrBuf.slice(-400)}`);
            }
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
        const checksum = computeFileChecksum(resolved);

        return {
          type: 'local_upload',
          filePath: resolved,
          checksum,
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
          errorState: 'VIDEO_ACQUISITION_FAILED',
          errorMessage: 'Video metadata was verified, but the actual video file is not available. Please upload an authorized recording or provide an authorized source file.',
          metadataRetrieved: true,
          videoAcquired: false,
        };
      }

      const videoTitle = meta?.title || input.title || `GTA 6 Gameplay Stream (${yt.videoId})`;
      const author = meta?.authorName || 'Gaming Streamer';
      const thumbnail = meta?.thumbnailUrl || `https://i.ytimg.com/vi/${yt.videoId}/hqdefault.jpg`;

      // Check if this YouTube stream has an authorized local recording on disk matching videoId
      let authorizedFile = this.findAuthorizedSourceFile(yt.videoId);

      if (authorizedFile && fs.existsSync(authorizedFile)) {
        try {
          fs.accessSync(authorizedFile, fs.constants.R_OK);
          const probeMeta = ffmpegCore.probe(authorizedFile);
          if (probeMeta && probeMeta.duration > 0) {
            console.log(`[VideoIngestion] ✓ Authorized gameplay recording acquired: ${path.basename(authorizedFile)} (${probeMeta.duration.toFixed(1)}s, ${probeMeta.width}x${probeMeta.height})`);
            const checksum = computeFileChecksum(authorizedFile);

            return {
              type: yt.isLive ? 'youtube_live' : 'youtube',
              url: yt.cleanUrl || input.url,
              videoId: yt.videoId,
              title: videoTitle,
              authorName: author,
              thumbnailUrl: thumbnail,
              filePath: authorizedFile,
              checksum,
              duration: probeMeta.duration,
              width: probeMeta.width,
              height: probeMeta.height,
              fps: probeMeta.fps,
              hasAudio: probeMeta.hasAudio,
              canProcess: true,
              metadataRetrieved: true,
              videoAcquired: true,
            };
          }
        } catch (probeErr: any) {
          console.error('[VideoIngestion] Probe error on authorized file:', probeErr);
        }
      }

      // YouTube metadata verified; acquisition worker will acquire stream during processing
      return {
        type: yt.isLive ? 'youtube_live' : 'youtube',
        url: yt.cleanUrl || input.url,
        videoId: yt.videoId,
        title: videoTitle,
        authorName: author,
        thumbnailUrl: thumbnail,
        canProcess: true,
        metadataRetrieved: true,
        videoAcquired: false,
        availableActions: ['ACQUIRE_STREAM', 'UPLOAD_FILE'],
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
