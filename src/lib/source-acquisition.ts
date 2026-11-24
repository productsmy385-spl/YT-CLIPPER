import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { ffmpegCore } from './ffmpeg-core.ts';
import { computeFileChecksum, videoIngestionEngine } from './video-ingestion.ts';
import { rightsEngine, type RightsValidationResult } from './rights-engine.ts';
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
    // 4. YOUTUBE URL PATHWAY (APPROVED & AUTHORIZED MEDIA SOURCES)
    // -------------------------------------------------------------------------
    const parsedYt = videoIngestionEngine.parseYouTubeUrl(sourceUrl);
    const resolvedVideoId = videoId || parsedYt.videoId;

    if (!parsedYt.isValid || !resolvedVideoId) {
      return {
        sourceType: 'youtube',
        sourceUrl,
        acquisitionStatus: 'failed',
        error: 'Invalid YouTube video URL format. Supported formats: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID.',
        canRetry: false,
      };
    }

    console.log(`[MediaAcquisitionService] Resolving authorized media source for YouTube video: ${resolvedVideoId}...`);

    // A. Check local authorized disk repository (e.g. registered master recording for this stream)
    const existingFile = videoIngestionEngine.findAuthorizedSourceFile(resolvedVideoId);
    if (existingFile && fs.existsSync(existingFile)) {
      try {
        fs.copyFileSync(existingFile, targetSourcePath);
        const meta = ffmpegCore.probe(targetSourcePath);
        const checksum = computeFileChecksum(targetSourcePath);

        return {
          sourceType: 'youtube',
          sourceUrl,
          videoId: resolvedVideoId,
          filePath: targetSourcePath,
          storageKey: `projects/${projectId}/source/${path.basename(targetSourcePath)}`,
          acquisitionStatus: 'ready',
          provider: 'authorized_media_repository',
          authorizationReference: `disk_repository:${path.basename(existingFile)}`,
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
        console.warn(`[MediaAcquisitionService] Note on local authorized copy:`, err.message);
      }
    }

    // B. Check documented creator permission / partner agreements on file
    const rights = await rightsEngine.checkSourceRights({
      videoId: resolvedVideoId,
      sourceUrl,
      creatorName,
      projectId,
    });

    if (rights.status === 'VERIFIED' && rights.isAllowed) {
      // Look for authorized partner file
      const partnerFile = videoIngestionEngine.findAuthorizedSourceFile(resolvedVideoId);
      if (partnerFile && fs.existsSync(partnerFile)) {
        fs.copyFileSync(partnerFile, targetSourcePath);
        const meta = ffmpegCore.probe(targetSourcePath);
        const checksum = computeFileChecksum(targetSourcePath);

        return {
          sourceType: 'youtube',
          sourceUrl,
          videoId: resolvedVideoId,
          filePath: targetSourcePath,
          acquisitionStatus: 'ready',
          provider: 'creator_partner_feed',
          authorizationReference: `creator_agreement:${rights.creatorName}`,
          metadata: {
            duration: meta.duration,
            width: meta.width,
            height: meta.height,
            fps: meta.fps,
            hasAudio: meta.hasAudio,
            checksum,
          },
        };
      }
    }

    // C. Check Creative Commons (CC BY) verified archive stream
    if (rights.status === 'CREATIVE_COMMONS' && rights.isAllowed) {
      console.log(`[MediaAcquisitionService] Ingesting Creative Commons stream for ${resolvedVideoId}...`);
      const ccFile = await videoIngestionEngine.acquireYouTubeStream(resolvedVideoId, sourceUrl, false, { maxDurationSeconds: 120 });
      if (ccFile && fs.existsSync(ccFile)) {
        fs.copyFileSync(ccFile, targetSourcePath);
        const meta = ffmpegCore.probe(targetSourcePath);
        const checksum = computeFileChecksum(targetSourcePath);

        return {
          sourceType: 'youtube',
          sourceUrl,
          videoId: resolvedVideoId,
          filePath: targetSourcePath,
          acquisitionStatus: 'ready',
          provider: 'creative_commons_stream',
          authorizationReference: 'cc_by_4.0_license',
          metadata: {
            duration: meta.duration,
            width: meta.width,
            height: meta.height,
            fps: meta.fps,
            hasAudio: meta.hasAudio,
            checksum,
          },
        };
      }
    }

    // D. Technical Error: The YouTube video is not available via an authorized source
    // In accordance with YouTube API policies, YouTube Data API returns metadata only and does not supply downloadable video bytes.
    const technicalError = `Media acquisition failed for YouTube video (${resolvedVideoId}): The YouTube Data API provides video metadata only and does not supply downloadable audiovisual content. To extract AI Shorts, an authorized media stream, partner feed, or direct recording must be available for this video.`;

    return {
      sourceType: 'youtube',
      sourceUrl,
      videoId: resolvedVideoId,
      acquisitionStatus: 'failed',
      error: technicalError,
      canRetry: true,
      availableAlternatives: ['direct_url', 'upload'],
    };
  }

  /**
   * Pre-flight availability check for UI rendering
   */
  async checkAcquisitionAvailability(params: {
    videoId: string;
    sourceUrl?: string;
    channelId?: string;
    creatorName?: string;
    rights?: RightsValidationResult;
  }): Promise<AcquisitionAvailability> {
    const { videoId, sourceUrl, channelId, creatorName } = params;

    // Direct MP4 check
    if (sourceUrl && (sourceUrl.endsWith('.mp4') || sourceUrl.endsWith('.mov') || sourceUrl.endsWith('.webm'))) {
      return {
        isAvailable: true,
        providerName: 'Direct Media Stream',
        providerType: 'direct_url',
        reason: 'Direct MP4/MOV streaming URL is available for immediate acquisition.',
        canAcquireDirectly: true,
        availableActions: ['START_PIPELINE', 'ACQUIRE_MEDIA'],
      };
    }

    // Check disk repository
    const existing = videoIngestionEngine.findAuthorizedSourceFile(videoId);
    if (existing && fs.existsSync(existing)) {
      return {
        isAvailable: true,
        providerName: 'Authorized Media Repository',
        providerType: 'licensed_repository',
        reason: 'Authorized recording found in local media repository.',
        canAcquireDirectly: true,
        availableActions: ['START_PIPELINE', 'ACQUIRE_MEDIA'],
      };
    }

    const rights = params.rights || (await rightsEngine.checkSourceRights({ videoId, sourceUrl, channelId, creatorName }));

    if (rights.status === 'VERIFIED' && rights.isAllowed) {
      return {
        isAvailable: true,
        providerName: 'Creator Partner Media Feed',
        providerType: 'partner_feed',
        rights,
        reason: `Documented creator authorization on file for ${rights.creatorName || 'creator'}.`,
        canAcquireDirectly: true,
        availableActions: ['START_PIPELINE', 'ACQUIRE_MEDIA'],
      };
    }

    if (rights.status === 'CREATIVE_COMMONS' && rights.isAllowed) {
      return {
        isAvailable: true,
        providerName: 'Creative Commons Stream Acquirer',
        providerType: 'creative_commons_stream',
        rights,
        reason: 'Verified Creative Commons CC BY repository.',
        canAcquireDirectly: true,
        availableActions: ['START_PIPELINE', 'ACQUIRE_MEDIA'],
      };
    }

    return {
      isAvailable: false,
      providerType: 'none',
      rights,
      reason: `The YouTube Data API provides metadata only and does not provide downloadable video bytes. Creator "${creatorName || 'Partner'}" has not registered an automated media stream on file.`,
      canAcquireDirectly: false,
      availableActions: ['UPLOAD_FILE', 'REGISTER_CREATOR'],
    };
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
