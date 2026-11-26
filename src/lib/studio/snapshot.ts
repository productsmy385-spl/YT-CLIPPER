import { dbRepo } from '../../db/repository.ts';
import { listJobs } from '../jobs/queue.ts';
import { getProjectAsset, listShorts } from './store.ts';
import { assetView, shortView } from './views.ts';

/** Everything the project page needs, from real backend state only. Used by GET and the SSE stream. */
export function getProjectSnapshot(projectId: string) {
  const project = dbRepo.getProject(projectId) as any;
  if (!project) return null;
  const jobs = listJobs(projectId);
  const processJob = jobs.find((j) => j.type === 'process_project') || null;
  const stages = (dbRepo.getPipelineStages(projectId) as any[]).map((s) => {
    let message = '';
    try { message = JSON.parse(s.details_json || '{}').message || ''; } catch {}
    return { n: s.stage_number, key: s.stage_key, name: s.stage_name, status: s.status, percent: s.progress_percent, message, error: s.error_message };
  });
  let settings = null;
  try { settings = project.settings_json ? JSON.parse(project.settings_json) : null; } catch {}
  return {
    project: {
      id: project.id,
      title: project.title,
      status: project.status,
      progress: project.progress,
      currentStage: project.current_stage,
      error: project.error_message,
      sourceType: project.source_type || (project.source_url ? 'youtube' : 'upload'),
      sourceUrl: project.source_url,
      settings,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
    },
    stages,
    job: processJob && {
      id: processJob.id, status: processJob.status, progress: processJob.progress, stage: processJob.stage,
      message: processJob.message, error: processJob.error, attempts: processJob.attempts, maxAttempts: processJob.max_attempts,
    },
    shortJobs: jobs
      .filter((j) => j.type !== 'process_project' && (j.status === 'queued' || j.status === 'running' || j.status === 'failed'))
      .map((j) => ({ id: j.id, shortId: j.short_id, type: j.type, status: j.status, progress: j.progress, message: j.message, error: j.error, updatedAt: j.updated_at })),
    asset: assetView(getProjectAsset(projectId)),
    shorts: listShorts(projectId).map(shortView),
  };
}
