import { NextRequest, NextResponse } from 'next/server';
import { dbRepo } from '@/db/repository';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    dbRepo.updateScheduledPostStatus(id, 'CANCELLED');
    return NextResponse.json({ success: true, message: 'Scheduled post cancelled' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
