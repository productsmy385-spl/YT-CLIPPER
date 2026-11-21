import { NextRequest, NextResponse } from 'next/server';
import { dbRepo } from '@/db/repository';
import { MasterAgentOrchestrator } from '@/agents/orchestrator';
import { videoIngestionEngine } from '@/lib/video-ingestion';
import { mediaManager } from '@/lib/media-manager';
import { SAMPLES_DIR } from '@/lib/app-paths';
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
    // If a project is already active with the identical source, resume/return that project instead of creating duplicate jobs
    const activeProjects = dbRepo.listProjects() as any[];
    const existingActive = activeProjects.find((p) => {
      const sameSource = (sourceUrl && p.source_url === sourceUrl) || (sourceFile && p.source_file === sourceFile);
      const isRunning = p.status === 'in_progress' || p.status === 'created';
      return sameSource && isRunning;
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

    // Resolve initial source video path
    let initialVideoPath = sourceFile;
    if (!initialVideoPath && sourceUrl) {
      const parsedYt = videoIngestionEngine.parseYouTubeUrl(sourceUrl);
      const existingFile = videoIngestionEngine.findAuthorizedSourceFile(parsedYt.videoId);
      if (existingFile) initialVideoPath = existingFile;
    }

    const projectId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const sourceVideoId = `sv_${projectId}`;
    const projectTitle = title || (sourceUrl ? `GTA 6 Gameplay Shorts (${videoIngestionEngine.parseYouTubeUrl(sourceUrl).videoId || 'Stream'})` : 'GTA 6 Gameplay Shorts');

    // 1. Create project in database
    dbRepo.createProject({
      id: projectId,
      userId: 'usr_creator_01',
      title: projectTitle,
      sourceUrl: sourceUrl || null,
      sourceFile: initialVideoPath || null,
      sourceVideoId,
    });

    // 2. Initialize all 10 stages in database
    const stages = [
      { num: 1, key: 'validating', name: 'Validating source link' },
      { num: 2, key: 'retrieving', name: 'Retrieving video information' },
      { num: 3, key: 'source_processing', name: 'Processing authorized source video' },
      { num: 4, key: 'analyzing', name: 'Analyzing video' },
      { num: 5, key: 'highlights', name: 'Detecting highlights' },
      { num: 6, key: 'extracting', name: 'Extracting clips' },
      { num: 7, key: 'editing', name: 'Editing clips' },
      { num: 8, key: 'subtitles', name: 'Generating subtitles' },
      { num: 9, key: 'qa', name: 'Running quality checks' },
      { num: 10, key: 'export', name: 'Exporting final videos' },
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

    // 3. Mark project in_progress at Stage 1
    dbRepo.updateProjectStatus(projectId, 'in_progress', 2, 'Validating source link', {
      stageId: '1',
      stageStatus: 'ACTIVE',
    });

    // 4. Asynchronously launch background orchestrator (never blocks the HTTP response)
    const orchestrator = new MasterAgentOrchestrator();
    setTimeout(() => {
      orchestrator.processProject({
        projectId,
        sourceVideoId,
        sourceFilePath: initialVideoPath,
        sourceUrl,
        pairAuthorizedStream: pairAuthorizedStream !== false,
        jobId: `job_${projectId}`,
      }).catch((err) => {
        console.error(`[ProjectsAPI] Background orchestrator execution failed for ${projectId}:`, err);
      });
    }, 20);

    // 5. Immediate response to client (<100ms) with clean status and ID
    return NextResponse.json({
      success: true,
      projectId,
      status: 'in_progress',
      progress: 2,
      currentStage: 'Validating source link',
      sourceVideoId,
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
