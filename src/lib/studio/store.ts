import { rawDb } from '../../db/index.ts';
import type { EditDoc } from '../render/edit-doc.ts';
import type { ProbeResult } from '../media/ff.ts';

const now = () => new Date().toISOString();
const parse = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export type SourceType = 'youtube' | 'upload';

export interface MediaAsset {
  id: string;
  projectId: string;
  sourceType: SourceType;
  sourceRef: string | null;
  videoId: string | null;
  filePath: string;
  fileSize: number | null;
  checksum: string | null;
  probe: ProbeResult | null;
  thumbnailPath: string | null;
  waveform: number[] | null;
  transcript: any | null;
  analysis: any | null;
}

function rowToAsset(r: any): MediaAsset {
  return {
    id: r.id,
    projectId: r.project_id,
    sourceType: r.source_type,
    sourceRef: r.source_ref,
    videoId: r.video_id,
    filePath: r.file_path,
    fileSize: r.file_size,
    checksum: r.checksum,
    probe: parse(r.probe_json, null),
    thumbnailPath: r.thumbnail_path,
    waveform: parse(r.waveform_json, null),
    transcript: parse(r.transcript_json, null),
    analysis: parse(r.analysis_json, null),
  };
}

export function upsertMediaAsset(a: Partial<MediaAsset> & { id: string; projectId: string; sourceType: SourceType; filePath: string }) {
  const existing = getMediaAssetById(a.id);
  const m = { ...(existing || {}), ...a } as MediaAsset;
  const t = now();
  rawDb
    .prepare(
      `INSERT OR REPLACE INTO media_assets (id, project_id, source_type, source_ref, video_id, file_path, file_size, checksum, probe_json, thumbnail_path, waveform_json, transcript_json, analysis_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM media_assets WHERE id = ?), ?), ?)`
    )
    .run(
      m.id, m.projectId, m.sourceType, m.sourceRef ?? null, m.videoId ?? null, m.filePath, m.fileSize ?? null, m.checksum ?? null,
      m.probe ? JSON.stringify(m.probe) : null, m.thumbnailPath ?? null, m.waveform ? JSON.stringify(m.waveform) : null,
      m.transcript ? JSON.stringify(m.transcript) : null, m.analysis ? JSON.stringify(m.analysis) : null, m.id, t, t
    );
}

export function getMediaAssetById(id: string): MediaAsset | null {
  const r = rawDb.prepare(`SELECT * FROM media_assets WHERE id = ?`).get(id);
  return r ? rowToAsset(r) : null;
}

export function getProjectAsset(projectId: string): MediaAsset | null {
  const r = rawDb.prepare(`SELECT * FROM media_assets WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`).get(projectId);
  return r ? rowToAsset(r) : null;
}

// ---------------------------------------------------------------------------------------------

