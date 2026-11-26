export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { dbRepo } from '@/db/repository';
import { rawDb } from '@/db/index';
import { mediaManager } from '@/lib/media-manager';
import { STORAGE_UPLOADS_DIR } from '@/lib/app-paths';
import { inspectYouTubeVideo } from '@/lib/youtube/media-source';
import { enqueueJob } from '@/lib/jobs/queue';
import { STAGES } from '@/pipeline/stages';
import path from 'node:path';
import fs from 'node:fs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hasPagination = searchParams.has('page') || searchParams.has('pageSize') || searchParams.has('search') || searchParams.has('status');

    if (hasPagination) {
      const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
      const pageSize = Math.max(1, Math.min(96, parseInt(searchParams.get('pageSize') || '24', 10)));
      const search = searchParams.get('search') || undefined;
      const status = searchParams.get('status') || undefined;
      const sort = searchParams.get('sort') || undefined;

      const result = dbRepo.getPaginatedProjects({ page, pageSize, search, status, sort });
      return NextResponse.json({
        projects: result.items,
        pagination: result.pagination,
      });
    }

    const projects = dbRepo.listProjects();
    return NextResponse.json({ projects });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


/**
 * Create a project from a YouTube link (owned by the connected channel) or a completed upload, and queue the
 * processing job. Returns immediately; progress is streamed from /api/projects/[id]/events.
 * Body: { source: { type: 'youtube', url } | { type: 'upload', uploadId, fileName? }, options?: {...} }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const src = body?.source;
    if (!src || (src.type !== 'youtube' && src.type !== 'upload')) {
      return NextResponse.json({ error: 'Provide a YouTube link or upload a video.' }, { status: 400 });
    }
    const o = body.options || {};
    let durations: number[] = Array.isArray(o.durations) ? o.durations.map(Number).filter((d: number) => d >= 5 && d <= 180) : [30];
    if (!durations.length) durations = [30];
    durations = [...new Set(durations.map((d) => Math.round(d)))].slice(0, 5);
    const options = {
      durations,
      maxShorts: Math.max(1, Math.min(10, Number(o.maxShorts) || 5)),
      aspect: ['9:16', '16:9', '1:1'].includes(o.aspect) ? o.aspect : '9:16',
      captionPreset: typeof o.captionPreset === 'string' ? o.captionPreset : 'bold_pop',
      removeDeadAir: o.removeDeadAir !== false,
    };

    let title: string;
    let payload: any;
    if (src.type === 'youtube') {
      const insp = await inspectYouTubeVideo(String(src.url || ''));
      if ('error' in insp) return NextResponse.json({ error: insp.error }, { status: 422 });
      if (!insp.canAcquire) return NextResponse.json({ error: insp.message, blocker: insp.blocker }, { status: 422 });
      title = insp.title;
      payload = { sourceType: 'youtube', sourceUrl: insp.url, ...options };
    } else {
      const uploadId = path.basename(String(src.uploadId || ''));
      if (!uploadId || !fs.existsSync(path.join(STORAGE_UPLOADS_DIR, uploadId))) {
        return NextResponse.json({ error: 'That upload was not found on the server. Upload the file again.' }, { status: 422 });
      }
      title = String(src.fileName || uploadId.replace(/^\d+_[0-9a-f]{8}_/, '')).replace(/\.[^.]+$/, '').slice(0, 120) || 'Uploaded video';
      payload = { sourceType: 'upload', uploadFile: uploadId, ...options };
    }

    const projectId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    dbRepo.createProject({ id: projectId, userId: 'usr_creator_01', title, sourceUrl: payload.sourceUrl, sourceFile: payload.uploadFile });
    rawDb.prepare(`UPDATE projects SET source_type = ?, settings_json = ? WHERE id = ?`).run(src.type, JSON.stringify(options), projectId);
    for (const s of STAGES) {
      dbRepo.savePipelineStage({ projectId, stageNumber: s.n, stageKey: s.key, stageName: s.name, status: 'PENDING', progressPercent: 0 });
    }
    dbRepo.updateProjectStatus(projectId, 'in_progress', 0, 'Queued', { stageId: '1', stageStatus: 'PENDING' });
    const job = enqueueJob({ type: 'process_project', projectId, payload, maxAttempts: 2 });
    return NextResponse.json({ success: true, projectId, jobId: job.id });
  } catch (error: any) {
    console.error('[ProjectsAPI] Create failed:', error);
    return NextResponse.json({ error: 'Could not start processing. Please try again.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, deleteSource, deleteClips, permanent } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const result = await mediaManager.deleteProject(projectId, {
      deleteSource: Boolean(deleteSource),
      deleteClips: Boolean(deleteClips),
      permanent: Boolean(permanent),
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[ProjectsAPI] Delete error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
