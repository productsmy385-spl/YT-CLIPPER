import { NextRequest, NextResponse } from 'next/server';
import { dbRepo } from '@/db/repository';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const post = dbRepo.getScheduledPostById(id);
    if (!post) {
      return NextResponse.json({ error: 'Scheduled post not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, post });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { scheduledAt, timezone, status } = body;

    dbRepo.updateScheduledPost(id, {
      scheduled_at: scheduledAt,
      timezone,
      status,
    });

    const updated = dbRepo.getScheduledPostById(id);
    return NextResponse.json({ success: true, post: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const cancelled = dbRepo.cancelScheduledPost(id);
    return NextResponse.json({ success: true, post: cancelled });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
