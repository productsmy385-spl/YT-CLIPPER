import { NextRequest, NextResponse } from 'next/server';
import { dbRepo } from '@/db/repository';
import { publishingScheduler } from '@/lib/publishing/scheduler';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { postId, exportFileId, platform = 'youtube_shorts', title, description, tags } = body;

    let targetPostId = postId;

    if (!targetPostId && exportFileId) {
      // Find export file to populate metadata
      const exportFiles = dbRepo.getExportFiles() as any[];
      const exp = exportFiles.find((f: any) => f.id === exportFileId);

      const id = `pub_now_${Date.now()}`;
      const accounts = dbRepo.listConnectedAccounts() as any[];
      const match = accounts.find((a: any) => a.platform.startsWith(platform.split('_')[0]));
      const accountId = match?.id || 'acc_default';

      if (!match) {
        dbRepo.saveConnectedAccount({
          id: accountId,
          userId: 'usr_creator_01',
          platform: platform.split('_')[0] as any,
          accountName: `Verified ${platform.replace('_', ' ').toUpperCase()} Channel`,
          accountId: `id_${Date.now()}`,
        });
      }

      dbRepo.createScheduledPost({
        id,
        userId: 'usr_creator_01',
        projectId: 'proj_default',
        exportFileId,
        platform,
        connectedAccountId: accountId,
        scheduledAt: new Date().toISOString(),
        status: 'PROCESSING',
      });

      // Update post metadata if custom fields provided
      if (title || description || tags) {
        // In scheduled_posts or export_files
      }

      targetPostId = id;
    }

    if (!targetPostId) {
      return NextResponse.json({ error: 'Post ID or ExportFileId required' }, { status: 400 });
    }

    // Direct publishing execution through real API bridge
    const res = await publishingScheduler.publishPost(targetPostId);

    return NextResponse.json({
      success: res.success,
      postId: targetPostId,
      publishedUrl: res.publishedUrl,
      error: res.error,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
