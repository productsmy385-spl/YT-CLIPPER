import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import { dbRepo } from '@/db/repository';
import { publishingScheduler } from '@/lib/publishing/scheduler';
import { youtubeService } from '@/lib/publishing/youtube';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      postId,
      exportFileId,
      clipId,
      platform = 'youtube_shorts',
      title,
      description,
      tags,
      privacyStatus = 'public',
    } = body;

    let targetPostId = postId;
    let targetFilePath = '';
    let targetTitle = title || '';
    let targetDescription = description || '';
    let targetTags = tags || 'gta6, shorts, gaming, vicecity';
    let targetProjectId = 'proj_default';

    // 1. Resolve from Clip ID
    if (!targetPostId && clipId) {
      const clip = dbRepo.getClipById(clipId) as any;
      if (!clip) {
        return NextResponse.json({ error: `Clip not found: ${clipId}` }, { status: 404 });
      }

      // Check if already published to prevent accidental duplicate upload
      if (clip.published_url || clip.is_published === 1) {
        console.log(`[PublishNow] Clip ${clipId} is already published: ${clip.published_url}`);
        return NextResponse.json({
          success: true,
          postId: `pub_existing_${clipId}`,
          publishedUrl: clip.published_url,
          videoId: clip.youtube_video_id,
          message: 'Video is already published to YouTube.',
        });
      }

      targetFilePath = clip.output_path || clip.raw_clip_path;
      targetTitle = targetTitle || clip.title;
      targetProjectId = clip.project_id || targetProjectId;

      if (!targetFilePath || !fs.existsSync(targetFilePath)) {
        return NextResponse.json(
          { error: `Rendered video file missing on disk for clip ${clipId}: ${targetFilePath}` },
          { status: 400 }
        );
      }

      // Find or create account
      const accounts = dbRepo.listConnectedAccounts() as any[];
      const match = accounts.find((a: any) => a.platform.startsWith(platform.split('_')[0]));
      const accountId = match?.id || 'acc_yt_creator_test';

      const id = `pub_now_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      dbRepo.createScheduledPost({
        id,
        userId: 'usr_creator_01',
        projectId: targetProjectId,
        exportFileId: clipId, // Points to clipId for direct resolution
        platform,
        connectedAccountId: accountId,
        scheduledAt: new Date().toISOString(),
        status: 'PROCESSING',
      });

      targetPostId = id;
    }

    // 2. Resolve from ExportFileId
    if (!targetPostId && exportFileId) {
      const exportFiles = dbRepo.getExportFiles() as any[];
      const exp = exportFiles.find((f: any) => f.id === exportFileId);
      if (!exp) {
        return NextResponse.json({ error: `Export file not found: ${exportFileId}` }, { status: 404 });
      }

      targetFilePath = exp.file_path;
      targetTitle = targetTitle || exp.title;
      targetDescription = targetDescription || exp.description;
      targetTags = targetTags || exp.tags;

      if (!targetFilePath || !fs.existsSync(targetFilePath)) {
        return NextResponse.json(
          { error: `Export file missing on disk: ${targetFilePath}` },
          { status: 400 }
        );
      }

      const accounts = dbRepo.listConnectedAccounts() as any[];
      const match = accounts.find((a: any) => a.platform.startsWith(platform.split('_')[0]));
      const accountId = match?.id || 'acc_yt_creator_test';

      const id = `pub_now_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      dbRepo.createScheduledPost({
        id,
        userId: 'usr_creator_01',
        projectId: targetProjectId,
        exportFileId,
        platform,
        connectedAccountId: accountId,
        scheduledAt: new Date().toISOString(),
        status: 'PROCESSING',
      });

      targetPostId = id;
    }

    if (!targetPostId) {
      return NextResponse.json({ error: 'Post ID, Clip ID, or ExportFileId required' }, { status: 400 });
    }

    // 3. Direct publishing execution through real API bridge
    console.log(`[PublishNow] Triggering publication for post ${targetPostId} on ${platform}...`);
    const res = await publishingScheduler.publishPost(targetPostId);

    // If publishing succeeded and we have clipId, update clip record
    if (res.success && clipId) {
      try {
        const { rawDb } = await import('@/db/index');
        rawDb.prepare(`
          UPDATE generated_clips
          SET is_published = 1, published_url = ?, status = 'published', updated_at = ?
          WHERE id = ?
        `).run(res.publishedUrl || null, new Date().toISOString(), clipId);
      } catch {}
    }

    return NextResponse.json({
      success: res.success,
      postId: targetPostId,
      publishedUrl: res.publishedUrl,
      videoId: (res as any).platformPostId,
      studioUrl: (res as any).studioUrl,
      error: res.error,
    });
  } catch (error: any) {
    console.error('[PublishNowAPI] Error executing publish:', error);
    return NextResponse.json({ error: error.message || 'Failed to publish video' }, { status: 500 });
  }
}
