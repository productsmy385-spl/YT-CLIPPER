export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { dbRepo } from '@/db/repository';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check and recover stalled jobs automatically
    dbRepo.checkAndRecoverStalledJobs(180);

    const project = dbRepo.getProject(id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const clips = dbRepo.getClipsByProject(id);
    const highlights = dbRepo.getHighlightsByProject(id);
    const agentLogs = dbRepo.getAgentLogs(id);
    const copyrightReport = dbRepo.getCopyrightReportByProject(id);
    const sourceVideo = dbRepo.getSourceVideoByProject(id);
    const stages = dbRepo.getPipelineStages(id);

    return NextResponse.json({
      project,
      sourceVideo,
      clips,
      highlights,
      agentLogs,
      copyrightReport,
      stages,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
