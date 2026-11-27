export const dynamic = 'force-dynamic';
export const maxDuration = 3600;
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { dbRepo } from '@/db/repository';
import { getProjectStoragePaths } from '@/lib/app-paths';
import { probe } from '@/lib/media/ff';
import { enqueueJob, listJobs, activeJobFor } from '@/lib/jobs/queue';
import * as store from '@/lib/studio/store';
import { rejectUnlessSyncAuthorized, receiveBodyToFile } from '@/lib/sync/receive';
import { isValidProjectId } from '@/lib/sync/sync-core';
import { AWAITING_MEDIA_STATUS } from '@/pipeline/stages';

/**
 * PC fetch helper uploads the video it downloaded for a project parked in "awaiting_media". The raw MP4 is the
 * request body (streamed to disk). It is validated with FFprobe, attached as the project's source, and processing
 * is re-queued; the pipeline then skips acquisition because the source already exists.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = rejectUnlessSyncAuthorized(req);
  if (denied) return denied;
  const { id } = await params;
  if (!isValidProjectId(id)) return NextResponse.json({ error: 'Invalid project id.' }, { status: 400 });
  const project = dbRepo.getProject(id) as any;
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  if (project.status !== AWAITING_MEDIA_STATUS) {
    return NextResponse.json({ error: `This project is not waiting for a video (status: ${project.status}).` }, { status: 409 });
  }
  const last = listJobs(id).find((j) => j.type === 'process_project');
  if (!last) return NextResponse.json({ error: 'This project has no processing settings to resume with.' }, { status: 409 });
  if (activeJobFor(id, 'process_project')) return NextResponse.json({ error: 'This project is already processing.' }, { status: 409 });

  const videoId = /[?&]v=([\w-]{6,20})/.exec(project.source_url || '')?.[1] || 'helper';
  const dest = path.join(getProjectStoragePaths(id).sourceDir, `source_${videoId}.mp4`);
  let size: number;
  try {
    size = await receiveBodyToFile(req, dest);
  } catch (err: any) {
    console.error(`[HelperAPI] Upload for ${id} failed: ${err.message}`);
    return NextResponse.json({ error: err.message || 'The upload was interrupted.' }, { status: 400 });
  }

  try {
    const info = await probe(dest);
    if (!info.hasVideo || info.duration <= 0.5) throw new Error('No playable video stream was found in this file.');
  } catch (err: any) {
    fs.rmSync(dest, { force: true });
    return NextResponse.json({ error: `The uploaded file is not a usable video: ${err.message}` }, { status: 422 });
  }

  store.upsertMediaAsset({
    id: `asset_${id}`, projectId: id, sourceType: 'youtube', sourceRef: project.source_url, videoId: videoId === 'helper' ? null : videoId,
    filePath: dest, fileSize: size, checksum: null, probe: null, thumbnailPath: null, waveform: null, transcript: null, analysis: null,
  });
  const job = enqueueJob({ type: 'process_project', projectId: id, payload: JSON.parse(last.payload_json || '{}'), maxAttempts: 2 });
  dbRepo.updateProjectStatus(id, 'in_progress', 0, 'Video received from your PC', { stageStatus: 'PENDING' });
  console.log(`[HelperAPI] Received ${(size / 1048576).toFixed(1)} MB for ${id}; processing re-queued (${job.id}).`);
  return NextResponse.json({ success: true, jobId: job.id, bytes: size });
}
