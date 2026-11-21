export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { dbRepo } from '@/db/repository';

export async function GET() {
  try {
    const metrics = dbRepo.getDashboardMetrics();
    const projects = dbRepo.listProjects();
    const clips = dbRepo.getAllClips();
    const agents = dbRepo.getAgents();
    const recentLogs = dbRepo.getAgentLogs();

    return NextResponse.json({
      metrics,
      recentProjects: projects.slice(0, 5),
      recentClips: clips.slice(0, 6),
      agents,
      recentLogs: recentLogs.slice(0, 10),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
