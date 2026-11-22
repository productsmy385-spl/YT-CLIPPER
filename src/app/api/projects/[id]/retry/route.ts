export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { dbRepo } from '@/db/repository';
import { MasterAgentOrchestrator } from '@/agents/orchestrator';
import fs from 'node:fs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = dbRepo.getProject(id);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const sourceVideo = dbRepo.getSourceVideoByProject(id) as any;
    const sourceFilePath = String(sourceVideo?.file_path || project.source_file || '');

    if (!sourceFilePath || !fs.existsSync(sourceFilePath)) {
      return NextResponse.json(
        {
          error: 'Original source video file is missing on disk. Please upload your recording to retry.',
        },
        { status: 400 }
      );
    }

    const currentProgress = typeof project.progress === 'number' ? project.progress : 0;

    // Reset project status and clear error message
    dbRepo.updateProjectStatus(id, 'in_progress', Math.max(5, currentProgress), 'Resuming processing pipeline...', {
      errorMessage: undefined,
      stageStatus: 'ACTIVE',
    });

    const orchestrator = new MasterAgentOrchestrator();
    const jobId = `job_${id}_retry_${Date.now()}`;

    // Asynchronously launch processing
    setTimeout(() => {
      orchestrator
        .processProject({
          projectId: id,
          sourceVideoId: String(sourceVideo?.id || `sv_${id}`),
          sourceFilePath,
          sourceChecksum: sourceVideo?.sha256_checksum ? String(sourceVideo.sha256_checksum) : (project.source_checksum ? String(project.source_checksum) : undefined),
          sourceUrl: project.source_url ? String(project.source_url) : undefined,
          jobId,
        })
        .catch((err) => {
          console.error(`[RetryAPI] Orchestrator retry failed for ${id}:`, err);
        });
    }, 20);

    return NextResponse.json({
      success: true,
      message: 'Processing resumed successfully.',
      projectId: id,
      status: 'in_progress',
    });
  } catch (error: any) {
    console.error('[RetryAPI] Error retrying project:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
