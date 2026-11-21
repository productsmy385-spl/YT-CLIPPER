export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { dbRepo } from '@/db/repository';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const posts = dbRepo.getScheduledPosts(status);
    return NextResponse.json({ posts });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      clipId,
      exportFileId,
      postId,
      platform = 'youtube_shorts',
      connectedAccountId,
      scheduledAt,
      timezone = 'Asia/Kolkata',
      title,
      description,
      tags,
    } = body;

    // If updating existing post
    if (postId) {
      dbRepo.updateScheduledPost(postId, {
        scheduled_at: scheduledAt,
        timezone,
        status: 'SCHEDULED',
      });
      const updated = dbRepo.getScheduledPostById(postId);
      return NextResponse.json({ success: true, post: updated });
    }

    let targetFileId = exportFileId || clipId;
    let targetProjectId = 'proj_default';

    if (!targetFileId) {
      return NextResponse.json({ error: 'Clip ID or Export File ID required' }, { status: 400 });
    }

    if (clipId) {
      const clip = dbRepo.getClipById(clipId) as any;
      if (clip?.project_id) {
        targetProjectId = clip.project_id;
      }
    }

    // Ensure connected account ID
    let accountId = connectedAccountId;
    if (!accountId) {
      const accounts = dbRepo.listConnectedAccounts() as any[];
      const match = accounts.find((a: any) => a.platform.startsWith(platform.split('_')[0]));
      if (match) {
        accountId = match.id;
      } else {
        const newAcc = dbRepo.saveConnectedAccount({
          id: `acc_${platform}_auto`,
          userId: 'usr_creator_01',
          platform: platform.split('_')[0] as any,
          accountName: `Verified ${platform.replace('_', ' ').toUpperCase()} Channel`,
          accountId: `act_${Date.now()}`,
        });
        accountId = (newAcc as any).id;
      }
    }

    const newPostId = `sched_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const post = dbRepo.createScheduledPost({
      id: newPostId,
      userId: 'usr_creator_01',
      projectId: targetProjectId,
      exportFileId: targetFileId,
      platform,
      connectedAccountId: accountId,
      scheduledAt: scheduledAt || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      timezone: timezone || 'Asia/Kolkata',
      status: 'SCHEDULED',
    });

    console.log(`[ScheduleAPI] ✓ Scheduled post ${newPostId} for ${scheduledAt} (${timezone}) on ${platform}`);

    return NextResponse.json({ success: true, post });
  } catch (error: any) {
    console.error('[ScheduleAPI] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Post ID required' }, { status: 400 });
    }

    const cancelled = dbRepo.cancelScheduledPost(id);
    return NextResponse.json({ success: true, post: cancelled });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
