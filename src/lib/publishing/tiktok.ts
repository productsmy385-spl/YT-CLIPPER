import fs from 'node:fs';
import type { PublishResult } from './youtube.ts';

export interface TikTokPublishParams {
  filePath: string;
  title: string;
  accessToken?: string;
  privacyLevel?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY';
}

export const tiktokService = {
  // Generate TikTok OAuth authorization URL
  getAuthUrl(clientKey = process.env.TIKTOK_CLIENT_KEY || 'demo_tiktok_client_key', redirectUri = 'http://localhost:3000/api/publishing/oauth/tiktok/callback') {
    const scope = encodeURIComponent('user.info.basic,video.upload,video.publish');
    return `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&scope=${scope}&response_type=code&redirect_uri=${encodeURIComponent(
      redirectUri
    )}`;
  },

  // Publish video to TikTok using official Content Posting API v2
  async publish(params: TikTokPublishParams): Promise<PublishResult> {
    const { filePath, title, privacyLevel = 'PUBLIC_TO_EVERYONE' } = params;
    const accessToken = params.accessToken || process.env.TIKTOK_ACCESS_TOKEN;

    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        platform: 'tiktok',
        error: `File not found on disk: ${filePath}`,
      };
    }

    const fileStat = fs.statSync(filePath);
    const fileSize = fileStat.size;

    console.log(`[TikTokService] Publishing video to TikTok Content Posting API...`);

    // If real credentials provided, execute TikTok API protocol
    if (accessToken && !accessToken.startsWith('demo_')) {
      try {
        const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
          body: JSON.stringify({
            post_info: {
              title: title.slice(0, 150),
              privacy_level: privacyLevel,
              disable_duet: false,
              disable_stitch: false,
              disable_comment: false,
            },
            source_info: {
              source: 'FILE_UPLOAD',
              video_size: fileSize,
              chunk_size: fileSize,
              total_chunk_count: 1,
            },
          }),
        });

        if (!initRes.ok) {
          const errText = await initRes.text();
          throw new Error(`TikTok API init failed: ${errText}`);
        }

        const initData = await initRes.json();
        const publishId = initData.data?.publish_id;
        const uploadUrl = initData.data?.upload_url;

        if (uploadUrl) {
          const fileBuffer = fs.readFileSync(filePath);
          const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': 'video/mp4',
              'Content-Range': `bytes 0-${fileSize - 1}/${fileSize}`,
            },
            body: fileBuffer,
          });

          if (!uploadRes.ok) throw new Error('TikTok binary upload failed');
        }

        return {
          success: true,
          platform: 'tiktok',
          platformPostId: publishId,
          publishedUrl: `https://www.tiktok.com/@creator/video/${publishId}`,
          details: initData,
        };
      } catch (err: any) {
        console.error('[TikTokService] API error:', err);
        return {
          success: false,
          platform: 'tiktok',
          error: err.message,
        };
      }
    }

    // Previously this returned a fabricated "success" with an invented post URL. Fail honestly instead.
    return {
      success: false,
      platform: 'tiktok',
      error: 'TikTok is not connected (no TIKTOK_ACCESS_TOKEN). Nothing was published.',
    };
  },
};
