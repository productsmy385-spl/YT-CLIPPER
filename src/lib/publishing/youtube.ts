import fs from 'node:fs';
import { youtubeClient } from './youtube-client.ts';

export interface YouTubePublishParams {
  filePath: string;
  title: string;
  description: string;
  tags?: string[];
  privacyStatus?: 'public' | 'unlisted' | 'private';
  publishAt?: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface PublishResult {
  success: boolean;
  platform: 'youtube_shorts' | 'instagram_reels' | 'tiktok';
  platformPostId?: string;
  publishedUrl?: string;
  studioUrl?: string;
  error?: string;
  details?: any;
}

export const youtubeService = {
  // Inspect existing YouTube account connection
  async getStatus() {
    return await youtubeClient.getStatus();
  },

  // Reconnect YouTube channel
  async reconnect() {
    return await youtubeClient.reconnect();
  },

  // Disconnect YouTube channel
  async disconnect() {
    return await youtubeClient.disconnect();
  },

  // Publish video to YouTube Shorts using official YouTube Data API v3
  async publish(params: YouTubePublishParams): Promise<PublishResult> {
    const { filePath, title, description, tags = ['shorts', 'gta6', 'gaming'], privacyStatus = 'public', publishAt } = params;

    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        platform: 'youtube_shorts',
        error: `File not found on disk: ${filePath}`,
      };
    }

    try {
      const result = await youtubeClient.uploadShort({
        filePath,
        title,
        description,
        tags,
        privacyStatus,
        publishAt,
      });

      return {
        success: result.success,
        platform: 'youtube_shorts',
        platformPostId: result.platformPostId,
        publishedUrl: result.publishedUrl,
        studioUrl: result.studioUrl,
        details: result.details,
      };
    } catch (err: any) {
      console.error('[YouTubeService] Upload error:', err.message);
      return {
        success: false,
        platform: 'youtube_shorts',
        error: err.message,
      };
    }
  },
};
