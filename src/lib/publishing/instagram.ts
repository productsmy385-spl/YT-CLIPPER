import fs from 'node:fs';
import { instagramClient } from './instagram-client.ts';
import type { PublishResult } from './youtube.ts';

export interface InstagramPublishParams {
  filePath: string;
  videoUrl?: string;
  caption: string;
  shareToFeed?: boolean;
}

export const instagramService = {
  // Inspect Meta Instagram connection
  async getStatus() {
    return await instagramClient.getStatus();
  },

  // Publish Reel to Instagram using official Meta Graph API v21.0
  async publish(params: InstagramPublishParams): Promise<PublishResult> {
    const { filePath, videoUrl, caption, shareToFeed = true } = params;

    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        platform: 'instagram_reels',
        error: `File not found on disk: ${filePath}`,
      };
    }

    try {
      const result = await instagramClient.publishReel({
        filePath,
        videoUrl,
        caption,
        shareToFeed,
      });

      return {
        success: result.success,
        platform: 'instagram_reels',
        platformPostId: result.platformPostId,
        publishedUrl: result.publishedUrl,
        error: result.error,
        details: result.details,
      };
    } catch (err: any) {
      console.error('[InstagramService] Publish error:', err.message);
      return {
        success: false,
        platform: 'instagram_reels',
        error: err.message,
      };
    }
  },
};
