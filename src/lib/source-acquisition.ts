import path from 'node:path';
import fs from 'node:fs';
import { ffmpegCore } from './ffmpeg-core.ts';
import { computeFileChecksum, videoIngestionEngine } from './video-ingestion.ts';
import { rightsEngine, type RightsValidationResult } from './rights-engine.ts';
import { AUTHORIZED_SOURCES_DIR } from './app-paths.ts';
import { dbRepo } from '../db/repository.ts';

export interface AcquisitionResult {
  success: boolean;
  filePath?: string;
  checksum?: string;
  duration?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
  provider: 'authorized_upload' | 'creative_commons_stream' | 'licensed_repository' | 'partner_feed' | 'none';
  rightsResult: RightsValidationResult;
  error?: string;
}

export interface MediaAcquisitionProvider {
  name: string;
  canHandle(rights: RightsValidationResult, videoId: string, url?: string): boolean;
  acquire(params: {
    videoId: string;
    url?: string;
    rights: RightsValidationResult;
    targetDir: string;
    targetFileName?: string;
  }): Promise<{ filePath: string; provider: AcquisitionResult['provider'] } | null>;
}

/**
 * Provider 1: Licensed Media Repository
 * Checks if authorized original recording is in the licensed media repository on disk
 */
class LicensedRepositoryProvider implements MediaAcquisitionProvider {
  name = 'Licensed Media Repository';

  canHandle(rights: RightsValidationResult, videoId: string, url?: string): boolean {
    return rights.isAllowed || rights.status === 'VERIFIED';
  }

  async acquire(params: {
    videoId: string;
    url?: string;
    rights: RightsValidationResult;
    targetDir: string;
    targetFileName?: string;
  }) {
    const existing = videoIngestionEngine.findAuthorizedSourceFile(params.videoId);
    if (existing && fs.existsSync(existing)) {
      return { filePath: existing, provider: 'licensed_repository' as const };
    }
    return null;
  }
}

/**
 * Provider 2: Creative Commons Media Acquisition
 * When CC-BY license is verified, acquires media via yt-dlp remuxer safely
 */
class CreativeCommonsProvider implements MediaAcquisitionProvider {
  name = 'Creative Commons Stream Acquirer';

  canHandle(rights: RightsValidationResult, videoId: string, url?: string): boolean {
    return rights.status === 'CREATIVE_COMMONS' && rights.isAllowed;
  }

  async acquire(params: {
    videoId: string;
    url?: string;
    rights: RightsValidationResult;
    targetDir: string;
    targetFileName?: string;
  }) {
    if (!params.url) return null;
    const targetFile = path.resolve(AUTHORIZED_SOURCES_DIR, `${params.videoId}.mp4`);
    if (fs.existsSync(targetFile) && fs.statSync(targetFile).size > 100000) {
      return { filePath: targetFile, provider: 'creative_commons_stream' as const };
    }

    const acquired = await videoIngestionEngine.acquireYouTubeStream(
      params.videoId,
      params.url,
      false,
      { maxDurationSeconds: 120 }
    );

    if (acquired && fs.existsSync(acquired)) {
      return { filePath: acquired, provider: 'creative_commons_stream' as const };
    }
    return null;
  }
}

/**
 * Provider 3: Creator Uploaded Media Provider
 * Matches user's uploaded master recording
 */
class CreatorUploadProvider implements MediaAcquisitionProvider {
  name = 'Creator Master Upload';

  canHandle(rights: RightsValidationResult, videoId: string, url?: string): boolean {
    return true;
  }

  async acquire(params: {
    videoId: string;
    url?: string;
    rights: RightsValidationResult;
    targetDir: string;
    targetFileName?: string;
  }) {
    const existing = videoIngestionEngine.findAuthorizedSourceFile(params.videoId);
    if (existing && fs.existsSync(existing)) {
      return { filePath: existing, provider: 'authorized_upload' as const };
    }
    return null;
  }
}

export const sourceAcquisitionEngine = {
  providers: [
    new LicensedRepositoryProvider(),
    new CreativeCommonsProvider(),
    new CreatorUploadProvider(),
  ],

  /**
   * Complete modular source resolution and acquisition
   */
  async acquireAuthorizedSource(params: {
    videoId: string;
    sourceUrl?: string;
    channelId?: string;
    creatorName?: string;
    uploadedFilePath?: string;
    projectId?: string;
  }): Promise<AcquisitionResult> {
    const { videoId, sourceUrl, channelId, creatorName, uploadedFilePath, projectId } = params;

    // 1. Run Rights Verification Engine
    const rights = await rightsEngine.checkSourceRights({
      videoId,
      channelId,
      sourceUrl,
      creatorName,
      projectId,
    });

    // Case A: If user provided an uploaded recording directly
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      const meta = ffmpegCore.probe(uploadedFilePath);
      const checksum = computeFileChecksum(uploadedFilePath);
      return {
        success: true,
        filePath: uploadedFilePath,
        checksum,
        duration: meta.duration,
        width: meta.width,
        height: meta.height,
        hasAudio: meta.hasAudio,
        provider: 'authorized_upload',
        rightsResult: {
          ...rights,
          status: rights.status === 'UNKNOWN' ? 'VERIFIED' : rights.status,
          isAllowed: true,
          reason: 'Authorized creator recording provided directly via verified upload.',
        },
      };
    }

    // Case B: If rights check forbids automated acquisition
    if (!rights.isAllowed) {
      return {
        success: false,
        provider: 'none',
        rightsResult: rights,
        error: rights.reason,
      };
    }

    // Case C: Rights are allowed (VERIFIED or CREATIVE_COMMONS) - try modular providers
    for (const provider of this.providers) {
      if (provider.canHandle(rights, videoId, sourceUrl)) {
        try {
          const acquired = await provider.acquire({
            videoId,
            url: sourceUrl,
            rights,
            targetDir: AUTHORIZED_SOURCES_DIR,
          });

          if (acquired && acquired.filePath && fs.existsSync(acquired.filePath)) {
            const meta = ffmpegCore.probe(acquired.filePath);
            const checksum = computeFileChecksum(acquired.filePath);

            return {
              success: true,
              filePath: acquired.filePath,
              checksum,
              duration: meta.duration,
              width: meta.width,
              height: meta.height,
              hasAudio: meta.hasAudio,
              provider: acquired.provider,
              rightsResult: rights,
            };
          }
        } catch (provErr: any) {
          console.warn(`[SourceAcquisition] Provider ${provider.name} note:`, provErr.message);
        }
      }
    }

    return {
      success: false,
      provider: 'none',
      rightsResult: rights,
      error: `Media source acquisition could not find authorized stream file for ${videoId}. Please attach the original recording.`,
    };
  },
};
