export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { dbRepo } from '@/db/repository';
import { MasterAgentOrchestrator } from '@/agents/orchestrator';
import { videoIngestionEngine, computeFileChecksum } from '@/lib/video-ingestion';
import { mediaManager } from '@/lib/media-manager';
import { getProjectStoragePaths } from '@/lib/app-paths';
import { ffmpegCore } from '@/lib/ffmpeg-core';
import { sourceAcquisitionEngine, mediaAcquisitionService } from '@/lib/source-acquisition';
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sourceUrl = body.sourceUrl || body.url;
    const sourceFile = body.sourceFile || body.file;
    const title = body.title;
    const pairAuthorizedStream = body.pairAuthorizedStream;

    // Fast-fail validation on malformed YouTube URLs
    if (sourceUrl && typeof sourceUrl === 'string') {
      const parsedYt = videoIngestionEngine.parseYouTubeUrl(sourceUrl);
      if (!parsedYt.isValid) {
        return NextResponse.json(
          {
            error: 'Invalid YouTube video URL format. Supported formats: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/live/ID, youtube.com/shorts/ID.',
            errorState: 'INVALID_YOUTUBE_URL',
            stageId: '1',
            message: 'Invalid YouTube video URL format. Supported formats: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/live/ID, youtube.com/shorts/ID.',
          },
          { status: 422 }
        );
      }
    }

    if (!sourceUrl && !sourceFile) {
      return NextResponse.json(
        {
          error: 'Please provide either a valid YouTube URL or an uploaded video file.',
          errorState: 'SOURCE_PERMISSION_MISSING',
        },
        { status: 422 }
      );
    }

    // ================= DUPLICATE QUEUE JOB PREVENTION =================
    // If a project is actively in-progress with the identical source file within recent heartbeat window, return it (idempotency)
    const activeProjects = dbRepo.listProjects() as any[];
    const nowMs = Date.now();
    const existingActive = activeProjects.find((p) => {
      const sameSource = sourceFile ? p.source_file === sourceFile : (sourceUrl && p.source_url === sourceUrl);
      if (!sameSource) return false;
      if (p.status !== 'in_progress') return false;
      const lastActivity = new Date(p.heartbeat_at || p.updated_at || p.created_at).getTime();
      return (nowMs - lastActivity) < 60000; // genuinely active within last 60 seconds
    });

    if (existingActive) {
      console.log(`[ProjectsAPI] Project ${existingActive.id} is already in progress for this source. Returning active project (idempotent).`);
      return NextResponse.json({
        success: true,
        projectId: existingActive.id,
        status: existingActive.status,
        progress: existingActive.progress || 5,
        currentStage: existingActive.current_stage || 'Validating source link',
        message: 'Existing project workflow resumed.',
        resumed: true,
      });
    }

    // Validate local source file if supplied
    if (sourceFile && !fs.existsSync(sourceFile)) {
      return NextResponse.json(
        {
          error: `The specified source video file does not exist on disk: ${sourceFile}`,
          errorState: 'SOURCE_PROCESSING_FAILED',
        },
        { status: 422 }
      );
    }

    const projectId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const sourceVideoId = `sv_${projectId}`;

    // Acquire source video via unified MediaAcquisitionService
    const mediaRes = await mediaAcquisitionService.acquireMedia({
      sourceUrl,
      sourceFile,
      projectId,
      creatorName: body.creatorName,
    });

    if (mediaRes.acquisitionStatus === 'failed' || !mediaRes.filePath || !fs.existsSync(mediaRes.filePath)) {
      console.warn(`[ProjectsAPI] Media acquisition failed for project ${projectId}: ${mediaRes.error}`);
      return NextResponse.json(
        {
          error: mediaRes.error || 'Media acquisition failed.',
          errorState: 'VIDEO_ACQUISITION_FAILED',
          sourceType: mediaRes.sourceType,
          videoId: mediaRes.videoId,
          canRetry: mediaRes.canRetry ?? true,
          availableAlternatives: mediaRes.availableAlternatives || ['upload', 'direct_url'],
          metadataRetrieved: Boolean(sourceUrl),
          videoAcquired: false,
        },
        { status: 422 }
      );
    }

    const projectIsolatedSourcePath = mediaRes.filePath;
    const sourceChecksum = mediaRes.metadata?.checksum || computeFileChecksum(projectIsolatedSourcePath);

    try {
      fs.accessSync(projectIsolatedSourcePath, fs.constants.R_OK);
    } catch (permErr: any) {
      return NextResponse.json(
        {
          error: `Source video file cannot be read: ${permErr.message}`,
          errorState: 'SOURCE_FILE_UNREADABLE',
        },
        { status: 422 }
      );
    }

    let probeMeta: any = mediaRes.metadata;
    if (!probeMeta || !probeMeta.duration) {
      try {
        probeMeta = ffmpegCore.probe(projectIsolatedSourcePath);
      } catch (probeErr: any) {
        return NextResponse.json(
          {
            error: `Failed to probe source video container: ${probeErr.message}`,
            errorState: 'SOURCE_PROCESSING_FAILED',
          },
          { status: 422 }
        );
      }
    }

    if (!probeMeta || probeMeta.duration <= 0) {
      return NextResponse.json(
        {
          error: 'Source video contains 0 seconds duration or corrupted stream.',
          errorState: 'UNSUPPORTED_FORMAT',
        },
        { status: 422 }
      );
    }

    const parsedYt = sourceUrl ? videoIngestionEngine.parseYouTubeUrl(sourceUrl) : null;
    const projectTitle = title || (parsedYt?.videoId ? `GTA 6 Gameplay (${parsedYt.videoId})` : 'GTA 6 Gameplay Shorts');

    dbRepo.createProject({
      id: projectId,
      userId: 'usr_creator_01',
      title: projectTitle,
      sourceUrl: sourceUrl || null,
      sourceFile: projectIsolatedSourcePath,
      sourceVideoId,
      sourceChecksum,
    });

    dbRepo.saveSourceVideo({
      id: sourceVideoId,
      projectId,
      fileName: path.basename(projectIsolatedSourcePath),
      filePath: projectIsolatedSourcePath,
      fileSize: fs.statSync(projectIsolatedSourcePath).size,
      duration: probeMeta.duration,
      width: probeMeta.width,
      height: probeMeta.height,
      fps: probeMeta.fps,
      bitrate: probeMeta.bitrate,
      audioChannels: probeMeta.audioChannels,
      originSource: sourceUrl ? (mediaRes.sourceType === 'direct_url' ? 'direct_url' : 'youtube_stream') : 'local_upload',
      sha256Checksum: sourceChecksum,
    });

    // 3. Initialize all 10 stages in database matching MasterAgentOrchestrator
    const stages = [
      { num: 1, key: 'inspecting', name: 'Inspecting URL' },
      { num: 2, key: 'metadata', name: 'Metadata Retrieved' },
      { num: 3, key: 'acquiring', name: 'Acquiring Media' },
      { num: 4, key: 'validating_media', name: 'Validating Media' },
      { num: 5, key: 'extracting_audio', name: 'Extracting Audio & Scenes' },
      { num: 6, key: 'highlights', name: 'Detecting Highlights' },
      { num: 7, key: 'extracting', name: 'Extracting Clips' },
      { num: 8, key: 'generating_shorts', name: 'Generating Shorts & Subtitles' },
      { num: 9, key: 'rendering_videos', name: 'Rendering Videos' },
      { num: 10, key: 'completed', name: 'Completed' },
    ];

    stages.forEach((stg) => {
      dbRepo.savePipelineStage({
        projectId,
        stageNumber: stg.num,
        stageKey: stg.key,
        stageName: stg.name,
        status: stg.num === 1 ? 'ACTIVE' : 'PENDING',
        progressPercent: stg.num === 1 ? 2 : 0,
        startedAt: stg.num === 1 ? new Date().toISOString() : undefined,
      });
    });

    // 4. Mark project in_progress at Stage 1
    dbRepo.updateProjectStatus(projectId, 'in_progress', 2, 'Inspecting URL', {
      stageId: '1',
      stageStatus: 'ACTIVE',
    });

    // 5. Asynchronously launch background orchestrator (never blocks the HTTP response)
    const orchestrator = new MasterAgentOrchestrator();
    const jobId = `job_${projectId}`;

    setTimeout(() => {
      orchestrator.processProject({
        projectId,
        sourceVideoId,
        sourceFilePath: projectIsolatedSourcePath,
        sourceChecksum,
        sourceUrl,
        jobId,
      }).catch((err) => {
        console.error(`[ProjectsAPI] Background orchestrator execution failed for ${projectId}:`, err);
      });
    }, 20);

    // 6. Immediate response to client (<100ms) with clean status and ID
    return NextResponse.json({
      success: true,
      projectId,
      status: 'in_progress',
      progress: 2,
      currentStage: 'Inspecting URL',
      sourceVideoId,
      sourceChecksum,
      jobId,
      message: 'Video source successfully queued. 10-stage multi-agent editing pipeline initiated.',
    });
  } catch (error: any) {
    console.error('[ProjectsAPI] Initiation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
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
