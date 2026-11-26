import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { ffmpegCore } from './ffmpeg-core.ts';
import { computeFileChecksum, videoIngestionEngine } from './video-ingestion.ts';
import { type RightsValidationResult } from './rights-engine.ts';
import { inspectYouTubeVideo, acquireOwnedYouTubeVideo, AcquisitionError } from './youtube/media-source.ts';
import { AUTHORIZED_SOURCES_DIR, STORAGE_DOWNLOADS_DIR, getProjectStoragePaths } from './app-paths.ts';
import { dbRepo } from '../db/repository.ts';

export type MediaSourceType = 'youtube' | 'direct_url' | 'cloud_storage' | 'upload';
export type MediaAcquisitionStatus = 'pending' | 'acquiring' | 'ready' | 'failed';

export interface MediaSourceMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  bitrate?: number;
  hasAudio: boolean;
  audioChannels?: number;
  audioCodec?: string;
  codec?: string;
  fileSize?: number;
  checksum?: string;
}

/**
 * Unified MediaSource Abstraction
 * Represents any acquired audiovisual asset regardless of original ingest origin.
 */
export interface MediaSource {
  sourceType: MediaSourceType;
  sourceUrl?: string;
  videoId?: string;
  storageKey?: string;
  filePath?: string;
  acquisitionStatus: MediaAcquisitionStatus;
  metadata?: MediaSourceMetadata;
  authorizationReference?: string;
  provider?: string;
  error?: string;
  canRetry?: boolean;
  availableAlternatives?: Array<'upload' | 'direct_url' | 'partner_feed'>;
}

export interface AcquisitionResult {
  success: boolean;
  filePath?: string;
  checksum?: string;
  duration?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
  provider: 'authorized_upload' | 'creative_commons_stream' | 'licensed_repository' | 'partner_feed' | 'direct_url' | 'cloud_storage' | 'none';
  rightsResult?: RightsValidationResult;
  error?: string;
}

export interface AcquisitionAvailability {
  isAvailable: boolean;
  providerName?: string;
  providerType: AcquisitionResult['provider'];
  rights?: RightsValidationResult;
  reason: string;
  canAcquireDirectly: boolean;
  availableActions: Array<'START_PIPELINE' | 'ACQUIRE_MEDIA' | 'UPLOAD_FILE' | 'REGISTER_CREATOR'>;
}

/**
 * Download a direct MP4/MOV/media file from HTTP/HTTPS with size checks and timeout
 */
