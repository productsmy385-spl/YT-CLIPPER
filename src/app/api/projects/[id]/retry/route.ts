export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { dbRepo } from '@/db/repository';
import { enqueueJob, listJobs, activeJobFor } from '@/lib/jobs/queue';

/** Re-run processing for a failed or cancelled project. Cached analysis is reused, so retries are cheap. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = dbRepo.getProject(id) as any;
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  if (activeJobFor(id, 'process_project')) return NextResponse.json({ error: 'This project is already processing.' }, { status: 409 });
  const last = listJobs(id).find((j) => j.type === 'process_project');
  if (!last) return NextResponse.json({ error: 'This project was created by an older version and cannot be retried. Start a new project.' }, { status: 409 });
  const job = enqueueJob({ type: 'process_project', projectId: id, payload: JSON.parse(last.payload_json || '{}'), maxAttempts: 2 });
  dbRepo.updateProjectStatus(id, 'in_progress', 0, 'Queued for retry', { stageStatus: 'PENDING' });
  return NextResponse.json({ success: true, jobId: job.id });
}
