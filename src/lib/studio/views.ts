import path from 'node:path';
import { getProjectStoragePaths } from '../app-paths.ts';
import type { MediaAsset, Short, RenderRecord } from './store.ts';
import { totalOutputDuration } from '../render/edit-doc.ts';

/** URL for a file inside a project's storage folder, or null if the file is outside it. */
export function projectFileUrl(projectId: string, filePath: string | null | undefined, version?: number): string | null {
  if (!filePath) return null;
  const base = getProjectStoragePaths(projectId).base;
  const rel = path.relative(base, filePath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return `/api/projects/${encodeURIComponent(projectId)}/files/${rel.split(path.sep).map(encodeURIComponent).join('/')}${version ? `?v=${version}` : ''}`;
}

export function assetView(a: MediaAsset | null) {
  if (!a) return null;
  return {
    id: a.id,
    sourceType: a.sourceType,
    sourceRef: a.sourceType === 'youtube' ? a.sourceRef : path.basename(a.sourceRef || '').replace(/^\d+_/, ''),
    videoId: a.videoId,
    probe: a.probe,
    previewUrl: projectFileUrl(a.projectId, a.analysis?.previewPath || a.filePath),
    thumbnailUrl: projectFileUrl(a.projectId, a.thumbnailPath),
    hasTranscript: Boolean(a.transcript?.transcript?.segments?.length),
    ai: { audio: a.transcript?.ai || null, video: a.analysis?.video?.ai || null },
  };
}

export function shortView(s: Short) {
  return {
    id: s.id,
    projectId: s.projectId,
    rank: s.rank,
    title: s.title,
    description: s.description,
    reason: s.reason,
    category: s.category,
    score: s.score,
    startTime: s.startTime,
    endTime: s.endTime,
    duration: s.edit ? totalOutputDuration(s.edit) : s.endTime - s.startTime,
    transcript: s.transcript,
    status: s.status,
    version: s.version,
    videoUrl: projectFileUrl(s.projectId, s.outputPath, s.version),
    downloadUrl: s.outputPath ? `${projectFileUrl(s.projectId, s.outputPath)}${'?download=1'}` : null,
    thumbnailUrl: projectFileUrl(s.projectId, s.thumbnailPath, s.version),
    qc: s.qc,
    updatedAt: s.updatedAt,
  };
}

export function renderView(r: RenderRecord) {
  return {
    id: r.id,
    status: r.status,
    editVersion: r.editVersion,
    duration: r.duration,
    fileSize: r.fileSize,
    error: r.error,
    createdAt: r.createdAt,
    finishedAt: r.finishedAt,
    downloadUrl: r.outputPath ? `${projectFileUrl(r.projectId, r.outputPath)}?download=1` : null,
  };
}
