export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { dbRepo } from '@/db/repository';
import { getProjectSnapshot } from '@/lib/studio/snapshot';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const snap = getProjectSnapshot(id);
    if (!snap) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    // Legacy fields kept for the library / highlights pages.
    return NextResponse.json({
      ...snap,
      clips: dbRepo.getClipsByProject(id),
      agentLogs: dbRepo.getAgentLogs(id),
      sourceVideo: dbRepo.getSourceVideoByProject(id),
    });
  } catch (error: any) {
    console.error('[ProjectAPI] Read failed:', error);
    return NextResponse.json({ error: 'Could not load the project.' }, { status: 500 });
  }
}
