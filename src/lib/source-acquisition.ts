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

export interface AcquisitionAvailability {
  isAvailable: boolean;
  providerName?: string;
  providerType: AcquisitionResult['provider'];
  rights: RightsValidationResult;
  reason: string;
  canAcquireDirectly: boolean;
  availableActions: Array<'START_PIPELINE' | 'ACQUIRE_MEDIA' | 'UPLOAD_FILE' | 'REGISTER_CREATOR'>;
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
 * Provider 3: Creator Partner Feed & Connected Storage Integration
 */
class CreatorPartnerFeedProvider implements MediaAcquisitionProvider {
  name = 'Creator Partner Feed & Storage';

  canHandle(rights: RightsValidationResult, videoId: string, url?: string): boolean {
    return rights.status === 'VERIFIED' && rights.isAllowed;
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
      return { filePath: existing, provider: 'partner_feed' as const };
    }

    const partnerCandidates = [
      path.resolve(AUTHORIZED_SOURCES_DIR, `${params.videoId}.mp4`),
      path.resolve(AUTHORIZED_SOURCES_DIR, `${params.videoId}.mov`),
      path.resolve(AUTHORIZED_SOURCES_DIR, `${params.videoId}.mkv`),
    ];
    for (const pf of partnerCandidates) {
      if (fs.existsSync(pf) && fs.statSync(pf).size > 100000) {
        return { filePath: pf, provider: 'partner_feed' as const };
      }
    }
    return null;
  }
}

/**
 * Provider 4: Direct Authorized Media URL Provider
 */
class DirectAuthorizedUrlProvider implements MediaAcquisitionProvider {
  name = 'Direct Authorized Media URL';

  canHandle(rights: RightsValidationResult, videoId: string, url?: string): boolean {
    if (!url) return false;
    return url.match(/\.(mp4|mov|webm|mkv)(\?|$)/i) !== null && (rights.isAllowed || rights.status === 'VERIFIED');
  }

  async acquire(params: {
    videoId: string;
    url?: string;
    rights: RightsValidationResult;
    targetDir: string;
    targetFileName?: string;
  }) {
    if (!params.url) return null;
    const dest = path.join(params.targetDir, params.targetFileName || `${params.videoId}_direct.mp4`);
    try {
      const res = await fetch(params.url, { signal: AbortSignal.timeout(60000) });
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        fs.writeFileSync(dest, Buffer.from(buffer));
        return { filePath: dest, provider: 'licensed_repository' as const };
      }
    } catch (err: any) {
      console.warn('[DirectAuthorizedUrlProvider] Fetch error:', err.message);
    }
    return null;
  }
}

/**
 * Provider 5: Creator Uploaded Media Provider
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
    new CreatorPartnerFeedProvider(),
    new DirectAuthorizedUrlProvider(),
    new CreativeCommonsProvider(),
    new CreatorUploadProvider(),
  ],

  /**
   * Pre-check availability of authorized media acquisition for a given source video
   */
  async checkAcquisitionAvailability(params: {
    videoId: string;
    sourceUrl?: string;
    channelId?: string;
    creatorName?: string;
    rights?: RightsValidationResult;
  }): Promise<AcquisitionAvailability> {
    const { videoId, sourceUrl, channelId, creatorName } = params;
    const rights = params.rights || (await rightsEngine.checkSourceRights({ videoId, sourceUrl, channelId, creatorName }));

    // Check if an authorized source file is already present on disk
    const existing = videoIngestionEngine.findAuthorizedSourceFile(videoId);
    if (existing && fs.existsSync(existing)) {
      return {
        isAvailable: true,
        providerName: 'Licensed Media Repository',
        providerType: 'licensed_repository',
        rights,
        reason: 'Authorized recording found in licensed media repository.',
        canAcquireDirectly: true,
        availableActions: ['START_PIPELINE', 'ACQUIRE_MEDIA'],
      };
    }

    // Check creator permission status
    if (rights.status === 'VERIFIED' && rights.isAllowed) {
      return {
        isAvailable: true,
        providerName: 'Creator Partner Feed & Storage',
        providerType: 'partner_feed',
        rights,
        reason: `Documented creator authorization on file for ${rights.creatorName || 'creator'}. Source media acquisition is authorized.`,
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
        reason: 'Verified Creative Commons repository with cleared derivative rights. Automated stream remuxing available.',
        canAcquireDirectly: true,
        availableActions: ['START_PIPELINE', 'ACQUIRE_MEDIA'],
      };
    }

    let reason = rights.reason;
    if (rights.status === 'UNKNOWN') {
      reason = `Media source acquisition is not available for this URL. Under YouTube API policies, automated audiovisual downloads of public third-party videos without creator permission are restricted. Creator "${creatorName || 'Content Creator'}" has not registered authorization on file.`;
    }

    return {
      isAvailable: false,
      providerType: 'none',
      rights,
      reason,
      canAcquireDirectly: false,
      availableActions: ['UPLOAD_FILE', 'REGISTER_CREATOR'],
    };
  },

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
