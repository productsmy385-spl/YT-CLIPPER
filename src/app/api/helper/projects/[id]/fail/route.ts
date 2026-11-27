export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { dbRepo } from '@/db/repository';
import { rejectUnlessSyncAuthorized } from '@/lib/sync/receive';
import { isValidProjectId } from '@/lib/sync/sync-core';
import { AWAITING_MEDIA_STATUS } from '@/pipeline/stages';

/**
 * PC fetch helper reports that it could not download the video either (e.g. age-restricted, removed). The project
 * fails with the helper's message so the user sees the real reason; "Retry" parks it for the helper again.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = rejectUnlessSyncAuthorized(req);
  if (denied) return denied;
  const { id } = await params;
  if (!isValidProjectId(id)) return NextResponse.json({ error: 'Invalid project id.' }, { status: 400 });
  const project = dbRepo.getProject(id) as any;
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  if (project.status !== AWAITING_MEDIA_STATUS) return NextResponse.json({ error: 'This project is not waiting for a video.' }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  const message = `Your PC could not download this video: ${String(body?.error || 'unknown error').slice(0, 300)}`;
  dbRepo.savePipelineStage({ projectId: id, stageNumber: 2, stageKey: 'acquiring', stageName: 'Acquiring video', status: 'FAILED', progressPercent: 0, errorMessage: message, detailsJson: JSON.stringify({ message }) } as any);
  dbRepo.updateProjectStatus(id, 'error', 0, message, { stageStatus: 'FAILED', errorMessage: message });
  return NextResponse.json({ success: true });
}
