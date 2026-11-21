import fs from 'node:fs';
import path from 'node:path';
import { youtubeOAuth } from './oauth';

export interface YouTubeUploadOptions {
  filePath: string;
  title: string;
  description: string;
  tags?: string[];
  privacyStatus?: 'public' | 'unlisted' | 'private';
  publishAt?: string; // ISO 8601 UTC timestamp
  categoryId?: string; // '20' for Gaming
  onProgress?: (progressPercent: number, bytesUploaded: number, totalBytes: number) => void;
}

export interface YouTubeUploadResult {
  success: boolean;
  videoId: string;
  publishedUrl: string;
  shortsUrl: string;
  studioUrl: string;
  privacyStatus: string;
  publishAt?: string | null;
  title: string;
  details: any;
}

export const youtubeUploader = {
  /**
   * Upload video file directly to YouTube using official Resumable Upload protocol
   */
  async upload(options: YouTubeUploadOptions): Promise<YouTubeUploadResult> {
    const {
      filePath,
      title,
      description,
      tags = ['gta6', 'gaming', 'shorts', 'action'],
      privacyStatus = 'public',
      publishAt,
      categoryId = '20', // Gaming
      onProgress,
    } = options;

    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`Video file does not exist on disk at: ${filePath}`);
    }

    const stat = fs.statSync(filePath);
    if (stat.size <= 0) {
      throw new Error(`Video file is empty (0 bytes): ${filePath}`);
    }

    // 1. Get valid authenticated access token (auto-refreshed)
    const accessToken = await youtubeOAuth.getValidAccessToken();

    // YouTube Data API rule: publishAt requires privacyStatus to be 'private'
    const finalPrivacy = publishAt ? 'private' : privacyStatus;

    const metadata: any = {
      snippet: {
        title: title.slice(0, 100),
        description: description || '',
        tags: Array.isArray(tags) ? tags : [tags],
        categoryId,
        defaultLanguage: 'en',
        defaultAudioLanguage: 'en',
      },
      status: {
        privacyStatus: finalPrivacy,
        selfDeclaredMadeForKids: false,
      },
    };

    if (publishAt) {
      metadata.status.publishAt = new Date(publishAt).toISOString();
    }

    console.log(`[YouTubeUploader] Initiating Resumable Upload for "${metadata.snippet.title}" (${(stat.size / 1024 / 1024).toFixed(1)} MB)...`);

    // 2. Initiate Resumable Upload Session
    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Length': String(stat.size),
          'X-Upload-Content-Type': 'video/mp4',
        },
        body: JSON.stringify(metadata),
      }
    );

    if (!initRes.ok) {
      const errText = await initRes.text();
      throw new Error(`YouTube resumable session initialization failed: HTTP ${initRes.status} -> ${errText}`);
    }

    const uploadUrl = initRes.headers.get('location');
    if (!uploadUrl) {
      throw new Error('YouTube API did not return resumable upload Location header.');
    }

    // 3. Upload video payload
    const fileBuffer = fs.readFileSync(filePath);
    if (onProgress) onProgress(10, 0, stat.size);

    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(stat.size),
      },
      body: fileBuffer,
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      throw new Error(`YouTube video chunk upload failed: HTTP ${putRes.status} -> ${errText}`);
    }

    const data = await putRes.json();
    if (!data.id) {
      throw new Error('YouTube upload completed but did not return a video ID.');
    }

    if (onProgress) onProgress(100, stat.size, stat.size);

    const videoId = data.id;
    const publishedUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const shortsUrl = `https://youtube.com/shorts/${videoId}`;
    const studioUrl = `https://studio.youtube.com/video/${videoId}/edit`;

    console.log(`[YouTubeUploader] ✓ Successfully uploaded Short! ID: ${videoId} | URL: ${publishedUrl}`);

    return {
      success: true,
      videoId,
      publishedUrl,
      shortsUrl,
      studioUrl,
      privacyStatus: data.status?.privacyStatus || finalPrivacy,
      publishAt: data.status?.publishAt || null,
      title: data.snippet?.title || metadata.snippet.title,
      details: data,
    };
  },
};