export interface Short {
  id: string;
  projectId: string;
  rank: number;
  title: string;
  description: string | null;
  reason: string | null;
  category: string | null;
  score: number | null;
  startTime: number;
  endTime: number;
  transcript: string | null;
  edit: EditDoc;
  status: 'draft' | 'rendering' | 'ready' | 'failed';
  outputPath: string | null;
  thumbnailPath: string | null;
  qc: any | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

function rowToShort(r: any): Short {
  return {
    id: r.id,
    projectId: r.project_id,
    rank: r.rank,
    title: r.title,
    description: r.description,
    reason: r.reason,
    category: r.category,
    score: r.score,
    startTime: r.start_time,
    endTime: r.end_time,
    transcript: r.transcript,
    edit: parse(r.edit_json, null as any),
    status: r.status,
    outputPath: r.output_path,
    thumbnailPath: r.thumbnail_path,
    qc: parse(r.qc_json, null),
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function insertShort(s: Omit<Short, 'createdAt' | 'updatedAt' | 'version' | 'status' | 'outputPath' | 'thumbnailPath' | 'qc'>) {
  const t = now();
  rawDb
    .prepare(
      `INSERT INTO shorts (id, project_id, rank, title, description, reason, category, score, start_time, end_time, transcript, edit_json, status, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?)`
    )
    .run(s.id, s.projectId, s.rank, s.title, s.description, s.reason, s.category, s.score, s.startTime, s.endTime, s.transcript, JSON.stringify(s.edit), t, t);
}

export function getShort(id: string): Short | null {
  const r = rawDb.prepare(`SELECT * FROM shorts WHERE id = ?`).get(id);
  return r ? rowToShort(r) : null;
}

export function listShorts(projectId: string): Short[] {
  return (rawDb.prepare(`SELECT * FROM shorts WHERE project_id = ? ORDER BY rank ASC, created_at ASC`).all(projectId) as any[]).map(rowToShort);
}

export function deleteShortsForProject(projectId: string) {
  rawDb.prepare(`DELETE FROM shorts WHERE project_id = ?`).run(projectId);
}

export function deleteShort(id: string) {
  rawDb.prepare(`DELETE FROM renders WHERE short_id = ?`).run(id);
  rawDb.prepare(`DELETE FROM shorts WHERE id = ?`).run(id);
}

/** Save an edited document; bumps the version so stale renders are detectable. */
export function saveShortEdit(id: string, edit: EditDoc, fields: { title?: string } = {}): Short | null {
  const t = now();
  rawDb
    .prepare(`UPDATE shorts SET edit_json = ?, title = COALESCE(?, title), version = version + 1, updated_at = ? WHERE id = ?`)
    .run(JSON.stringify(edit), fields.title ?? null, t, id);
  return getShort(id);
}

export function updateShort(id: string, f: Partial<Pick<Short, 'status' | 'outputPath' | 'thumbnailPath' | 'qc' | 'title' | 'description' | 'reason' | 'category' | 'score' | 'startTime' | 'endTime' | 'transcript' | 'edit'>>) {
  const cur = getShort(id);
  if (!cur) return;
  const m = { ...cur, ...f };
  rawDb
    .prepare(
      `UPDATE shorts SET status = ?, output_path = ?, thumbnail_path = ?, qc_json = ?, title = ?, description = ?, reason = ?, category = ?, score = ?,
       start_time = ?, end_time = ?, transcript = ?, edit_json = ?, version = ?, updated_at = ? WHERE id = ?`
    )
    .run(
      m.status, m.outputPath, m.thumbnailPath, m.qc ? JSON.stringify(m.qc) : null, m.title, m.description, m.reason, m.category, m.score,
      m.startTime, m.endTime, m.transcript, JSON.stringify(m.edit), f.edit ? cur.version + 1 : cur.version, now(), id
    );
}

// ---------------------------------------------------------------------------------------------

export interface RenderRecord {
  id: string;
  shortId: string;
  projectId: string;
  jobId: string | null;
  status: 'rendering' | 'completed' | 'failed';
  outputPath: string | null;
  fileSize: number | null;
  duration: number | null;
  editVersion: number | null;
  qc: any | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export function insertRender(r: { id: string; shortId: string; projectId: string; jobId: string | null; editVersion: number }) {
  rawDb
    .prepare(`INSERT INTO renders (id, short_id, project_id, job_id, status, edit_version, created_at) VALUES (?, ?, ?, ?, 'rendering', ?, ?)`)
    .run(r.id, r.shortId, r.projectId, r.jobId, r.editVersion, now());
}

export function finishRender(id: string, f: { status: 'completed' | 'failed'; outputPath?: string; fileSize?: number; duration?: number; qc?: any; error?: string }) {
  rawDb
    .prepare(`UPDATE renders SET status = ?, output_path = ?, file_size = ?, duration = ?, qc_json = ?, error = ?, finished_at = ? WHERE id = ?`)
    .run(f.status, f.outputPath ?? null, f.fileSize ?? null, f.duration ?? null, f.qc ? JSON.stringify(f.qc) : null, f.error ?? null, now(), id);
}

export function listRenders(shortId: string): RenderRecord[] {
  return (rawDb.prepare(`SELECT * FROM renders WHERE short_id = ? ORDER BY created_at DESC`).all(shortId) as any[]).map((r) => ({
    id: r.id,
    shortId: r.short_id,
    projectId: r.project_id,
    jobId: r.job_id,
    status: r.status,
    outputPath: r.output_path,
    fileSize: r.file_size,
    duration: r.duration,
    editVersion: r.edit_version,
    qc: parse(r.qc_json, null),
    error: r.error,
    createdAt: r.created_at,
    finishedAt: r.finished_at,
  }));
}
