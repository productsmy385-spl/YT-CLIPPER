import { dbRepo } from '../db/repository.ts';

export type RightsStatus =
  | 'VERIFIED'
  | 'CREATIVE_COMMONS'
  | 'PENDING'
  | 'REJECTED'
  | 'EXPIRED'
  | 'UNKNOWN';

export interface RightsValidationResult {
  videoId: string;
  channelId?: string;
  creatorName?: string;
  status: RightsStatus;
  isAllowed: boolean;
  licenseType: 'standard_youtube' | 'creative_commons' | 'custom_partner' | 'public_domain' | 'unknown';
  reason: string;
  attributionRequired: boolean;
  attributionText?: string;
  derivativeUsageAllowed?: boolean;
  commercialUsageAllowed?: boolean;
  mediaAcquisitionMethod?: 'authorized_upload' | 'licensed_feed' | 'blocked';
  evidenceVerified?: boolean;
  permissionDetails?: {
    permissionId: string;
    creatorId: string;
    allowedUsage: string;
    commercialUsageAllowed: boolean;
    expiryDate?: string;
  };
}

export const rightsEngine = {
  /**
   * Generates a compliant Creative Commons (CC BY) attribution statement
   */
  generateAttributionStatement(
    creatorName: string,
    videoTitle: string,
    sourceUrl: string,
    licenseType: string = 'CC BY 4.0'
  ): string {
    return `Original Video: "${videoTitle}" by ${creatorName} (${sourceUrl}), licensed under Creative Commons Attribution 4.0 International (${licenseType}). Derivative vertical Short produced with AI Shorts Studio.`;
  },

  /**
   * Detects YouTube License via YouTube Data API (if key present) or official oEmbed / video metadata
   */
  async detectYouTubeLicense(
    videoId: string,
    url: string
  ): Promise<{
    licenseType: 'standard_youtube' | 'creative_commons' | 'unknown';
    isCreativeCommons: boolean;
    channelTitle?: string;
    videoTitle?: string;
  }> {
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (apiKey && apiKey !== 'your_youtube_api_key_here') {
      try {
        const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(apiUrl, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
          const data = await res.json();
          const item = data.items?.[0];
          if (item) {
            const license = item.status?.license || item.snippet?.license || '';
            const isCC = license.toLowerCase() === 'creativecommon';
            return {
              licenseType: isCC ? 'creative_commons' : 'standard_youtube',
              isCreativeCommons: isCC,
              channelTitle: item.snippet?.channelTitle,
              videoTitle: item.snippet?.title,
            };
          }
        }
      } catch (err) {
        console.warn('[RightsEngine] YouTube Data API license query note:', err);
      }
    }

    // Fallback: Check oEmbed interface or heuristic
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`;
      const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        return {
          licenseType: 'standard_youtube',
          isCreativeCommons: false,
          channelTitle: data.author_name,
          videoTitle: data.title,
        };
      }
    } catch {}

    return {
      licenseType: 'unknown',
      isCreativeCommons: false,
    };
  },

  /**
   * Complete Content Rights and Creator Authorization Verification
   */
  async checkSourceRights(params: {
    videoId: string;
    channelId?: string;
    sourceUrl?: string;
    title?: string;
    creatorName?: string;
    projectId?: string;
  }): Promise<RightsValidationResult> {
    const { videoId, sourceUrl = `https://www.youtube.com/watch?v=${params.videoId}`, projectId } = params;

    // 1. Check Creator Permissions Registry by Channel ID or Creator Name
    let permissionRecord = params.channelId ? dbRepo.getPermissionByChannel(params.channelId) : null;

    if (!permissionRecord && params.creatorName) {
      const creators = dbRepo.listCreators();
      const matchedCreator = creators.find(
        (c) => c.name.toLowerCase() === params.creatorName?.toLowerCase()
      );
      if (matchedCreator) {
        permissionRecord = dbRepo.getPermissionByChannel(matchedCreator.channel_id || matchedCreator.id);
      }
    }

    // If an explicit creator permission record exists, evaluate its terms
    if (permissionRecord) {
      const now = new Date();
      const isExpired = permissionRecord.expiry_date && new Date(permissionRecord.expiry_date) < now;

      if (isExpired) {
        const result: RightsValidationResult = {
          videoId,
          channelId: permissionRecord.channel_id,
          creatorName: permissionRecord.creator_name,
          status: 'EXPIRED',
          isAllowed: false,
          derivativeUsageAllowed: false,
          commercialUsageAllowed: false,
          mediaAcquisitionMethod: 'blocked',
          evidenceVerified: false,
          licenseType: 'custom_partner',
          reason: `Creator authorization expired on ${permissionRecord.expiry_date}. Please renew the agreement before processing new content.`,
          attributionRequired: false,
        };
        dbRepo.saveSourceRightsCheck({
          id: `src_chk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          projectId,
          videoId,
          channelId: permissionRecord.channel_id,
          creatorId: permissionRecord.creator_id,
          status: 'EXPIRED',
          isAllowed: false,
          reason: result.reason,
          licenseType: 'custom_partner',
        });
        return result;
      }

      if (permissionRecord.status === 'VERIFIED') {
        const result: RightsValidationResult = {
          videoId,
          channelId: permissionRecord.channel_id,
          creatorName: permissionRecord.creator_name,
          status: 'VERIFIED',
          isAllowed: true,
          derivativeUsageAllowed: true,
          commercialUsageAllowed: Boolean(permissionRecord.commercial_usage_allowed),
          mediaAcquisitionMethod: (permissionRecord.media_access_method as any) || 'authorized_upload',
          evidenceVerified: true,
          licenseType: 'custom_partner',
          reason: `Documented creator authorization verified for ${permissionRecord.creator_name} (Usage: ${permissionRecord.allowed_usage}).`,
          attributionRequired: false,
          permissionDetails: {
            permissionId: permissionRecord.id,
            creatorId: permissionRecord.creator_id,
            allowedUsage: permissionRecord.allowed_usage,
            commercialUsageAllowed: Boolean(permissionRecord.commercial_usage_allowed),
            expiryDate: permissionRecord.expiry_date,
          },
        };
        dbRepo.saveSourceRightsCheck({
          id: `src_chk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          projectId,
          videoId,
          channelId: permissionRecord.channel_id,
          creatorId: permissionRecord.creator_id,
          status: 'VERIFIED',
          isAllowed: true,
          reason: result.reason,
          licenseType: 'custom_partner',
        });
        return result;
      }

      if (permissionRecord.status === 'CREATIVE_COMMONS') {
        const attribution = this.generateAttributionStatement(
          permissionRecord.creator_name || 'Creative Commons Creator',
          params.title || 'Creative Commons Source Media',
          sourceUrl,
          'CC BY 4.0'
        );
        const result: RightsValidationResult = {
          videoId,
          channelId: permissionRecord.channel_id,
          creatorName: permissionRecord.creator_name,
          status: 'CREATIVE_COMMONS',
          isAllowed: true,
          derivativeUsageAllowed: true,
          commercialUsageAllowed: Boolean(permissionRecord.commercial_usage_allowed),
          mediaAcquisitionMethod: (permissionRecord.media_access_method as any) || 'licensed_feed',
          evidenceVerified: true,
          licenseType: 'creative_commons',
          reason: `Source content is from a verified Creative Commons (CC BY) creator or open archive. Derivative shorts and distribution are permitted with mandatory attribution.`,
          attributionRequired: true,
          attributionText: attribution,
        };
        dbRepo.saveAttributionRecord({
          id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          projectId,
          videoId,
          title: params.title || 'Creative Commons Source Media',
          creatorName: permissionRecord.creator_name || 'Creative Commons Creator',
          sourceUrl,
          licenseType: 'creative_commons',
          attributionText: attribution,
        });

        dbRepo.saveSourceRightsCheck({
          id: `src_chk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          projectId,
          videoId,
          channelId: permissionRecord.channel_id,
          creatorId: permissionRecord.creator_id,
          status: 'CREATIVE_COMMONS',
          isAllowed: true,
          reason: result.reason,
          licenseType: 'creative_commons',
        });
        return result;
      }

      if (permissionRecord.status === 'PENDING') {
        const result: RightsValidationResult = {
          videoId,
          channelId: permissionRecord.channel_id,
          creatorName: permissionRecord.creator_name,
          status: 'PENDING',
          isAllowed: false,
          derivativeUsageAllowed: false,
          commercialUsageAllowed: false,
          mediaAcquisitionMethod: 'authorized_upload',
          evidenceVerified: false,
          licenseType: 'custom_partner',
          reason: `Creator authorization request for ${permissionRecord.creator_name} is currently pending administrative review.`,
          attributionRequired: false,
        };
        dbRepo.saveSourceRightsCheck({
          id: `src_chk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          projectId,
          videoId,
          channelId: permissionRecord.channel_id,
          creatorId: permissionRecord.creator_id,
          status: 'PENDING',
          isAllowed: false,
          reason: result.reason,
          licenseType: 'custom_partner',
        });
        return result;
      }

      if (permissionRecord.status === 'REJECTED') {
        const result: RightsValidationResult = {
          videoId,
          channelId: permissionRecord.channel_id,
          creatorName: permissionRecord.creator_name,
          status: 'REJECTED',
          isAllowed: false,
          derivativeUsageAllowed: false,
          commercialUsageAllowed: false,
          mediaAcquisitionMethod: 'blocked',
          evidenceVerified: false,
          licenseType: 'custom_partner',
          reason: `Creator declined authorization for media extraction and republishing.`,
          attributionRequired: false,
        };
        dbRepo.saveSourceRightsCheck({
          id: `src_chk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          projectId,
          videoId,
          channelId: permissionRecord.channel_id,
          creatorId: permissionRecord.creator_id,
          status: 'REJECTED',
          isAllowed: false,
          reason: result.reason,
          licenseType: 'custom_partner',
        });
        return result;
      }
    }

    // 2. Check YouTube License Metadata (Creative Commons vs Standard YouTube)
    const ytLic = await this.detectYouTubeLicense(videoId, sourceUrl);
    const creatorName = ytLic.channelTitle || params.creatorName || 'Content Creator';
    const videoTitle = ytLic.videoTitle || params.title || `Video ${videoId}`;

    // Record license in database
    dbRepo.saveContentLicense({
      id: `lic_${videoId}`,
      videoId,
      channelId: params.channelId,
      licenseType: ytLic.licenseType,
      sourceUrl,
    });

    if (ytLic.isCreativeCommons) {
      const attributionText = `Original Video: "${videoTitle}" by ${creatorName} (${sourceUrl}), licensed under Creative Commons Attribution 4.0 International (CC BY 4.0). Derivative vertical Short produced with AI Shorts Studio.`;
      
      dbRepo.saveAttributionRecord({
        id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        projectId,
        videoId,
        title: videoTitle,
        creatorName,
        sourceUrl,
        licenseType: 'creative_commons',
        attributionText,
      });

      // Stricter CC validation: public CC label on YouTube alone is not sufficient to guarantee clean in-game audio/music rights
      const result: RightsValidationResult = {
        videoId,
        creatorName,
        status: 'CREATIVE_COMMONS',
        isAllowed: false, // requires authorized master recording or documented partner evidence
        derivativeUsageAllowed: false,
        commercialUsageAllowed: false,
        mediaAcquisitionMethod: 'authorized_upload',
        evidenceVerified: false,
        licenseType: 'creative_commons',
        reason: 'Creative Commons label detected on YouTube. However, a CC label alone does not verify underlying asset clearance (in-game radio, third-party music). Master recording upload or verified creator evidence required.',
        attributionRequired: true,
        attributionText,
      };

      dbRepo.saveSourceRightsCheck({
        id: `src_chk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        projectId,
        videoId,
        status: 'CREATIVE_COMMONS',
        isAllowed: false,
        reason: result.reason,
        licenseType: 'creative_commons',
      });

      return result;
    }

    // 3. Standard YouTube License or Unknown without registered authorization
    const reason =
      'Standard YouTube License detected. Automated media acquisition requires creator authorization on file or an uploaded master recording.';

    const result: RightsValidationResult = {
      videoId,
      creatorName,
      status: 'UNKNOWN',
      isAllowed: false,
      derivativeUsageAllowed: false,
      commercialUsageAllowed: false,
      mediaAcquisitionMethod: 'authorized_upload',
      evidenceVerified: false,
      licenseType: ytLic.licenseType,
      reason,
      attributionRequired: false,
    };

    dbRepo.saveSourceRightsCheck({
      id: `src_chk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      projectId,
      videoId,
      status: 'UNKNOWN',
      isAllowed: false,
      reason,
      licenseType: ytLic.licenseType,
    });

    return result;
  },
};
