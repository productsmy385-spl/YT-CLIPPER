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
    const { exportFileId, platform, connectedAccountId, scheduledAt, timezone } = body;

    const exportFiles = dbRepo.getExportFiles() as any[];
    const targetFile = exportFiles.find((f: any) => f.id === exportFileId);

    if (!targetFile) {
      return NextResponse.json({ error: 'Export file not found' }, { status: 404 });
    }

    const postId = `sched_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Ensure account exists or provide default connected account
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

    const post = dbRepo.createScheduledPost({
      id: postId,
      userId: 'usr_creator_01',
      projectId: 'proj_default',
      exportFileId,
      platform,
      connectedAccountId: accountId,
      scheduledAt: scheduledAt || new Date(Date.now() + 3600 * 1000).toISOString(),
      timezone: timezone || 'Asia/Kolkata',
      status: 'SCHEDULED',
    });

    return NextResponse.json({ success: true, post });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
