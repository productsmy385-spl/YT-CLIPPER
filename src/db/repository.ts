import { rawDb } from './index.ts';
import type {
  DetectedHighlight,
  MemeAsset,
  MusicAsset,
  SoundEffectAsset,
  CopyrightComplianceReport,
  QualityAssuranceReport,
  AgentExecutionLog,
  ClipEditingConfig,
} from '../types';

export const dbRepo = {
  // --- PROJECTS ---
  createProject(data: { id: string; userId?: string; title: string; sourceUrl?: string; sourceFile?: string; sourceVideoId?: string; sourceChecksum?: string }) {
    const now = new Date().toISOString();
    const userId = data.userId || 'usr_creator_01';
    const stmt = rawDb.prepare(`
      INSERT INTO projects (id, user_id, title, status, progress, current_stage, source_url, source_file, source_video_id, source_checksum, created_at, updated_at)
      VALUES (?, ?, ?, 'created', 0, 'init', ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(data.id, userId, data.title, data.sourceUrl || null, data.sourceFile || null, data.sourceVideoId || null, data.sourceChecksum || null, now, now);
    return this.getProject(data.id);
  },

  getProject(id: string) {
    const stmt = rawDb.prepare(`SELECT * FROM projects WHERE id = ?`);
    return stmt.get(id);
  },

  getProjectBySourceChecksum(checksum: string) {
    if (!checksum) return null;
    const stmt = rawDb.prepare(`
      SELECT * FROM projects 
      WHERE source_checksum = ? AND (is_deleted = 0 OR is_deleted IS NULL)
      ORDER BY created_at DESC LIMIT 1
    `);
    return stmt.get(checksum) as any;
  },

  listProjects() {
    const stmt = rawDb.prepare(`SELECT * FROM projects WHERE is_deleted = 0 OR is_deleted IS NULL ORDER BY created_at DESC`);
    const rows = stmt.all() as any[];
    return rows.map((p: any) => {
      let highlightsCount = 0;
      let extractedClipsCount = 0;
      let editedClipsCount = 0;
      try {
        highlightsCount = (rawDb.prepare(`SELECT COUNT(*) as c FROM detected_highlights WHERE project_id = ?`).get(p.id) as any)?.c || 0;
        extractedClipsCount = (rawDb.prepare(`SELECT COUNT(*) as c FROM generated_clips WHERE project_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)`).get(p.id) as any)?.c || 0;
        editedClipsCount = (rawDb.prepare(`SELECT COUNT(*) as c FROM generated_clips WHERE project_id = ? AND status = 'rendered' AND (is_deleted = 0 OR is_deleted IS NULL)`).get(p.id) as any)?.c || 0;
      } catch {}
      return { ...p, highlightsCount, extractedClipsCount, editedClipsCount };
    });
  },

  updateProjectStatus(
    id: string,
    status: string,
    progress: number,
    stage: string,
    options?: {
      stageId?: string;
      stageStatus?: string;
      errorMessage?: string;
      workerId?: string;
    }
  ) {
    const now = new Date().toISOString();
    const stageId = options?.stageId || null;
    const stageStatus = options?.stageStatus || null;
    const errorMessage = options?.errorMessage || null;
    const workerId = options?.workerId || null;

    const stmt = rawDb.prepare(`
      UPDATE projects 
      SET status = ?, 
          progress = ?, 
          current_stage = ?, 
          stage_id = COALESCE(?, stage_id),
          stage_status = COALESCE(?, stage_status),
          error_message = ?,
          heartbeat_at = ?,
          worker_id = COALESCE(?, worker_id),
          updated_at = ? 
      WHERE id = ?
    `);
    stmt.run(status, progress, stage, stageId, stageStatus, errorMessage, now, workerId, now, id);
  },

  claimProjectLock(projectId: string, workerId: string): boolean {
    const now = new Date().toISOString();
    try {
      const stmt = rawDb.prepare(`
        UPDATE projects 
        SET locked_by = ?, lock_acquired_at = ?, heartbeat_at = ?, updated_at = ?
        WHERE id = ? AND (locked_by IS NULL OR locked_by = ? OR (strftime('%s', 'now') - strftime('%s', COALESCE(heartbeat_at, updated_at))) > 180)
      `);
      const res = stmt.run(workerId, now, now, now, projectId, workerId);
      return res.changes > 0;
    } catch {
      return false;
    }
  },

  releaseProjectLock(projectId: string, workerId?: string) {
    try {
      if (workerId) {
        rawDb.prepare(`UPDATE projects SET locked_by = NULL, lock_acquired_at = NULL WHERE id = ? AND locked_by = ?`).run(projectId, workerId);
      } else {
        rawDb.prepare(`UPDATE projects SET locked_by = NULL, lock_acquired_at = NULL WHERE id = ?`).run(projectId);
      }
    } catch {}
  },

  savePipelineStage(data: {
    projectId: string;
    stageNumber: number;
    stageKey: string;
    stageName: string;
    status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    progressPercent: number;
    startedAt?: string;
    completedAt?: string;
    errorMessage?: string;
    detailsJson?: string;
  }) {
    const id = `stage_${data.projectId}_${data.stageNumber}`;
    const stmt = rawDb.prepare(`
      INSERT INTO project_pipeline_stages (
        id, project_id, stage_number, stage_key, stage_name, status,
        progress_percent, started_at, completed_at, error_message, details_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, stage_number) DO UPDATE SET
        status = excluded.status,
        progress_percent = excluded.progress_percent,
        started_at = COALESCE(excluded.started_at, project_pipeline_stages.started_at),
        completed_at = COALESCE(excluded.completed_at, project_pipeline_stages.completed_at),
        error_message = excluded.error_message,
        details_json = excluded.details_json
    `);
    stmt.run(
      id,
      data.projectId,
      data.stageNumber,
      data.stageKey,
      data.stageName,
      data.status,
      data.progressPercent,
      data.startedAt || null,
      data.completedAt || null,
      data.errorMessage || null,
      data.detailsJson || null
    );
  },

  getPipelineStages(projectId: string) {
    try {
      const stmt = rawDb.prepare(`
        SELECT * FROM project_pipeline_stages WHERE project_id = ? ORDER BY stage_number ASC
      `);
      return stmt.all(projectId);
    } catch {
      return [];
    }
  },

  checkAndRecoverStalledJobs(timeoutSeconds: number = 180): number {
    const now = Math.floor(Date.now() / 1000);
    try {
      const stmt = rawDb.prepare(`
        SELECT id, current_stage, stage_id, heartbeat_at, updated_at
        FROM projects
        WHERE status = 'in_progress'
      `);
      const active = stmt.all() as any[];
      let recovered = 0;

      for (const p of active) {
        const ts = p.heartbeat_at || p.updated_at;
        if (!ts) continue;
        const lastSeconds = Math.floor(new Date(ts).getTime() / 1000);
        if (now - lastSeconds > timeoutSeconds) {
          const errorMsg = `Processing stalled at Stage ${p.stage_id || '1'} (${p.current_stage || 'processing'}): Worker heartbeat timed out after ${timeoutSeconds}s.`;
          rawDb.prepare(`
            UPDATE projects
            SET status = 'error', error_message = ?, stage_status = 'FAILED', updated_at = ?
            WHERE id = ?
          `).run(errorMsg, new Date().toISOString(), p.id);
          recovered++;
        }
      }
      return recovered;
    } catch {
      return 0;
    }
  },

  cancelProject(id: string) {
    const now = new Date().toISOString();
    const stmt = rawDb.prepare(`
      UPDATE projects 
      SET status = 'cancelled', 
          cancellation_requested = 1, 
          cancelled_at = ?, 
          updated_at = ? 
      WHERE id = ?
    `);
    stmt.run(now, now, id);
    return this.getProject(id);
  },

  isProjectCancelled(id: string): boolean {
    try {
      const stmt = rawDb.prepare(`SELECT status, cancellation_requested FROM projects WHERE id = ?`);
      const row = stmt.get(id) as any;
      return row ? (row.status === 'cancelled' || row.cancellation_requested === 1) : false;
    } catch {
      return false;
    }
  },

  // --- USERS & PROFILE ---
  getUser(id: string = 'usr_creator_01') {
    let stmt = rawDb.prepare(`SELECT * FROM users WHERE id = ?`);
    let user = stmt.get(id) as any;
    if (!user) {
      // Seed default user if not exists
      const now = new Date().toISOString();
      rawDb.prepare(`
        INSERT OR IGNORE INTO users (id, email, name, role, avatar_url, created_at, updated_at)
        VALUES ('usr_creator_01', 'creator@vicecity.io', 'Vice City Studios', 'admin', '/avatars/creator.svg', ?, ?)
      `).run(now, now);
      user = stmt.get(id) as any;
    } else if (!user.avatar_url) {
      user.avatar_url = '/avatars/creator.svg';
    }
    return user;
  },

  updateUserProfile(id: string = 'usr_creator_01', data: { name?: string; email?: string; role?: string; avatar_url?: string | null }) {
    const current = this.getUser(id);
    const now = new Date().toISOString();
    const name = data.name !== undefined ? data.name : current.name;
    const email = data.email !== undefined ? data.email : current.email;
    const role = data.role !== undefined ? data.role : current.role;
    const avatarUrl = data.avatar_url !== undefined ? data.avatar_url : current.avatar_url;

    const stmt = rawDb.prepare(`
      UPDATE users 
      SET name = ?, email = ?, role = ?, avatar_url = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(name, email, role, avatarUrl, now, id);
    return this.getUser(id);
  },

  // --- SOURCE VIDEOS ---
  saveSourceVideo(data: {
    id: string;
    projectId: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    duration: number;
    width: number;
    height: number;
    fps: number;
    bitrate?: number;
    audioChannels?: number;
    originSource?: string;
    sha256Checksum?: string;
  }) {
    const now = new Date().toISOString();
    const stmt = rawDb.prepare(`
      INSERT OR REPLACE INTO source_videos (id, project_id, file_name, file_path, file_size, duration, width, height, fps, bitrate, audio_channels, origin_source, sha256_checksum, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      data.id,
      data.projectId,
      data.fileName,
      data.filePath,
      data.fileSize,
      data.duration,
      data.width,
      data.height,
      data.fps,
      data.bitrate || 0,
      data.audioChannels || 2,
      data.originSource || 'authorized_stream',
      data.sha256Checksum || null,
      now
    );
  },

  getSourceVideoByProject(projectId: string, sourceVideoId?: string) {
    if (sourceVideoId) {
      const stmt = rawDb.prepare(`SELECT * FROM source_videos WHERE project_id = ? AND id = ?`);
      return stmt.get(projectId, sourceVideoId);
    }
    const stmt = rawDb.prepare(`SELECT * FROM source_videos WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`);
    return stmt.get(projectId);
  },

  listSourceVideos(includeDeleted = false) {
    const query = includeDeleted
      ? `SELECT sv.*, p.title as project_title FROM source_videos sv LEFT JOIN projects p ON sv.project_id = p.id ORDER BY sv.created_at DESC`
      : `SELECT sv.*, p.title as project_title FROM source_videos sv LEFT JOIN projects p ON sv.project_id = p.id WHERE sv.is_deleted = 0 OR sv.is_deleted IS NULL ORDER BY sv.created_at DESC`;
    return rawDb.prepare(query).all();
  },

  getSourceVideoById(id: string) {
    const stmt = rawDb.prepare(`SELECT sv.*, p.title as project_title FROM source_videos sv LEFT JOIN projects p ON sv.project_id = p.id WHERE sv.id = ?`);
    return stmt.get(id);
  },

  renameSourceVideo(id: string, newFileName: string) {
    const stmt = rawDb.prepare(`UPDATE source_videos SET file_name = ? WHERE id = ?`);
    stmt.run(newFileName, id);
    return this.getSourceVideoById(id);
  },

  softDeleteSourceVideo(id: string) {
    const now = new Date().toISOString();
    const stmt = rawDb.prepare(`UPDATE source_videos SET is_deleted = 1, deleted_at = ? WHERE id = ?`);
    stmt.run(now, id);
    return this.getSourceVideoById(id);
  },

  restoreSourceVideo(id: string) {
    const stmt = rawDb.prepare(`UPDATE source_videos SET is_deleted = 0, deleted_at = NULL WHERE id = ?`);
    stmt.run(id);
    return this.getSourceVideoById(id);
  },

  permanentDeleteSourceVideo(id: string) {
    const stmt = rawDb.prepare(`DELETE FROM source_videos WHERE id = ?`);
    stmt.run(id);
  },

  getSourceVideoClipsCount(projectId: string) {
    const stmt = rawDb.prepare(`SELECT COUNT(*) as count FROM generated_clips WHERE project_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)`);
    const res = stmt.get(projectId) as any;
    return res?.count || 0;
  },

  // --- HIGHLIGHTS ---
  saveHighlights(highlights: DetectedHighlight[]) {
    const stmt = rawDb.prepare(`
      INSERT OR REPLACE INTO detected_highlights (
        id, project_id, category, category_label, entertainment_score,
        start_time, end_time, duration, hook_strength, hook_reason,
        peak_event, suggested_meme_mood, suggested_music_genre, is_selected,
        source_video_id, normalized_start, normalized_end, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = new Date().toISOString();
    for (const h of highlights) {
      const normStart = Number(h.startTime.toFixed(1));
      const normEnd = Number(h.endTime.toFixed(1));
      stmt.run(
        h.id,
        h.projectId,
        h.category,
        h.categoryLabel,
        h.entertainmentScore,
        h.startTime,
        h.endTime,
        h.duration,
        h.hookStrength,
        h.hookReason,
        h.peakEvent,
        h.suggestedMemeMood,
        h.suggestedMusicGenre,
        h.selectedForExport ? 1 : 0,
        (h as any).sourceVideoId || null,
        normStart,
        normEnd,
        now
      );
    }
  },

  getHighlightsByProject(projectId: string): DetectedHighlight[] {
    const stmt = rawDb.prepare(`
      SELECT 
        id, project_id as projectId, category, category_label as categoryLabel,
        entertainment_score as entertainmentScore, start_time as startTime,
        end_time as endTime, duration, hook_strength as hookStrength,
        hook_reason as hookReason, peak_event as peakEvent,
        suggested_meme_mood as suggestedMemeMood, suggested_music_genre as suggestedMusicGenre,
        is_selected as selectedForExport
      FROM detected_highlights WHERE project_id = ? ORDER BY entertainment_score DESC
    `);
    const rows = stmt.all(projectId) as any[];
    return rows.map((r) => ({ ...r, selectedForExport: Boolean(r.selectedForExport) }));
  },

  // --- GENERATED CLIPS ---
  findEquivalentClip(projectId: string, highlightId: string, extractionVersion: number = 1) {
    try {
      const stmt = rawDb.prepare(`
        SELECT * FROM generated_clips 
        WHERE project_id = ? AND highlight_id = ? AND (extraction_version = ? OR extraction_version IS NULL)
          AND (is_deleted = 0 OR is_deleted IS NULL)
        LIMIT 1
      `);
      return stmt.get(projectId, highlightId, extractionVersion) as any;
    } catch {
      return null;
    }
  },

  findClipByTimeRange(projectId: string, startTime: number, endTime: number, tolerance: number = 0.5) {
    try {
      const stmt = rawDb.prepare(`
        SELECT * FROM generated_clips
        WHERE project_id = ?
          AND ABS(COALESCE(start_time, 0) - ?) <= ?
          AND ABS(COALESCE(end_time, 0) - ?) <= ?
          AND (is_deleted = 0 OR is_deleted IS NULL)
        LIMIT 1
      `);
      return stmt.get(projectId, startTime, tolerance, endTime, tolerance) as any;
    } catch {
      return null;
    }
  },

  saveGeneratedClip(data: {
    id: string;
    projectId: string;
    highlightId: string;
    title: string;
    duration: number;
    startTime?: number;
    endTime?: number;
    extractionVersion?: number;
    editingVersion?: number;
    outputPath?: string;
    outputFilePath?: string;
    thumbnailPath?: string;
    status: string;
    processingStatus?: string;
    resolution?: string;
    fps?: number;
    qaScore?: number;
    copyrightPassed?: boolean;
    sourceVideoId?: string;
    sourceChecksum?: string;
    jobId?: string;
    rawClipPath?: string;
    editedClipPath?: string;
  }) {
    const now = new Date().toISOString();
    const extractionVersion = data.extractionVersion || 1;
    const editingVersion = data.editingVersion || 1;
    const processingStatus = data.processingStatus || data.status;
    const outPath = data.outputFilePath || data.outputPath || null;

    const stmt = rawDb.prepare(`
      INSERT INTO generated_clips (
        id, project_id, highlight_id, title, duration, start_time, end_time,
        extraction_version, editing_version, output_path, output_file_path, thumbnail_path,
        status, processing_status, resolution, fps, qa_score, copyright_passed,
        source_video_id, source_checksum, job_id, raw_clip_path, edited_clip_path, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, highlight_id, extraction_version) DO UPDATE SET
        title = excluded.title,
        duration = excluded.duration,
        start_time = COALESCE(excluded.start_time, generated_clips.start_time),
        end_time = COALESCE(excluded.end_time, generated_clips.end_time),
        editing_version = excluded.editing_version,
        output_path = COALESCE(excluded.output_path, generated_clips.output_path),
        output_file_path = COALESCE(excluded.output_file_path, generated_clips.output_file_path),
        thumbnail_path = COALESCE(excluded.thumbnail_path, generated_clips.thumbnail_path),
        status = excluded.status,
        processing_status = excluded.processing_status,
        resolution = excluded.resolution,
        fps = excluded.fps,
        qa_score = COALESCE(excluded.qa_score, generated_clips.qa_score),
        copyright_passed = COALESCE(excluded.copyright_passed, generated_clips.copyright_passed),
        source_video_id = COALESCE(excluded.source_video_id, generated_clips.source_video_id),
        source_checksum = COALESCE(excluded.source_checksum, generated_clips.source_checksum),
        job_id = COALESCE(excluded.job_id, generated_clips.job_id),
        raw_clip_path = COALESCE(excluded.raw_clip_path, generated_clips.raw_clip_path),
        edited_clip_path = COALESCE(excluded.edited_clip_path, generated_clips.edited_clip_path),
        updated_at = excluded.updated_at
    `);
    stmt.run(
      data.id,
      data.projectId,
      data.highlightId,
      data.title,
      data.duration,
      data.startTime !== undefined ? data.startTime : null,
      data.endTime !== undefined ? data.endTime : null,
      extractionVersion,
      editingVersion,
      outPath,
      outPath,
      data.thumbnailPath || null,
      data.status,
      processingStatus,
      data.resolution || '1080x1920',
      data.fps || 30,
      data.qaScore || null,
      data.copyrightPassed === undefined ? null : data.copyrightPassed ? 1 : 0,
      data.sourceVideoId || null,
      data.sourceChecksum || null,
      data.jobId || null,
      data.rawClipPath || null,
      data.editedClipPath || null,
      now,
      now
    );
  },

  getClipsByProject(projectId: string, sourceVideoId?: string) {
    if (sourceVideoId) {
      const stmt = rawDb.prepare(`
        SELECT * FROM generated_clips 
        WHERE project_id = ? AND (source_video_id = ? OR source_video_id IS NULL) AND (is_deleted = 0 OR is_deleted IS NULL)
        ORDER BY created_at DESC
      `);
      return stmt.all(projectId, sourceVideoId);
    }
    const stmt = rawDb.prepare(`
      SELECT * FROM generated_clips 
      WHERE project_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
      ORDER BY created_at DESC
    `);
    return stmt.all(projectId);
  },

  getClipById(id: string) {
    const stmt = rawDb.prepare(`SELECT * FROM generated_clips WHERE id = ?`);
    return stmt.get(id);
  },

  getAllClips(includeDeleted = false) {
    const query = includeDeleted
      ? `SELECT * FROM generated_clips ORDER BY created_at DESC`
      : `SELECT * FROM generated_clips WHERE is_deleted = 0 OR is_deleted IS NULL ORDER BY created_at DESC`;
    return rawDb.prepare(query).all();
  },

  getTrashClips() {
    const stmt = rawDb.prepare(`SELECT * FROM generated_clips WHERE is_deleted = 1 ORDER BY deleted_at DESC`);
    return stmt.all();
  },

  renameClip(id: string, newTitle: string) {
    const stmt = rawDb.prepare(`UPDATE generated_clips SET title = ? WHERE id = ?`);
    stmt.run(newTitle, id);
    return this.getClipById(id);
  },

  softDeleteClip(id: string) {
    const now = new Date().toISOString();
    rawDb.prepare(`UPDATE generated_clips SET is_deleted = 1, deleted_at = ? WHERE id = ?`).run(now, id);
    rawDb.prepare(`UPDATE export_files SET is_deleted = 1, deleted_at = ? WHERE file_path LIKE ?`).run(now, `%${id}%`);
    return this.getClipById(id);
  },

  restoreClip(id: string) {
    rawDb.prepare(`UPDATE generated_clips SET is_deleted = 0, deleted_at = NULL WHERE id = ?`).run(id);
    rawDb.prepare(`UPDATE export_files SET is_deleted = 0, deleted_at = NULL WHERE file_path LIKE ?`).run(`%${id}%`);
    return this.getClipById(id);
  },

  permanentDeleteClip(id: string) {
    rawDb.exec('BEGIN TRANSACTION;');
    try {
      rawDb.prepare(`DELETE FROM quality_reports WHERE clip_id = ?`).run(id);
      rawDb.prepare(`DELETE FROM clip_editing_configurations WHERE clip_id = ?`).run(id);
      rawDb.prepare(`DELETE FROM editing_jobs WHERE clip_id = ?`).run(id);
      rawDb.prepare(`DELETE FROM subtitles WHERE clip_id = ?`).run(id);
      rawDb.prepare(`DELETE FROM export_jobs WHERE clip_id = ?`).run(id);
      const exports = rawDb.prepare(`SELECT id FROM export_files WHERE file_path LIKE ?`).all(`%${id}%`) as any[];
      for (const exp of exports) {
        rawDb.prepare(`DELETE FROM scheduled_posts WHERE export_file_id = ?`).run(exp.id);
      }
      rawDb.prepare(`DELETE FROM export_files WHERE file_path LIKE ?`).run(`%${id}%`);
      rawDb.prepare(`DELETE FROM generated_clips WHERE id = ?`).run(id);
      rawDb.exec('COMMIT;');
    } catch (err) {
      rawDb.exec('ROLLBACK;');
      throw err;
    }
  },

  logMediaDeletion(data: {
    itemType: string;
    itemId: string;
    title?: string;
    filePath?: string;
    action: string;
    details?: string;
    userId?: string;
  }) {
    const id = `del_log_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    const stmt = rawDb.prepare(`
      INSERT INTO media_deletion_logs (id, item_type, item_id, title, file_path, action, user_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      data.itemType,
      data.itemId,
      data.title || null,
      data.filePath || null,
      data.action,
      data.userId || 'usr_creator_01',
      data.details || null,
      now
    );
  },

  getMediaDeletionLogs() {
    const stmt = rawDb.prepare(`SELECT * FROM media_deletion_logs ORDER BY created_at DESC LIMIT 100`);
    return stmt.all();
  },

  updateClipStatus(id: string, status: string) {
    const stmt = rawDb.prepare(`UPDATE generated_clips SET status = ? WHERE id = ?`);
    stmt.run(status, id);
    return this.getClipById(id);
  },

  // --- AI AGENTS & LOGS ---
  saveAgent(agent: { id: string; name: string; role: string; description: string; model: string }) {
    const stmt = rawDb.prepare(`
      INSERT OR REPLACE INTO ai_agents (id, name, role, description, model, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    stmt.run(agent.id, agent.name, agent.role, agent.description, agent.model);
  },

  getAgents() {
    const stmt = rawDb.prepare(`SELECT * FROM ai_agents ORDER BY name ASC`);
    return stmt.all();
  },

  logAgentExecution(log: AgentExecutionLog) {
    const stmt = rawDb.prepare(`
      INSERT INTO agent_execution_logs (
        id, project_id, agent_id, agent_name, stage, status, message,
        duration_ms, input_summary, output_summary, error, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      log.id,
      log.projectId || null,
      log.agentId,
      log.agentName,
      log.stage,
      log.status,
      log.message,
      log.durationMs || 0,
      log.inputSummary || null,
      log.outputSummary || null,
      log.error || null,
      log.startedAt
    );
  },

  getAgentLogs(projectId?: string) {
    if (projectId) {
      const stmt = rawDb.prepare(`SELECT * FROM agent_execution_logs WHERE project_id = ? ORDER BY created_at DESC`);
      return stmt.all(projectId);
    }
    const stmt = rawDb.prepare(`SELECT * FROM agent_execution_logs ORDER BY created_at DESC LIMIT 100`);
    return stmt.all();
  },

  // --- MEME ASSETS ---
  getMemeAssets(): MemeAsset[] {
    const stmt = rawDb.prepare(`SELECT * FROM meme_assets`);
    const rows = stmt.all() as any[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      emotion: r.emotion,
      filePath: r.file_path,
      duration: r.duration,
      overlayType: r.overlay_type,
      licenseStatus: 'verified_cc0',
    }));
  },

  // --- MUSIC ASSETS ---
  getMusicAssets(): MusicAsset[] {
    const stmt = rawDb.prepare(`SELECT * FROM music_assets`);
    const rows = stmt.all() as any[];
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      genre: r.genre,
      bpm: r.bpm,
      energy: r.energy,
      filePath: r.file_path,
      duration: r.duration,
      licenseDetails: 'Royalty-Free Gaming License',
    }));
  },

  // --- SFX ASSETS ---
  getSoundEffectAssets(): SoundEffectAsset[] {
    const stmt = rawDb.prepare(`SELECT * FROM sound_effect_assets`);
    const rows = stmt.all() as any[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      filePath: r.file_path,
      duration: r.duration,
      defaultVolume: r.default_volume,
    }));
  },

  // --- REPORTS ---
  saveCopyrightReport(report: CopyrightComplianceReport) {
    const now = new Date().toISOString();
    const stmt = rawDb.prepare(`
      INSERT OR REPLACE INTO copyright_reports (
        id, project_id, clip_id, compliance_score, passed, source_authorized,
        music_compliant, memes_compliant, problem_items_json, report_summary, generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const id = `cr_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    stmt.run(
      id,
      report.projectId,
      report.clipId || null,
      report.score,
      report.passed ? 1 : 0,
      report.gameplayAuthorized ? 1 : 0,
      report.musicLicenseValid ? 1 : 0,
      report.memesAuthorized ? 1 : 0,
      JSON.stringify(report.problematicItems),
      report.legalNotice,
      now
    );
  },

  getCopyrightReportByProject(projectId: string) {
    const stmt = rawDb.prepare(`SELECT * FROM copyright_reports WHERE project_id = ? ORDER BY generated_at DESC LIMIT 1`);
    return stmt.get(projectId);
  },

  saveQualityReport(report: QualityAssuranceReport) {
    const now = new Date().toISOString();
    const stmt = rawDb.prepare(`
      INSERT OR REPLACE INTO quality_reports (
        id, clip_id, qa_score, passed, resolution_check, aspect_ratio_check,
        audio_clipping, black_frames_found, sync_offset_ms, hook_grade, recommendations_json, generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const id = `qa_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    stmt.run(
      id,
      report.clipId,
      report.qaScore,
      report.passed ? 1 : 0,
      report.resolutionCheck ? 1 : 0,
      report.aspectRatioCheck ? 1 : 0,
      report.audioClippingDetected ? 1 : 0,
      report.blackFramesDetected ? 1 : 0,
      report.subtitleSyncOffsetMs,
      report.openingHookGrade,
      JSON.stringify(report.recommendations),
      now
    );
  },

  getQualityReportByClip(clipId: string) {
    const stmt = rawDb.prepare(`SELECT * FROM quality_reports WHERE clip_id = ?`);
    return stmt.get(clipId);
  },

  // --- EXPORTS ---
  saveExportFile(data: {
    id: string;
    exportJobId: string;
    platform: string;
    filePath: string;
    fileSize: number;
    title: string;
    description: string;
    tags: string;
    downloadUrl: string;
  }) {
    const now = new Date().toISOString();
    const stmt = rawDb.prepare(`
      INSERT OR REPLACE INTO export_files (
        id, export_job_id, platform, file_path, file_size, title, description, tags, download_url, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      data.id,
      data.exportJobId,
      data.platform,
      data.filePath,
      data.fileSize,
      data.title,
      data.description,
      data.tags,
      data.downloadUrl,
      now
    );
  },

  getExportFiles(includeDeleted = false) {
    const query = includeDeleted
      ? `SELECT * FROM export_files ORDER BY created_at DESC`
      : `SELECT * FROM export_files WHERE is_deleted = 0 OR is_deleted IS NULL ORDER BY created_at DESC`;
    return rawDb.prepare(query).all();
  },

  // --- METRICS ---
  getDashboardMetrics() {
    const totalProjects = (rawDb.prepare(`SELECT COUNT(*) as count FROM projects`).get() as any)?.count || 0;
    const totalClips = (rawDb.prepare(`SELECT COUNT(*) as count FROM generated_clips`).get() as any)?.count || 0;
    const avgQa = (rawDb.prepare(`SELECT AVG(qa_score) as avg FROM quality_reports`).get() as any)?.avg || 94;
    const pendingJobs = (rawDb.prepare(`SELECT COUNT(*) as count FROM editing_jobs WHERE status = 'pending'`).get() as any)?.count || 0;
    const totalExports = (rawDb.prepare(`SELECT COUNT(*) as count FROM export_files`).get() as any)?.count || 0;
    return {
      totalProjects,
      totalClips,
      avgQaScore: Math.round(avgQa),
      pendingJobs,
      totalExports,
    };
  },

  // --- SOCIAL PUBLISHING & SCHEDULING (PARTS 7, 8, 9, 10, 11, 12) ---

  listConnectedAccounts(userId = 'usr_creator_01') {
    const stmt = rawDb.prepare(`SELECT * FROM connected_social_accounts WHERE user_id = ? ORDER BY created_at DESC`);
    return stmt.all(userId);
  },

  getConnectedAccount(id: string) {
    const stmt = rawDb.prepare(`SELECT * FROM connected_social_accounts WHERE id = ?`);
    return stmt.get(id);
  },

  saveConnectedAccount(data: {
    id: string;
    userId: string;
    platform: 'youtube' | 'instagram' | 'tiktok';
    accountName: string;
    accountId: string;
    profileImageUrl?: string;
  }) {
    const now = new Date().toISOString();
    const stmt = rawDb.prepare(`
      INSERT OR REPLACE INTO connected_social_accounts (id, user_id, platform, account_name, account_id, profile_image_url, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `);
    stmt.run(data.id, data.userId, data.platform, data.accountName, data.accountId, data.profileImageUrl || null, now);
    return this.getConnectedAccount(data.id);
  },

  saveOAuthToken(data: {
    id: string;
    accountId: string;
    platform: string;
    accessTokenEncrypted: string;
    refreshTokenEncrypted?: string;
    tokenType?: string;
    scope: string;
    expiresAt: string;
  }) {
    const now = new Date().toISOString();
    const stmt = rawDb.prepare(`
      INSERT OR REPLACE INTO social_oauth_tokens (id, account_id, platform, access_token_encrypted, refresh_token_encrypted, token_type, scope, expires_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      data.id,
      data.accountId,
      data.platform,
      data.accessTokenEncrypted,
      data.refreshTokenEncrypted || null,
      data.tokenType || 'Bearer',
      data.scope,
      data.expiresAt,
      now
    );
  },

  getOAuthToken(accountId: string) {
    const stmt = rawDb.prepare(`SELECT * FROM social_oauth_tokens WHERE account_id = ? ORDER BY updated_at DESC LIMIT 1`);
    return stmt.get(accountId);
  },

  deleteConnectedAccount(accountId: string) {
    rawDb.prepare(`DELETE FROM social_oauth_tokens WHERE account_id = ?`).run(accountId);
    rawDb.prepare(`DELETE FROM connected_social_accounts WHERE id = ?`).run(accountId);
  },

  createScheduledPost(data: {
    id: string;
    userId: string;
    projectId: string;
    exportFileId: string;
    platform: 'youtube_shorts' | 'instagram_reels' | 'tiktok';
    connectedAccountId: string;
    scheduledAt: string;
    timezone?: string;
    status?: string;
  }) {
    const now = new Date().toISOString();
    const stmt = rawDb.prepare(`
      INSERT INTO scheduled_posts (id, user_id, project_id, export_file_id, platform, connected_account_id, scheduled_at, timezone, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      data.id,
      data.userId,
      data.projectId,
      data.exportFileId,
      data.platform,
      data.connectedAccountId,
      data.scheduledAt,
      data.timezone || 'Asia/Kolkata',
      data.status || 'SCHEDULED',
      now,
      now
    );
    return this.getScheduledPostById(data.id);
  },

  getScheduledPosts(status?: string) {
    const baseQuery = `
      SELECT sp.*,
        COALESCE(ef.title, gc.title, 'GTA 6 Highlight') as title,
        COALESCE(ef.description, 'GTA 6 Vice City action gameplay short! #shorts #gta6') as description,
        COALESCE(ef.tags, 'gta6, shorts, gaming, vicecity') as tags,
        COALESCE(ef.file_path, gc.output_path, gc.raw_clip_path) as file_path,
        COALESCE(ef.download_url, '/api/media/preview?id=' || gc.id) as download_url,
        COALESCE(gc.duration, 30) as duration,
        COALESCE(gc.resolution, '1080x1920') as resolution,
        ca.account_name, ca.platform as ca_platform
      FROM scheduled_posts sp
      LEFT JOIN export_files ef ON sp.export_file_id = ef.id
      LEFT JOIN generated_clips gc ON sp.export_file_id = gc.id
      LEFT JOIN connected_social_accounts ca ON sp.connected_account_id = ca.id
    `;
    if (status) {
      const stmt = rawDb.prepare(`${baseQuery} WHERE sp.status = ? ORDER BY sp.scheduled_at ASC`);
      return stmt.all(status);
    }
    const stmt = rawDb.prepare(`${baseQuery} ORDER BY sp.scheduled_at ASC`);
    return stmt.all();
  },

  getScheduledPostById(id: string) {
    const stmt = rawDb.prepare(`
      SELECT sp.*,
        COALESCE(ef.title, gc.title, 'GTA 6 Highlight') as title,
        COALESCE(ef.description, 'GTA 6 Vice City action gameplay short! #shorts #gta6') as description,
        COALESCE(ef.tags, 'gta6, shorts, gaming, vicecity') as tags,
        COALESCE(ef.file_path, gc.output_path, gc.raw_clip_path) as file_path,
        COALESCE(ef.download_url, '/api/media/preview?id=' || gc.id) as download_url,
        COALESCE(gc.duration, 30) as duration,
        COALESCE(gc.resolution, '1080x1920') as resolution,
        ca.account_name, ca.account_id as ca_account_id, ca.platform as ca_platform
      FROM scheduled_posts sp
      LEFT JOIN export_files ef ON sp.export_file_id = ef.id
      LEFT JOIN generated_clips gc ON sp.export_file_id = gc.id
      LEFT JOIN connected_social_accounts ca ON sp.connected_account_id = ca.id
      WHERE sp.id = ?
    `);
    return stmt.get(id);
  },

  getDueScheduledPosts() {
    const now = new Date().toISOString();
    const stmt = rawDb.prepare(`
      SELECT sp.*,
        COALESCE(ef.title, gc.title, 'GTA 6 Highlight') as title,
        COALESCE(ef.description, 'GTA 6 Vice City action gameplay short! #shorts #gta6') as description,
        COALESCE(ef.tags, 'gta6, shorts, gaming, vicecity') as tags,
        COALESCE(ef.file_path, gc.output_path, gc.raw_clip_path) as file_path,
        ca.account_name, ca.account_id as ca_account_id, ca.platform as ca_platform
      FROM scheduled_posts sp
      LEFT JOIN export_files ef ON sp.export_file_id = ef.id
      LEFT JOIN generated_clips gc ON sp.export_file_id = gc.id
      LEFT JOIN connected_social_accounts ca ON sp.connected_account_id = ca.id
      WHERE sp.status = 'SCHEDULED' AND sp.scheduled_at <= ?
      ORDER BY sp.scheduled_at ASC
    `);
    return stmt.all(now);
  },

  cancelScheduledPost(id: string) {
    const now = new Date().toISOString();
    rawDb.prepare(`UPDATE scheduled_posts SET status = 'CANCELLED', updated_at = ? WHERE id = ?`).run(now, id);
    return this.getScheduledPostById(id);
  },

  updateScheduledPostStatus(id: string, status: string, details?: { platformPostId?: string; publishedUrl?: string; lastError?: string }) {
    const now = new Date().toISOString();
    const stmt = rawDb.prepare(`
      UPDATE scheduled_posts
      SET status = ?, platform_post_id = COALESCE(?, platform_post_id), published_url = COALESCE(?, published_url), last_error = COALESCE(?, last_error), updated_at = ?
      WHERE id = ?
    `);
    stmt.run(status, details?.platformPostId || null, details?.publishedUrl || null, details?.lastError || null, now, id);
  },

  updateScheduledPost(id: string, updates: { scheduled_at?: string; timezone?: string; status?: string }) {
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const values: any[] = [now];
    if (updates.scheduled_at) {
      sets.push('scheduled_at = ?');
      values.push(updates.scheduled_at);
    }
    if (updates.timezone) {
      sets.push('timezone = ?');
      values.push(updates.timezone);
    }
    if (updates.status) {
      sets.push('status = ?');
      values.push(updates.status);
    }
    values.push(id);
    const sql = `UPDATE scheduled_posts SET ${sets.join(', ')} WHERE id = ?`;
    rawDb.prepare(sql).run(...values);
  },

  incrementScheduledPostRetry(id: string, error: string) {
    const now = new Date().toISOString();
    const stmt = rawDb.prepare(`
      UPDATE scheduled_posts
      SET retry_count = retry_count + 1, last_error = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(error, now, id);
  },

  logPublishingAttempt(data: {
    id: string;
    scheduledPostId: string;
    attemptNumber: number;
    responsePayload?: string;
    errorMessage?: string;
  }) {
    const now = new Date().toISOString();
    const stmt = rawDb.prepare(`
      INSERT INTO publishing_attempts (id, scheduled_post_id, attempt_number, response_payload, error_message, attempted_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(data.id, data.scheduledPostId, data.attemptNumber, data.responsePayload || null, data.errorMessage || null, now);
  },

  getPublishingHistory(scheduledPostId?: string) {
    if (scheduledPostId) {
      const stmt = rawDb.prepare(`SELECT * FROM publishing_attempts WHERE scheduled_post_id = ? ORDER BY attempted_at DESC`);
      return stmt.all(scheduledPostId);
    }
    const stmt = rawDb.prepare(`SELECT * FROM publishing_attempts ORDER BY attempted_at DESC LIMIT 50`);
    return stmt.all();
  },

  // =========================================================================
  // GLOBAL SERVER-SIDE PAGINATION & MEDIA LIBRARY ARCHITECTURE
  // =========================================================================

  getPaginatedProjects(options: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    sort?: string;
  }) {
    const page = Math.max(1, Number(options.page) || 1);
    const pageSize = Math.max(1, Math.min(96, Number(options.pageSize) || 24));
    const offset = (page - 1) * pageSize;

    const whereClauses: string[] = ['(is_deleted = 0 OR is_deleted IS NULL)'];
    const params: any[] = [];

    if (options.status && options.status !== 'all') {
      if (options.status === 'ready' || options.status === 'completed') {
        whereClauses.push("(status = 'ready' OR status = 'completed')");
      } else if (options.status === 'in_progress') {
        whereClauses.push("(status = 'in_progress' OR status = 'analyzing' OR status = 'editing')");
      } else {
        whereClauses.push('status = ?');
        params.push(options.status);
      }
    }

    if (options.search && options.search.trim()) {
      whereClauses.push('(title LIKE ? OR id LIKE ? OR source_url LIKE ?)');
      const term = `%${options.search.trim()}%`;
      params.push(term, term, term);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    let orderSql = 'ORDER BY created_at DESC';
    if (options.sort === 'oldest') orderSql = 'ORDER BY created_at ASC';
    else if (options.sort === 'title') orderSql = 'ORDER BY title ASC';

    const countRow = rawDb.prepare(`SELECT COUNT(*) as total FROM projects ${whereSql}`).get(...params) as any;
    const total = Number(countRow?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const items = rawDb.prepare(`SELECT * FROM projects ${whereSql} ${orderSql} LIMIT ? OFFSET ?`).all(...params, pageSize, offset);

    const enrichedItems = items.map((p: any) => {
      let sourceVideo: any = null;
      let highlightsCount = 0;
      let extractedClipsCount = 0;
      let editedClipsCount = 0;
      try {
        sourceVideo = rawDb.prepare(`SELECT * FROM source_videos WHERE project_id = ?`).get(p.id) as any;
        highlightsCount = (rawDb.prepare(`SELECT COUNT(*) as c FROM detected_highlights WHERE project_id = ?`).get(p.id) as any)?.c || 0;
        extractedClipsCount = (rawDb.prepare(`SELECT COUNT(*) as c FROM generated_clips WHERE project_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)`).get(p.id) as any)?.c || 0;
        editedClipsCount = (rawDb.prepare(`SELECT COUNT(*) as c FROM generated_clips WHERE project_id = ? AND status = 'rendered' AND (is_deleted = 0 OR is_deleted IS NULL)`).get(p.id) as any)?.c || 0;
      } catch {}

      return {
        ...p,
        sourceVideo,
        highlightsCount,
        extractedClipsCount,
        editedClipsCount,
      };
    });

    return {
      items: enrichedItems,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        start: total === 0 ? 0 : offset + 1,
        end: Math.min(offset + pageSize, total),
      },
    };
  },

  getPaginatedClips(options: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    category?: string;
    projectId?: string;
    sort?: string;
  }) {
    const page = Math.max(1, Number(options.page) || 1);
    const pageSize = Math.max(1, Math.min(96, Number(options.pageSize) || 24));
    const offset = (page - 1) * pageSize;

    const whereClauses: string[] = ['(gc.is_deleted = 0 OR gc.is_deleted IS NULL)'];
    const params: any[] = [];

    if (options.projectId) {
      whereClauses.push('gc.project_id = ?');
      params.push(options.projectId);
    }

    if (options.status && options.status !== 'all') {
      whereClauses.push('gc.status = ?');
      params.push(options.status);
    }

    if (options.search && options.search.trim()) {
      whereClauses.push('(gc.title LIKE ? OR gc.id LIKE ? OR p.title LIKE ?)');
      const term = `%${options.search.trim()}%`;
      params.push(term, term, term);
    }

    if (options.category && options.category !== 'all') {
      whereClauses.push('dh.category = ?');
      params.push(options.category);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    let orderSql = 'ORDER BY gc.created_at DESC';
    if (options.sort === 'oldest') orderSql = 'ORDER BY gc.created_at ASC';
    else if (options.sort === 'duration_desc') orderSql = 'ORDER BY gc.duration DESC';
    else if (options.sort === 'duration_asc') orderSql = 'ORDER BY gc.duration ASC';
    else if (options.sort === 'score_desc') orderSql = 'ORDER BY COALESCE(dh.entertainment_score, gc.qa_score, 0) DESC';

    const countRow = rawDb.prepare(`
      SELECT COUNT(*) as total 
      FROM generated_clips gc
      LEFT JOIN projects p ON gc.project_id = p.id
      LEFT JOIN detected_highlights dh ON gc.highlight_id = dh.id
      ${whereSql}
    `).get(...params) as any;

    const total = Number(countRow?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const items = rawDb.prepare(`
      SELECT gc.*, 
             p.title as projectTitle, p.source_url as sourceUrl,
             dh.category as highlightCategory, dh.category_label as categoryLabel,
             dh.entertainment_score as entertainmentScore,
             dh.start_time as startTime, dh.end_time as endTime,
             dh.hook_reason as hookReason, dh.peak_event as peakEvent
      FROM generated_clips gc
      LEFT JOIN projects p ON gc.project_id = p.id
      LEFT JOIN detected_highlights dh ON gc.highlight_id = dh.id
      ${whereSql}
      ${orderSql}
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        start: total === 0 ? 0 : offset + 1,
        end: Math.min(offset + pageSize, total),
      },
    };
  },

  getMediaLibraryCounts() {
    const sourceCount = (rawDb.prepare(`SELECT COUNT(*) as c FROM source_videos WHERE is_deleted = 0 OR is_deleted IS NULL`).get() as any)?.c || 0;
    const clipCount = (rawDb.prepare(`SELECT COUNT(*) as c FROM generated_clips WHERE (is_deleted = 0 OR is_deleted IS NULL) AND status = 'extracted'`).get() as any)?.c || 0;
    const editedCount = (rawDb.prepare(`SELECT COUNT(*) as c FROM generated_clips WHERE (is_deleted = 0 OR is_deleted IS NULL) AND status IN ('rendered', 'ready', 'completed')`).get() as any)?.c || 0;
    const publishedCount = (rawDb.prepare(`SELECT COUNT(*) as c FROM scheduled_posts WHERE (is_deleted = 0 OR is_deleted IS NULL) AND status = 'PUBLISHED'`).get() as any)?.c || 0;
    const scheduledCount = (rawDb.prepare(`SELECT COUNT(*) as c FROM scheduled_posts WHERE (is_deleted = 0 OR is_deleted IS NULL) AND status IN ('SCHEDULED', 'PROCESSING')`).get() as any)?.c || 0;
    const totalClips = (rawDb.prepare(`SELECT COUNT(*) as c FROM generated_clips WHERE is_deleted = 0 OR is_deleted IS NULL`).get() as any)?.c || 0;
    const totalAll = sourceCount + totalClips + publishedCount + scheduledCount;

    return {
      totalAll,
      sourceVideos: sourceCount,
      extractedClips: clipCount,
      editedVideos: editedCount,
      publishedVideos: publishedCount,
      scheduledVideos: scheduledCount,
      totalClips,
    };
  },

  getPaginatedMediaLibrary(options: {
    page?: number;
    pageSize?: number;
    type?: string; // 'all' | 'source' | 'extracted' | 'rendered' | 'published' | 'scheduled'
    search?: string;
    status?: string;
    category?: string;
    platform?: string;
    duration?: string; // '<15' | '15-30' | '30-60' | '>60'
    date?: string; // 'YYYY-MM-DD' for calendar click
    sort?: string;
  }) {
    const page = Math.max(1, Number(options.page) || 1);
    const pageSize = Math.max(1, Math.min(96, Number(options.pageSize) || 24));
    const offset = (page - 1) * pageSize;
    const typeFilter = options.type || 'all';

    // Build unified virtual table for all media assets
    // Types: 'source', 'extracted', 'rendered', 'published', 'scheduled'
    const parts: string[] = [];

    // 1. Source Videos
    if (typeFilter === 'all' || typeFilter === 'source') {
      parts.push(`
        SELECT 
          sv.id as id,
          'source' as media_type,
          sv.file_name as title,
          sv.duration as duration,
          'source_ready' as status,
          sv.created_at as created_at,
          sv.file_path as file_path,
          '/api/media/samples/' || sv.file_name as preview_url,
          (sv.width || 'x' || sv.height) as resolution,
          'Original Gameplay' as category,
          'stream' as platform,
          sv.project_id as project_id,
          p.title as project_title,
          NULL as scheduled_at,
          sv.file_size as file_size,
          NULL as qa_score
        FROM source_videos sv
        LEFT JOIN projects p ON sv.project_id = p.id
        WHERE (sv.is_deleted = 0 OR sv.is_deleted IS NULL)
      `);
    }

    // 2. Extracted Clips
    if (typeFilter === 'all' || typeFilter === 'extracted') {
      parts.push(`
        SELECT 
          gc.id as id,
          'extracted' as media_type,
          gc.title as title,
          gc.duration as duration,
          gc.status as status,
          gc.created_at as created_at,
          gc.output_path as file_path,
          '/api/media/clips/' || gc.id || '_raw.mp4#t=0.5' as preview_url,
          gc.resolution as resolution,
          COALESCE(dh.category_label, 'Raw Clip') as category,
          'editor' as platform,
          gc.project_id as project_id,
          p.title as project_title,
          NULL as scheduled_at,
          NULL as file_size,
          gc.qa_score as qa_score
        FROM generated_clips gc
        LEFT JOIN projects p ON gc.project_id = p.id
        LEFT JOIN detected_highlights dh ON gc.highlight_id = dh.id
        WHERE (gc.is_deleted = 0 OR gc.is_deleted IS NULL)
          AND gc.status = 'extracted'
      `);
    }

    // 3. Rendered / Edited 9:16 Shorts
    if (typeFilter === 'all' || typeFilter === 'rendered') {
      parts.push(`
        SELECT 
          gc.id as id,
          'rendered' as media_type,
          gc.title as title,
          gc.duration as duration,
          gc.status as status,
          gc.created_at as created_at,
          gc.output_path as file_path,
          '/api/media/clips/' || gc.id || '_vertical_final.mp4#t=0.5' as preview_url,
          gc.resolution as resolution,
          COALESCE(dh.category_label, 'Edited Short') as category,
          'vertical_9_16' as platform,
          gc.project_id as project_id,
          p.title as project_title,
          NULL as scheduled_at,
          NULL as file_size,
          gc.qa_score as qa_score
        FROM generated_clips gc
        LEFT JOIN projects p ON gc.project_id = p.id
        LEFT JOIN detected_highlights dh ON gc.highlight_id = dh.id
        WHERE (gc.is_deleted = 0 OR gc.is_deleted IS NULL)
          AND gc.status IN ('rendered', 'ready', 'completed')
      `);
    }

    // 4. Published Videos
    if (typeFilter === 'all' || typeFilter === 'published') {
      parts.push(`
        SELECT 
          sp.id as id,
          'published' as media_type,
          COALESCE(ef.title, sp.platform || ' Short') as title,
          COALESCE(gc.duration, 30.0) as duration,
          sp.status as status,
          sp.created_at as created_at,
          COALESCE(ef.file_path, '') as file_path,
          COALESCE(sp.published_url, ef.download_url) as preview_url,
          '1080x1920' as resolution,
          'Social Publication' as category,
          sp.platform as platform,
          sp.project_id as project_id,
          p.title as project_title,
          sp.scheduled_at as scheduled_at,
          COALESCE(ef.file_size, 0) as file_size,
          NULL as qa_score
        FROM scheduled_posts sp
        LEFT JOIN export_files ef ON sp.export_file_id = ef.id
        LEFT JOIN export_jobs ej ON ef.export_job_id = ej.id
        LEFT JOIN generated_clips gc ON ej.clip_id = gc.id
        LEFT JOIN projects p ON sp.project_id = p.id
        WHERE (sp.is_deleted = 0 OR sp.is_deleted IS NULL)
          AND sp.status = 'PUBLISHED'
      `);
    }

    // 5. Scheduled Videos
    if (typeFilter === 'all' || typeFilter === 'scheduled') {
      parts.push(`
        SELECT 
          sp.id as id,
          'scheduled' as media_type,
          COALESCE(ef.title, sp.platform || ' Post') as title,
          COALESCE(gc.duration, 30.0) as duration,
          sp.status as status,
          sp.created_at as created_at,
          COALESCE(ef.file_path, '') as file_path,
          ef.download_url as preview_url,
          '1080x1920' as resolution,
          'Scheduled Short' as category,
          sp.platform as platform,
          sp.project_id as project_id,
          p.title as project_title,
          sp.scheduled_at as scheduled_at,
          COALESCE(ef.file_size, 0) as file_size,
          NULL as qa_score
        FROM scheduled_posts sp
        LEFT JOIN export_files ef ON sp.export_file_id = ef.id
        LEFT JOIN export_jobs ej ON ef.export_job_id = ej.id
        LEFT JOIN generated_clips gc ON ej.clip_id = gc.id
        LEFT JOIN projects p ON sp.project_id = p.id
        WHERE (sp.is_deleted = 0 OR sp.is_deleted IS NULL)
          AND sp.status IN ('SCHEDULED', 'PROCESSING', 'DRAFT')
      `);
    }

    const unionSql = parts.join(' UNION ALL ');

    // Filter outer union query
    const outerWhere: string[] = [];
    const params: any[] = [];

    if (options.search && options.search.trim()) {
      outerWhere.push('(title LIKE ? OR id LIKE ? OR project_title LIKE ?)');
      const term = `%${options.search.trim()}%`;
      params.push(term, term, term);
    }

    if (options.status && options.status !== 'all') {
      outerWhere.push('status = ?');
      params.push(options.status);
    }

    if (options.platform && options.platform !== 'all') {
      outerWhere.push('platform = ?');
      params.push(options.platform);
    }

    if (options.duration) {
      if (options.duration === '<15') outerWhere.push('duration < 15');
      else if (options.duration === '15-30') outerWhere.push('duration >= 15 AND duration <= 30');
      else if (options.duration === '30-60') outerWhere.push('duration > 30 AND duration <= 60');
      else if (options.duration === '>60') outerWhere.push('duration > 60');
    }

    if (options.date) {
      // Matches date for calendar click filter
      outerWhere.push('(substr(COALESCE(scheduled_at, created_at), 1, 10) = ?)');
      params.push(options.date);
    }

    const whereClause = outerWhere.length > 0 ? `WHERE ${outerWhere.join(' AND ')}` : '';

    let orderClause = 'ORDER BY created_at DESC';
    if (options.sort === 'oldest') orderClause = 'ORDER BY created_at ASC';
    else if (options.sort === 'duration_desc') orderClause = 'ORDER BY duration DESC';
    else if (options.sort === 'duration_asc') orderClause = 'ORDER BY duration ASC';
    else if (options.sort === 'title') orderClause = 'ORDER BY title ASC';
    else if (options.sort === 'score_desc') orderClause = 'ORDER BY COALESCE(qa_score, 0) DESC';

    const baseQuery = `FROM (${unionSql}) AS u ${whereClause}`;

    const countRow = rawDb.prepare(`SELECT COUNT(*) as total ${baseQuery}`).get(...params) as any;
    const total = Number(countRow?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const items = rawDb.prepare(`SELECT * ${baseQuery} ${orderClause} LIMIT ? OFFSET ?`).all(...params, pageSize, offset);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        start: total === 0 ? 0 : offset + 1,
        end: Math.min(offset + pageSize, total),
      },
      counts: this.getMediaLibraryCounts(),
    };
  },

  getCalendarScheduleEvents(yearMonth?: string) {
    // Returns scheduled and published posts formatted for the interactive calendar
    let sql = `
      SELECT 
        sp.id,
        sp.platform,
        sp.status,
        sp.scheduled_at,
        ef.title,
        ef.download_url as preview_url,
        sp.published_url,
        ca.account_name
      FROM scheduled_posts sp
      LEFT JOIN export_files ef ON sp.export_file_id = ef.id
      LEFT JOIN connected_social_accounts ca ON sp.connected_account_id = ca.id
      WHERE (sp.is_deleted = 0 OR sp.is_deleted IS NULL)
    `;

    const params: any[] = [];
    if (yearMonth) {
      sql += ` AND substr(sp.scheduled_at, 1, 7) = ?`;
      params.push(yearMonth);
    }

    sql += ` ORDER BY sp.scheduled_at ASC`;

    const rows = rawDb.prepare(sql).all(...params) as any[];

    // Group by date (YYYY-MM-DD)
    const eventsByDate: Record<string, any[]> = {};
    for (const r of rows) {
      const dateKey = r.scheduled_at ? r.scheduled_at.substring(0, 10) : '';
      if (dateKey) {
        if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
        eventsByDate[dateKey].push(r);
      }
    }

    return eventsByDate;
  },

  deleteVideoItem(id: string, type?: string) {
    const now = new Date().toISOString();

    // Log deletion
    try {
      rawDb.prepare(`
        INSERT INTO media_deletion_logs (id, item_type, item_id, action, created_at)
        VALUES (?, ?, ?, 'delete', ?)
      `).run(`del_${Date.now()}`, type || 'unknown', id, now);
    } catch {}

    if (!type || type === 'rendered' || type === 'extracted' || type === 'clip') {
      try {
        rawDb.prepare(`UPDATE generated_clips SET is_deleted = 1, deleted_at = ? WHERE id = ?`).run(now, id);
      } catch {}
    }

    if (!type || type === 'source') {
      try {
        rawDb.prepare(`UPDATE source_videos SET is_deleted = 1, deleted_at = ? WHERE id = ?`).run(now, id);
      } catch {}
    }

    if (!type || type === 'published' || type === 'scheduled') {
      try {
        rawDb.prepare(`UPDATE scheduled_posts SET is_deleted = 1, deleted_at = ? WHERE id = ?`).run(now, id);
      } catch {}
    }

    if (!type || type === 'export') {
      try {
        rawDb.prepare(`UPDATE export_files SET is_deleted = 1, deleted_at = ? WHERE id = ?`).run(now, id);
      } catch {}
    }

    if (!type || type === 'project') {
      try {
        rawDb.prepare(`UPDATE projects SET is_deleted = 1, deleted_at = ? WHERE id = ?`).run(now, id);
      } catch {}
    }

    return { success: true, id };
  },

  // --- CONTENT RIGHTS & CREATOR PERMISSIONS ---
  listCreators(): any[] {
    try {
      return rawDb.prepare(`SELECT * FROM creators ORDER BY created_at DESC`).all();
    } catch {
      return [];
    }
  },

  getCreatorById(id: string): any {
    try {
      return rawDb.prepare(`SELECT * FROM creators WHERE id = ?`).get(id);
    } catch {
      return null;
    }
  },

  getCreatorByChannelId(channelId: string): any {
    try {
      return rawDb.prepare(`SELECT * FROM creators WHERE channel_id = ?`).get(channelId);
    } catch {
      return null;
    }
  },

  saveCreator(data: {
    id: string;
    name: string;
    channelId?: string;
    channelUrl?: string;
    contactEmail?: string;
    status?: string;
    notes?: string;
  }) {
    const now = new Date().toISOString();
    return rawDb.prepare(`
      INSERT INTO creators (id, name, channel_id, channel_url, contact_email, status, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        channel_id = excluded.channel_id,
        channel_url = excluded.channel_url,
        contact_email = excluded.contact_email,
        status = excluded.status,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `).run(
      data.id,
      data.name,
      data.channelId || null,
      data.channelUrl || null,
      data.contactEmail || null,
      data.status || 'verified',
      data.notes || null,
      now,
      now
    );
  },

  listCreatorPermissions(filters?: { status?: string; creatorId?: string }): any[] {
    try {
      let sql = `
        SELECT cp.*, c.name as creator_name, c.channel_url, c.contact_email
        FROM creator_permissions cp
        LEFT JOIN creators c ON cp.creator_id = c.id
        WHERE 1=1
      `;
      const params: any[] = [];
      if (filters?.status && filters.status !== 'all') {
        sql += ` AND cp.status = ?`;
        params.push(filters.status);
      }
      if (filters?.creatorId) {
        sql += ` AND cp.creator_id = ?`;
        params.push(filters.creatorId);
      }
      sql += ` ORDER BY cp.created_at DESC`;
      return rawDb.prepare(sql).all(...params);
    } catch {
      return [];
    }
  },

  getPermissionByChannel(channelId: string): any {
    try {
      return rawDb.prepare(`
        SELECT cp.*, c.name as creator_name, c.channel_url
        FROM creator_permissions cp
        LEFT JOIN creators c ON cp.creator_id = c.id
        WHERE cp.channel_id = ? OR c.channel_id = ?
        ORDER BY cp.created_at DESC LIMIT 1
      `).get(channelId, channelId);
    } catch {
      return null;
    }
  },

  saveCreatorPermission(data: {
    id: string;
    creatorId: string;
    channelId?: string;
    status: string; // VERIFIED, CREATIVE_COMMONS, PENDING, REJECTED, EXPIRED, UNKNOWN
    startDate?: string;
    expiryDate?: string;
    allowedUsage?: string;
    commercialUsageAllowed?: boolean;
    editingAllowed?: boolean;
    republishingAllowed?: boolean;
    mediaAccessMethod?: string;
    notes?: string;
    verifiedBy?: string;
  }) {
    const now = new Date().toISOString();
    return rawDb.prepare(`
      INSERT INTO creator_permissions (
        id, creator_id, channel_id, status, start_date, expiry_date,
        allowed_usage, commercial_usage_allowed, editing_allowed, republishing_allowed,
        media_access_method, notes, verified_by, verified_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        channel_id = excluded.channel_id,
        start_date = excluded.start_date,
        expiry_date = excluded.expiry_date,
        allowed_usage = excluded.allowed_usage,
        commercial_usage_allowed = excluded.commercial_usage_allowed,
        editing_allowed = excluded.editing_allowed,
        republishing_allowed = excluded.republishing_allowed,
        media_access_method = excluded.media_access_method,
        notes = excluded.notes,
        verified_by = excluded.verified_by,
        verified_at = excluded.verified_at,
        updated_at = excluded.updated_at
    `).run(
      data.id,
      data.creatorId,
      data.channelId || null,
      data.status,
      data.startDate || now,
      data.expiryDate || null,
      data.allowedUsage || 'all',
      data.commercialUsageAllowed ? 1 : 0,
      data.editingAllowed ?? true ? 1 : 0,
      data.republishingAllowed ?? true ? 1 : 0,
      data.mediaAccessMethod || 'authorized_upload',
      data.notes || null,
      data.verifiedBy || 'admin',
      now,
      now,
      now
    );
  },

  saveContentLicense(data: {
    id: string;
    videoId: string;
    channelId?: string;
    licenseType: string;
    licenseUrl?: string;
    sourceUrl?: string;
  }) {
    const now = new Date().toISOString();
    try {
      return rawDb.prepare(`
        INSERT OR REPLACE INTO content_licenses (id, video_id, channel_id, license_type, license_url, source_url, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.id,
        data.videoId,
        data.channelId || null,
        data.licenseType,
        data.licenseUrl || null,
        data.sourceUrl || null,
        now,
        now
      );
    } catch (e) {
      console.warn('saveContentLicense note:', e);
    }
  },

  savePermissionEvidence(data: {
    id: string;
    permissionId: string;
    creatorId: string;
    documentType: string;
    documentUrl?: string;
    filePath?: string;
    notes?: string;
    uploadedBy?: string;
  }) {
    const now = new Date().toISOString();
    try {
      return rawDb.prepare(`
        INSERT INTO permission_evidence (id, permission_id, creator_id, document_type, document_url, file_path, notes, uploaded_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.id,
        data.permissionId,
        data.creatorId,
        data.documentType,
        data.documentUrl || null,
        data.filePath || null,
        data.notes || null,
        data.uploadedBy || 'admin',
        now
      );
    } catch (e) {
      console.warn('savePermissionEvidence note:', e);
    }
  },

  saveSourceRightsCheck(data: {
    id: string;
    projectId?: string;
    videoId: string;
    channelId?: string;
    creatorId?: string;
    status: string;
    isAllowed: boolean;
    reason: string;
    licenseType: string;
  }) {
    const now = new Date().toISOString();
    try {
      return rawDb.prepare(`
        INSERT INTO source_rights_checks (id, project_id, video_id, channel_id, creator_id, status, is_allowed, reason, license_type, checked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.id,
        data.projectId || null,
        data.videoId,
        data.channelId || null,
        data.creatorId || null,
        data.status,
        data.isAllowed ? 1 : 0,
        data.reason,
        data.licenseType,
        now
      );
    } catch (e) {
      console.warn('saveSourceRightsCheck note:', e);
    }
  },

  listSourceRightsChecks(limit = 50): any[] {
    try {
      return rawDb.prepare(`SELECT * FROM source_rights_checks ORDER BY checked_at DESC LIMIT ?`).all(limit);
    } catch {
      return [];
    }
  },

  saveAttributionRecord(data: {
    id: string;
    projectId?: string;
    videoId: string;
    title: string;
    creatorName: string;
    sourceUrl: string;
    licenseType: string;
    attributionText: string;
  }) {
    const now = new Date().toISOString();
    try {
      return rawDb.prepare(`
        INSERT INTO attribution_records (id, project_id, video_id, title, creator_name, source_url, license_type, attribution_text, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.id,
        data.projectId || null,
        data.videoId,
        data.title,
        data.creatorName,
        data.sourceUrl,
        data.licenseType,
        data.attributionText,
        now
      );
    } catch (e) {
      console.warn('saveAttributionRecord note:', e);
    }
  },

  listAttributionRecords(limit = 50): any[] {
    try {
      return rawDb.prepare(`SELECT * FROM attribution_records ORDER BY created_at DESC LIMIT ?`).all(limit);
    } catch {
      return [];
    }
  },
};