async function downloadDirectMediaFile(
  url: string,
  targetFilePath: string,
  timeoutMs: number = 60000
): Promise<string> {
  const dir = path.dirname(targetFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'GTA6-AI-Shorts-Creator/1.0 (MediaAcquisitionEngine)',
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP download failed with status ${res.status} (${res.statusText})`);
    }

    const fileStream = fs.createWriteStream(targetFilePath);
    if (!res.body) {
      throw new Error('Response body is null');
    }

    // Node.js web streams pipeline
    const { Readable } = await import('node:stream');
    // @ts-ignore
    const nodeReadable = Readable.fromWeb(res.body);
    await new Promise<void>((resolve, reject) => {
      nodeReadable.pipe(fileStream);
      nodeReadable.on('error', reject);
      fileStream.on('finish', () => resolve());
      fileStream.on('error', reject);
    });

    if (!fs.existsSync(targetFilePath) || fs.statSync(targetFilePath).size < 1000) {
      throw new Error('Downloaded media file is empty or corrupted (< 1KB)');
    }

    return targetFilePath;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Dedicated Media Acquisition Service
 * Manages authorized media acquisition across YouTube, direct media URLs, cloud storage, and local uploads.
 */
export class MediaAcquisitionService {
  /**
   * Detects source type from URL or path
   */
  detectSourceType(input?: string): MediaSourceType {
    if (!input || typeof input !== 'string') return 'upload';
    const trimmed = input.trim();

    // Check YouTube
    const yt = videoIngestionEngine.parseYouTubeUrl(trimmed);
    if (yt.isValid && yt.videoId) return 'youtube';

    // Check Cloud Storage schemes
    if (trimmed.startsWith('s3://') || trimmed.startsWith('gs://') || trimmed.includes('.r2.cloudflarestorage.com') || trimmed.includes('.blob.core.windows.net')) {
      return 'cloud_storage';
    }

    // Check Direct HTTP(S) video URLs
    if (/^https?:\/\//i.test(trimmed)) {
      if (/\.(mp4|mov|webm|mkv|m4v)(\?.*)?$/i.test(trimmed) || trimmed.includes('/video/') || trimmed.includes('/raw/')) {
        return 'direct_url';
      }
    }

    // Default to upload / local file
    return 'upload';
  }

  /**
   * Primary acquisition entrypoint: Acquires media for a project from supported sources.
   * If media cannot be acquired, returns clear technical error (does NOT silently force local upload).
   */
  async acquireMedia(params: {
    sourceUrl?: string;
    sourceFile?: string;
    videoId?: string;
    projectId: string;
    creatorName?: string;
    signal?: AbortSignal;
  }): Promise<MediaSource> {
    const { sourceUrl, sourceFile, videoId, projectId, creatorName } = params;
    const storagePaths = getProjectStoragePaths(projectId);
    const targetSourcePath = path.join(storagePaths.sourceDir, `${projectId}_master.mp4`);

    console.log(`[MediaAcquisitionService] Acquiring media for project ${projectId}...`);

    // -------------------------------------------------------------------------
    // 1. LOCAL UPLOAD PATHWAY
    // -------------------------------------------------------------------------
    if (sourceFile) {
      if (!fs.existsSync(sourceFile)) {
        return {
          sourceType: 'upload',
          sourceUrl,
          filePath: sourceFile,
          acquisitionStatus: 'failed',
          error: `Specified source file does not exist on disk: ${sourceFile}`,
          canRetry: false,
          availableAlternatives: ['upload', 'direct_url'],
        };
      }

      try {
        fs.copyFileSync(sourceFile, targetSourcePath);
        const meta = ffmpegCore.probe(targetSourcePath);
        if (meta.duration <= 0) {
          return {
            sourceType: 'upload',
            filePath: targetSourcePath,
            acquisitionStatus: 'failed',
            error: 'Source video stream contains 0 seconds duration or corrupted container.',
            canRetry: true,
          };
        }
        const checksum = computeFileChecksum(targetSourcePath);

        return {
          sourceType: 'upload',
          filePath: targetSourcePath,
          storageKey: `projects/${projectId}/source/${path.basename(targetSourcePath)}`,
          acquisitionStatus: 'ready',
          provider: 'local_upload',
          metadata: {
            duration: meta.duration,
            width: meta.width,
            height: meta.height,
            fps: meta.fps,
            bitrate: meta.bitrate,
            hasAudio: meta.hasAudio,
            audioChannels: meta.audioChannels,
            audioCodec: meta.audioCodec,
            codec: meta.codec,
            fileSize: fs.statSync(targetSourcePath).size,
            checksum,
          },
        };
      } catch (err: any) {
        return {
          sourceType: 'upload',
          filePath: sourceFile,
          acquisitionStatus: 'failed',
          error: `Failed to ingest uploaded video: ${err.message}`,
          canRetry: true,
        };
      }
    }

    if (!sourceUrl) {
      return {
        sourceType: 'upload',
        acquisitionStatus: 'failed',
        error: 'No source URL or local file provided.',
        canRetry: false,
      };
    }

    const sourceType = this.detectSourceType(sourceUrl);

    // -------------------------------------------------------------------------
    // 2. DIRECT MP4/MOV URL PATHWAY
    // -------------------------------------------------------------------------
    if (sourceType === 'direct_url') {
      console.log(`[MediaAcquisitionService] Direct media URL detected: ${sourceUrl}`);
      try {
        const hash = crypto.createHash('md5').update(sourceUrl).digest('hex').substring(0, 12);
        const downloadDest = path.join(STORAGE_DOWNLOADS_DIR, `direct_${hash}.mp4`);

        let sourceOnDisk = downloadDest;
        if (!fs.existsSync(downloadDest) || fs.statSync(downloadDest).size < 1000) {
          console.log(`[MediaAcquisitionService] Downloading direct media from ${sourceUrl}...`);
          await downloadDirectMediaFile(sourceUrl, downloadDest);
        }

        fs.copyFileSync(sourceOnDisk, targetSourcePath);
        const meta = ffmpegCore.probe(targetSourcePath);
        if (meta.duration <= 0) {
          return {
            sourceType: 'direct_url',
            sourceUrl,
            acquisitionStatus: 'failed',
            error: 'Direct media stream contains 0 duration or corrupted container.',
            canRetry: true,
          };
        }
        const checksum = computeFileChecksum(targetSourcePath);

        return {
          sourceType: 'direct_url',
          sourceUrl,
          filePath: targetSourcePath,
          storageKey: `projects/${projectId}/source/${path.basename(targetSourcePath)}`,
          acquisitionStatus: 'ready',
          provider: 'direct_url',
          metadata: {
            duration: meta.duration,
            width: meta.width,
            height: meta.height,
            fps: meta.fps,
            bitrate: meta.bitrate,
            hasAudio: meta.hasAudio,
            audioChannels: meta.audioChannels,
            audioCodec: meta.audioCodec,
            codec: meta.codec,
            fileSize: fs.statSync(targetSourcePath).size,
            checksum,
          },
        };
      } catch (err: any) {
        return {
          sourceType: 'direct_url',
          sourceUrl,
          acquisitionStatus: 'failed',
          error: `Failed to acquire direct media URL: ${err.message}`,
          canRetry: true,
          availableAlternatives: ['upload'],
        };
      }
    }

    // -------------------------------------------------------------------------
    // 3. CLOUD STORAGE (S3/GCS) PATHWAY
    // -------------------------------------------------------------------------
    if (sourceType === 'cloud_storage') {
      console.log(`[MediaAcquisitionService] Cloud storage source detected: ${sourceUrl}`);
      try {
        // If it's an HTTP presigned link or public cloud URL
        if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
          const downloadDest = path.join(STORAGE_DOWNLOADS_DIR, `cloud_${projectId}.mp4`);
          await downloadDirectMediaFile(sourceUrl, downloadDest);
          fs.copyFileSync(downloadDest, targetSourcePath);
        } else {
          throw new Error(`Direct protocol ${sourceUrl.split('://')[0]} requires presigned HTTPS URL or credentials.`);
        }

        const meta = ffmpegCore.probe(targetSourcePath);
        const checksum = computeFileChecksum(targetSourcePath);
        return {
          sourceType: 'cloud_storage',
          sourceUrl,
          filePath: targetSourcePath,
          acquisitionStatus: 'ready',
          provider: 'cloud_storage',
          metadata: {
            duration: meta.duration,
            width: meta.width,
            height: meta.height,
            fps: meta.fps,
            hasAudio: meta.hasAudio,
            checksum,
          },
        };
      } catch (err: any) {
        return {
          sourceType: 'cloud_storage',
          sourceUrl,
          acquisitionStatus: 'failed',
          error: `Cloud storage acquisition error: ${err.message}`,
          canRetry: true,
        };
      }
    }

    // -------------------------------------------------------------------------
    // 4. YOUTUBE URL PATHWAY: only videos owned by the connected channel are fetched (see youtube/media-source.ts)
    // -------------------------------------------------------------------------
    const inspection = await inspectYouTubeVideo(sourceUrl);
    if ('error' in inspection) {
      return { sourceType: 'youtube', sourceUrl, acquisitionStatus: 'failed', error: inspection.error, canRetry: false };
    }

    // A. A recording of this video already placed in the server's source repository by the operator.
    const existingFile = videoIngestionEngine.findAuthorizedSourceFile(inspection.videoId);
    let acquiredPath: string | null = existingFile && fs.existsSync(existingFile) ? existingFile : null;
    let provider = 'authorized_media_repository';

    // B. The connected channel owns the video: fetch it.
    if (!acquiredPath) {
      if (!inspection.canAcquire) {
        return {
          sourceType: 'youtube',
          sourceUrl,
          videoId: inspection.videoId,
          acquisitionStatus: 'failed',
          error: inspection.message,
          canRetry: inspection.blocker === 'REAUTH_REQUIRED' || inspection.blocker === 'NOT_CONNECTED',
          availableAlternatives: ['upload'],
        };
      }
      try {
        acquiredPath = await acquireOwnedYouTubeVideo(inspection, path.join(storagePaths.sourceDir, `${projectId}_yt_${inspection.videoId}.mp4`), () => {}, params.signal);
        provider = 'owned_channel_youtube';
      } catch (err: any) {
        return {
          sourceType: 'youtube',
          sourceUrl,
          videoId: inspection.videoId,
          acquisitionStatus: 'failed',
          error: err.message,
          canRetry: err instanceof AcquisitionError ? err.retryable : true,
          availableAlternatives: ['upload'],
        };
      }
    }

    if (path.resolve(acquiredPath) !== path.resolve(targetSourcePath)) fs.copyFileSync(acquiredPath, targetSourcePath);
    const meta = ffmpegCore.probe(targetSourcePath);
    if (!meta || meta.duration <= 0) {
      return { sourceType: 'youtube', sourceUrl, videoId: inspection.videoId, acquisitionStatus: 'failed', error: 'The fetched file is not a playable video.', canRetry: true };
    }
    return {
      sourceType: 'youtube',
      sourceUrl,
      videoId: inspection.videoId,
      filePath: targetSourcePath,
      storageKey: `projects/${projectId}/source/${path.basename(targetSourcePath)}`,
      acquisitionStatus: 'ready',
      provider,
      authorizationReference: provider === 'owned_channel_youtube' ? `channel:${inspection.channelId}` : `disk_repository:${path.basename(acquiredPath)}`,
      metadata: {
        duration: meta.duration,
        width: meta.width,
        height: meta.height,
        fps: meta.fps,
        bitrate: meta.bitrate,
        hasAudio: meta.hasAudio,
        audioChannels: meta.audioChannels,
        audioCodec: meta.audioCodec,
        codec: meta.codec,
        fileSize: fs.statSync(targetSourcePath).size,
        checksum: computeFileChecksum(targetSourcePath),
      },
    };
  }

  /**
   * Truthful pre-flight check for the UI: says whether media can actually be acquired, not merely whether
   * metadata exists.
   */
  async checkAcquisitionAvailability(params: { videoId: string; sourceUrl?: string }): Promise<AcquisitionAvailability> {
    const existing = videoIngestionEngine.findAuthorizedSourceFile(params.videoId);
    if (existing && fs.existsSync(existing)) {
      return {
        isAvailable: true,
        providerName: 'Server media repository',
        providerType: 'licensed_repository',
        reason: 'A recording of this video is already on the server.',
        canAcquireDirectly: true,
        availableActions: ['START_PIPELINE'],
      };
    }
    const inspection = await inspectYouTubeVideo(params.sourceUrl || `https://www.youtube.com/watch?v=${params.videoId}`);
    if ('error' in inspection) {
      return { isAvailable: false, providerType: 'none', reason: inspection.error, canAcquireDirectly: false, availableActions: ['UPLOAD_FILE'] };
    }
    return inspection.canAcquire
      ? { isAvailable: true, providerName: 'Your YouTube channel', providerType: 'partner_feed', reason: 'This video is on your connected channel.', canAcquireDirectly: true, availableActions: ['START_PIPELINE'] }
      : { isAvailable: false, providerType: 'none', reason: inspection.message || 'This video cannot be fetched.', canAcquireDirectly: false, availableActions: ['UPLOAD_FILE'] };
  }

  /**
   * Backwards-compatibility wrapper for acquireAuthorizedSource
   */
  async acquireAuthorizedSource(params: {
    videoId: string;
    sourceUrl?: string;
    channelId?: string;
    creatorName?: string;
    uploadedFilePath?: string;
    projectId?: string;
  }): Promise<AcquisitionResult> {
    const dummyProj = params.projectId || `acq_${Date.now()}`;
    const res = await this.acquireMedia({
      sourceUrl: params.sourceUrl,
      sourceFile: params.uploadedFilePath,
      videoId: params.videoId,
      projectId: dummyProj,
      creatorName: params.creatorName,
    });

    if (res.acquisitionStatus === 'ready' && res.filePath) {
      return {
        success: true,
        filePath: res.filePath,
        checksum: res.metadata?.checksum,
        duration: res.metadata?.duration,
        width: res.metadata?.width,
        height: res.metadata?.height,
        hasAudio: res.metadata?.hasAudio,
        provider: (res.provider as any) || 'licensed_repository',
      };
    }

    return {
      success: false,
      provider: 'none',
      error: res.error,
    };
  }
}

export const mediaAcquisitionService = new MediaAcquisitionService();
export const sourceAcquisitionEngine = mediaAcquisitionService;
