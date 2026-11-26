export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { dbRepo } from '@/db/repository';
import { listJobs, requestCancel } from '@/lib/jobs/queue';

/** Cancel the project's queued/running jobs. The worker aborts FFmpeg and AI work within ~2 seconds. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!dbRepo.getProject(id)) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  const cancelled = listJobs(id).filter((j) => j.status === 'queued' || j.status === 'running').filter((j) => requestCancel(j.id)).length;
  if (cancelled) dbRepo.updateProjectStatus(id, 'cancelled', 0, 'Cancelled', { stageStatus: 'CANCELLED' });
  return NextResponse.json({ success: true, cancelled });
}
