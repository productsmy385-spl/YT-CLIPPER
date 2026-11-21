import fs from 'node:fs';

export interface InstagramAccountInfo {
  id: string;
  username: string;
  profilePictureUrl?: string | null;
  accountType?: 'BUSINESS' | 'MEDIA_CREATOR' | 'PERSONAL';
  followersCount?: number | null;
}

export interface InstagramAccountStatus {
  connected: boolean;
  status: 'connected' | 'disconnected';
  account: InstagramAccountInfo | null;
  appId?: string;
  error?: string | null;
}

export interface InstagramPublishOptions {
  filePath: string;
  videoUrl?: string; // Must be accessible URL for Meta container ingestion
  caption: string;
  shareToFeed?: boolean;
}

export interface InstagramPublishResponse {
  success: boolean;
  platform: 'instagram_reels';
  platformPostId?: string;
  publishedUrl?: string;
  error?: string;
  details?: any;
}

export const instagramClient = {
  /**
   * Inspect Meta Instagram Graph API connection
   * Does NOT simulate or pretend account is connected if tokens are missing.
   */
  async getStatus(): Promise<InstagramAccountStatus> {
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const igUserId = process.env.INSTAGRAM_ACCOUNT_ID;
    const appId = process.env.META_APP_ID;

    if (!accessToken || !igUserId || accessToken.startsWith('demo_') || igUserId.startsWith('demo_')) {
      return {
        connected: false,
        status: 'disconnected',
        account: null,
        appId,
        error: 'Instagram account not connected. Add INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_ACCOUNT_ID to connect.',
      };
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${igUserId}?fields=id,username,profile_picture_url,account_type,followers_count&access_token=${accessToken}`
      );

      if (!res.ok) {
        const errText = await res.text();
        return {
          connected: false,
          status: 'disconnected',
          account: null,
          appId,
          error: `Instagram Graph API authentication failed: ${errText}`,
        };
      }

      const data = await res.json();
      return {
        connected: true,
        status: 'connected',
        account: {
          id: data.id,
          username: data.username,
          profilePictureUrl: data.profile_picture_url || null,
          accountType: data.account_type || 'MEDIA_CREATOR',
          followersCount: data.followers_count || null,
        },
        appId,
      };
    } catch (err: any) {
      return {
        connected: false,
        status: 'disconnected',
        account: null,
        appId,
        error: `Network error connecting to Meta Graph API: ${err.message}`,
      };
    }
  },

  /**
   * Publish Instagram Reel using official Meta Graph API v21.0 Container Workflow
   */
  async publishReel(options: InstagramPublishOptions): Promise<InstagramPublishResponse> {
    const { filePath, videoUrl, caption, shareToFeed = true } = options;

    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        platform: 'instagram_reels',
        error: `File not found on disk: ${filePath}`,
      };
    }

    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const igUserId = process.env.INSTAGRAM_ACCOUNT_ID;

    if (!accessToken || !igUserId) {
      return {
        success: false,
        platform: 'instagram_reels',
        error: 'Instagram credentials not configured. Please connect your Meta Professional Account.',
      };
    }

    // Video URL is required for Meta Graph API container ingestion
    const effectiveVideoUrl =
      videoUrl ||
      `http://localhost:3000/api/media/clips/${encodeURIComponent(filePath.split(/[\\/]/).pop() || '')}`;

    try {
      console.log(`[InstagramClient] Step 1: Creating Reels container on account ${igUserId}...`);
      const containerRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'REELS',
          video_url: effectiveVideoUrl,
          caption: caption.slice(0, 2200),
          share_to_feed: shareToFeed,
          access_token: accessToken,
        }),
      });

      if (!containerRes.ok) {
        const errText = await containerRes.text();
        throw new Error(`Reels container creation failed (${containerRes.status}): ${errText}`);
      }

      const containerData = await containerRes.json();
      const creationId = containerData.id;

      console.log(`[InstagramClient] Step 2: Polling container ${creationId} encoding status...`);
      let isReady = false;
      let attempts = 0;
      while (!isReady && attempts < 20) {
        attempts++;
        await new Promise((r) => setTimeout(r, 3000));
        const statusRes = await fetch(
          `https://graph.facebook.com/v21.0/${creationId}?fields=status_code&access_token=${accessToken}`
        );
        const statusData = await statusRes.json();
        if (statusData.status_code === 'FINISHED') {
          isReady = true;
        } else if (statusData.status_code === 'ERROR') {
          throw new Error('Meta server failed to transcode video container.');
        }
      }

      if (!isReady) {
        throw new Error('Timed out waiting for Instagram Reel processing.');
      }

      console.log(`[InstagramClient] Step 3: Publishing media container ${creationId}...`);
      const publishRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: creationId,
          access_token: accessToken,
        }),
      });

      if (!publishRes.ok) {
        const errText = await publishRes.text();
        throw new Error(`Media publish failed (${publishRes.status}): ${errText}`);
      }

      const publishData = await publishRes.json();
      const mediaId = publishData.id;
      const publishedUrl = `https://www.instagram.com/reel/${mediaId}/`;

      console.log(`[InstagramClient] ✓ Published Instagram Reel: ${publishedUrl}`);

      return {
        success: true,
        platform: 'instagram_reels',
        platformPostId: mediaId,
        publishedUrl,
        details: publishData,
      };
    } catch (err: any) {
      console.error('[InstagramClient] API error:', err);
      return {
        success: false,
        platform: 'instagram_reels',
        error: err.message,
      };
    }
  },
};
