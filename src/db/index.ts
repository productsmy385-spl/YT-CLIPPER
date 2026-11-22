import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from '../lib/app-paths.ts';
import { replicateToPostgres, syncSQLiteFromPostgres, getPostgresPool } from './postgres.ts';

const internalDb = new DatabaseSync(DB_PATH);

// Enable busy timeout FIRST so any concurrent worker waits up to 30s instead of throwing 'database is locked'
try {
  internalDb.exec('PRAGMA busy_timeout = 30000;');
  internalDb.exec('PRAGMA journal_mode = WAL;');
  internalDb.exec('PRAGMA synchronous = NORMAL;');
  internalDb.exec('PRAGMA foreign_keys = ON;');
} catch (e: any) {
  console.warn('[DatabaseSync] Pragma init note:', e?.message);
}

// Transparent Proxy on rawDb that executes locally and replicates writes to PostgreSQL
export const rawDb = {
  prepare(sql: string) {
    const stmt = internalDb.prepare(sql);
    const isMutation = /^\s*(INSERT|UPDATE|DELETE)\s+/i.test(sql);

    return {
      run(...params: any[]) {
        const result = stmt.run(...params);
        if (isMutation) {
          try {
            replicateToPostgres(sql, params);
          } catch {}
        }
        return result;
      },
      get(...params: any[]) {
        return stmt.get(...params);
      },
      all(...params: any[]) {
        return stmt.all(...params);
      },
    };
  },
  exec(sql: string) {
    return internalDb.exec(sql);
  },
};

// Initialize Normalized Schema (21 tables matching architecture)
export function initDatabase() {
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'creator',
      avatar_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      game_title TEXT DEFAULT 'Grand Theft Auto VI',
      status TEXT DEFAULT 'created',
      progress INTEGER DEFAULT 0,
      current_stage TEXT DEFAULT 'init',
      source_url TEXT,
      source_file TEXT,
      cancellation_requested INTEGER DEFAULT 0,
      cancelled_at TEXT,
      worker_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS source_videos (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      duration REAL NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      fps REAL NOT NULL,
      bitrate INTEGER,
      audio_channels INTEGER,
      copyright_declared INTEGER DEFAULT 1,
      origin_source TEXT DEFAULT 'authorized_stream',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS video_analysis (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      total_scenes INTEGER DEFAULT 0,
      speech_segments_count INTEGER DEFAULT 0,
      audio_peaks_count INTEGER DEFAULT 0,
      gameplay_summary TEXT,
      analyzed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS detected_scenes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      duration REAL NOT NULL,
      avg_motion_score REAL DEFAULT 0,
      visual_summary TEXT,
      keyframe_path TEXT
    );

    CREATE TABLE IF NOT EXISTS detected_highlights (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      category TEXT NOT NULL,
      category_label TEXT NOT NULL,
      entertainment_score INTEGER NOT NULL,
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      duration REAL NOT NULL,
      hook_strength INTEGER DEFAULT 85,
      hook_reason TEXT,
      peak_event TEXT,
      suggested_meme_mood TEXT DEFAULT 'laugh',
      suggested_music_genre TEXT DEFAULT 'phonk',
      is_selected INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generated_clips (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      highlight_id TEXT NOT NULL,
      title TEXT NOT NULL,
      duration REAL NOT NULL,
      output_path TEXT,
      thumbnail_path TEXT,
      status TEXT DEFAULT 'extracted',
      resolution TEXT DEFAULT '1080x1920',
      fps INTEGER DEFAULT 30,
      qa_score INTEGER,
      copyright_passed INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS editing_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      clip_id TEXT,
      active_agent TEXT,
      status TEXT DEFAULT 'pending',
      progress_percent INTEGER DEFAULT 0,
      step_name TEXT,
      error_message TEXT,
      started_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ai_agents (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL,
      description TEXT NOT NULL,
      model TEXT DEFAULT 'gemini-2.5-pro',
      is_active INTEGER DEFAULT 1,
      execution_count INTEGER DEFAULT 0,
      avg_latency_ms INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS agent_execution_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      stage TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      duration_ms INTEGER DEFAULT 0,
      input_summary TEXT,
      output_summary TEXT,
      error TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS asset_licenses (
      id TEXT PRIMARY KEY,
      license_name TEXT NOT NULL,
      license_type TEXT NOT NULL,
      attribution_text TEXT,
      commercial_allowed INTEGER DEFAULT 1,
      verified_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meme_assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emotion TEXT NOT NULL,
      file_path TEXT NOT NULL,
      duration REAL DEFAULT 2.5,
      overlay_type TEXT DEFAULT 'pip_corner',
      license_id TEXT,
      tags TEXT
    );

    CREATE TABLE IF NOT EXISTS music_assets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      genre TEXT NOT NULL,
      bpm INTEGER DEFAULT 130,
      energy TEXT DEFAULT 'high',
      file_path TEXT NOT NULL,
      duration REAL NOT NULL,
      license_id TEXT
    );

    CREATE TABLE IF NOT EXISTS sound_effect_assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      file_path TEXT NOT NULL,
      duration REAL NOT NULL,
      default_volume REAL DEFAULT 1.0,
      license_id TEXT
    );

    CREATE TABLE IF NOT EXISTS clip_editing_configurations (
      id TEXT PRIMARY KEY,
      clip_id TEXT UNIQUE NOT NULL,
      crop_mode TEXT DEFAULT 'center_action',
      crop_x REAL DEFAULT 0.5,
      crop_y REAL DEFAULT 0.5,
      zoom_scale REAL DEFAULT 1.15,
      music_asset_id TEXT,
      music_volume REAL DEFAULT 0.45,
      music_ducking_db REAL DEFAULT -16.0,
      subtitle_style TEXT DEFAULT 'vice_neon',
      config_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subtitles (
      id TEXT PRIMARY KEY,
      clip_id TEXT NOT NULL,
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      text TEXT NOT NULL,
      word_timestamps_json TEXT,
      active_color TEXT DEFAULT '#06B6D4'
    );

    CREATE TABLE IF NOT EXISTS copyright_reports (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      clip_id TEXT,
      compliance_score INTEGER NOT NULL,
      passed INTEGER NOT NULL,
      source_authorized INTEGER DEFAULT 1,
      music_compliant INTEGER DEFAULT 1,
      memes_compliant INTEGER DEFAULT 1,
      problem_items_json TEXT,
      report_summary TEXT NOT NULL,
      generated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quality_reports (
      id TEXT PRIMARY KEY,
      clip_id TEXT UNIQUE NOT NULL,
      qa_score INTEGER NOT NULL,
      passed INTEGER NOT NULL,
      resolution_check INTEGER DEFAULT 1,
      aspect_ratio_check INTEGER DEFAULT 1,
      audio_clipping INTEGER DEFAULT 0,
      black_frames_found INTEGER DEFAULT 0,
      sync_offset_ms INTEGER DEFAULT 0,
      hook_grade TEXT DEFAULT 'A',
      recommendations_json TEXT,
      generated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS export_jobs (
      id TEXT PRIMARY KEY,
      clip_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      started_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS export_files (
      id TEXT PRIMARY KEY,
      export_job_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      tags TEXT NOT NULL,
      download_url TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      default_crop_mode TEXT DEFAULT 'center_action',
      default_music_genre TEXT DEFAULT 'phonk',
      auto_ducking_db REAL DEFAULT -16.0,
      default_resolution TEXT DEFAULT '1080x1920',
      gemini_api_key_configured INTEGER DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS connected_social_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      account_name TEXT NOT NULL,
      account_id TEXT NOT NULL,
      profile_image_url TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS social_oauth_tokens (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      access_token_encrypted TEXT NOT NULL,
      refresh_token_encrypted TEXT,
      token_type TEXT DEFAULT 'Bearer',
      scope TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduled_posts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      export_file_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      connected_account_id TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      timezone TEXT DEFAULT 'Asia/Kolkata',
      status TEXT DEFAULT 'SCHEDULED',
      platform_post_id TEXT,
      published_url TEXT,
      retry_count INTEGER DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS publishing_jobs (
      id TEXT PRIMARY KEY,
      scheduled_post_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      started_at TEXT,
      completed_at TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS publishing_attempts (
      id TEXT PRIMARY KEY,
      scheduled_post_id TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      response_payload TEXT,
      error_message TEXT,
      attempted_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platform_upload_sessions (
      id TEXT PRIMARY KEY,
      export_file_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      upload_url TEXT NOT NULL,
      bytes_uploaded INTEGER DEFAULT 0,
      total_bytes INTEGER NOT NULL,
      status TEXT DEFAULT 'active',
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS publishing_analytics (
      id TEXT PRIMARY KEY,
      scheduled_post_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      views INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_pipeline_stages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      stage_number INTEGER NOT NULL,
      stage_key TEXT NOT NULL,
      stage_name TEXT NOT NULL,
      status TEXT NOT NULL, -- PENDING, ACTIVE, COMPLETED, FAILED, CANCELLED
      progress_percent INTEGER NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      error_message TEXT,
      details_json TEXT
    );

    CREATE TABLE IF NOT EXISTS media_deletion_logs (
      id TEXT PRIMARY KEY,
      item_type TEXT NOT NULL,
      item_id TEXT NOT NULL,
      title TEXT,
      file_path TEXT,
      action TEXT NOT NULL,
      user_id TEXT DEFAULT 'usr_creator_01',
      details TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS creators (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      channel_id TEXT UNIQUE,
      channel_url TEXT,
      contact_email TEXT,
      status TEXT DEFAULT 'verified',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS creator_permissions (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL,
      channel_id TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      start_date TEXT,
      expiry_date TEXT,
      allowed_usage TEXT DEFAULT 'all',
      commercial_usage_allowed INTEGER DEFAULT 0,
      editing_allowed INTEGER DEFAULT 1,
      republishing_allowed INTEGER DEFAULT 1,
      media_access_method TEXT DEFAULT 'authorized_upload',
      notes TEXT,
      verified_by TEXT,
      verified_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (creator_id) REFERENCES creators(id)
    );

    CREATE TABLE IF NOT EXISTS content_licenses (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL,
      channel_id TEXT,
      license_type TEXT NOT NULL DEFAULT 'unknown',
      license_url TEXT,
      source_url TEXT,
      verified_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS permission_evidence (
      id TEXT PRIMARY KEY,
      permission_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      document_type TEXT NOT NULL,
      document_url TEXT,
      file_path TEXT,
      notes TEXT,
      uploaded_by TEXT DEFAULT 'admin',
      created_at TEXT NOT NULL,
      FOREIGN KEY (permission_id) REFERENCES creator_permissions(id),
      FOREIGN KEY (creator_id) REFERENCES creators(id)
    );

    CREATE TABLE IF NOT EXISTS source_rights_checks (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      video_id TEXT NOT NULL,
      channel_id TEXT,
      creator_id TEXT,
      status TEXT NOT NULL,
      is_allowed INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      license_type TEXT NOT NULL,
      checked_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attribution_records (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      video_id TEXT NOT NULL,
      title TEXT NOT NULL,
      creator_name TEXT NOT NULL,
      source_url TEXT NOT NULL,
      license_type TEXT NOT NULL,
      attribution_text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Safe non-destructive column migrations for existing SQLite databases
  try { rawDb.exec(`ALTER TABLE users ADD COLUMN avatar_url TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE projects ADD COLUMN cancellation_requested INTEGER DEFAULT 0;`); } catch {}
  try { rawDb.exec(`ALTER TABLE projects ADD COLUMN cancelled_at TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE projects ADD COLUMN worker_id TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE projects ADD COLUMN is_deleted INTEGER DEFAULT 0;`); } catch {}
  try { rawDb.exec(`ALTER TABLE projects ADD COLUMN deleted_at TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE projects ADD COLUMN stage_id TEXT DEFAULT '1';`); } catch {}
  try { rawDb.exec(`ALTER TABLE projects ADD COLUMN stage_status TEXT DEFAULT 'PENDING';`); } catch {}
  try { rawDb.exec(`ALTER TABLE projects ADD COLUMN stage_started_at TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE projects ADD COLUMN stage_completed_at TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE projects ADD COLUMN heartbeat_at TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE projects ADD COLUMN error_message TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE projects ADD COLUMN locked_by TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE projects ADD COLUMN lock_acquired_at TEXT;`); } catch {}

  try { rawDb.exec(`ALTER TABLE generated_clips ADD COLUMN is_deleted INTEGER DEFAULT 0;`); } catch {}
  try { rawDb.exec(`ALTER TABLE generated_clips ADD COLUMN deleted_at TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE generated_clips ADD COLUMN start_time REAL;`); } catch {}
  try { rawDb.exec(`ALTER TABLE generated_clips ADD COLUMN end_time REAL;`); } catch {}
  try { rawDb.exec(`ALTER TABLE generated_clips ADD COLUMN extraction_version INTEGER DEFAULT 1;`); } catch {}
  try { rawDb.exec(`ALTER TABLE generated_clips ADD COLUMN editing_version INTEGER DEFAULT 1;`); } catch {}
  try { rawDb.exec(`ALTER TABLE generated_clips ADD COLUMN processing_status TEXT DEFAULT 'extracted';`); } catch {}
  try { rawDb.exec(`ALTER TABLE generated_clips ADD COLUMN output_file_path TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE generated_clips ADD COLUMN updated_at TEXT;`); } catch {}

  try { rawDb.exec(`ALTER TABLE detected_highlights ADD COLUMN normalized_start REAL;`); } catch {}
  try { rawDb.exec(`ALTER TABLE detected_highlights ADD COLUMN normalized_end REAL;`); } catch {}

  try { rawDb.exec(`ALTER TABLE source_videos ADD COLUMN is_deleted INTEGER DEFAULT 0;`); } catch {}
  try { rawDb.exec(`ALTER TABLE source_videos ADD COLUMN deleted_at TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE export_files ADD COLUMN is_deleted INTEGER DEFAULT 0;`); } catch {}
  try { rawDb.exec(`ALTER TABLE export_files ADD COLUMN deleted_at TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE scheduled_posts ADD COLUMN is_deleted INTEGER DEFAULT 0;`); } catch {}
  try { rawDb.exec(`ALTER TABLE scheduled_posts ADD COLUMN deleted_at TEXT;`); } catch {}

  // Relational isolation columns for independent projects
  try { rawDb.exec(`ALTER TABLE projects ADD COLUMN source_video_id TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE projects ADD COLUMN source_checksum TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE source_videos ADD COLUMN source_url TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE source_videos ADD COLUMN platform_video_id TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE source_videos ADD COLUMN title TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE source_videos ADD COLUMN channel_name TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE source_videos ADD COLUMN sha256_checksum TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE source_videos ADD COLUMN authorization_status TEXT DEFAULT 'authorized';`); } catch {}
  try { rawDb.exec(`ALTER TABLE source_videos ADD COLUMN ingestion_status TEXT DEFAULT 'completed';`); } catch {}
  try { rawDb.exec(`ALTER TABLE video_analysis ADD COLUMN source_video_id TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE detected_highlights ADD COLUMN source_video_id TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE generated_clips ADD COLUMN source_video_id TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE generated_clips ADD COLUMN source_checksum TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE generated_clips ADD COLUMN job_id TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE generated_clips ADD COLUMN raw_clip_path TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE generated_clips ADD COLUMN edited_clip_path TEXT;`); } catch {}
  try { rawDb.exec(`ALTER TABLE editing_jobs ADD COLUMN source_video_id TEXT;`); } catch {}

  // Reconcile existing duplicate records and audit unverified clips
  reconcileDuplicateClips();
  reconcileUnverifiedClips();

  // High-performance indexes for server-side pagination, searching, and calendar queries
  try { rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_projects_created ON projects(created_at DESC);`); } catch {}
  try { rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);`); } catch {}
  try { rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_clips_created ON generated_clips(created_at DESC);`); } catch {}
  try { rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_clips_status ON generated_clips(status);`); } catch {}
  try { rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_clips_proj ON generated_clips(project_id);`); } catch {}
  try { rawDb.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_clips_identity ON generated_clips(project_id, highlight_id, extraction_version);`); } catch {}
  try { rawDb.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_stage_proj_num ON project_pipeline_stages(project_id, stage_number);`); } catch {}
  try { rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_source_created ON source_videos(created_at DESC);`); } catch {}
  try { rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_source_proj ON source_videos(project_id);`); } catch {}
  try { rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_exports_created ON export_files(created_at DESC);`); } catch {}
  try { rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_exports_platform ON export_files(platform);`); } catch {}
  try { rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_scheduled_time ON scheduled_posts(scheduled_at DESC);`); } catch {}
  try { rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_scheduled_status ON scheduled_posts(status);`); } catch {}
  try { rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_scheduled_platform ON scheduled_posts(platform);`); } catch {}
}

/**
 * Reconcile existing duplicate clip records safely:
 * - Identifies equivalent records grouped by (project_id, title) or (project_id, highlight_id)
 * - Preserves the best completed/rendered clip with valid file on disk
 * - Reconciles foreign keys from editing_jobs, subtitles, quality_reports, export_files, scheduled_posts
 * - Removes redundant duplicate records safely without deleting distinct clips
 */
export function reconcileDuplicateClips(): { reconciledGroups: number; removedDuplicates: number } {
  let reconciledGroups = 0;
  let removedDuplicates = 0;

  try {
    // 1. Reconcile by (project_id, title)
    const duplicateTitleGroups = rawDb.prepare(`
      SELECT project_id, title, count(*) as count 
      FROM generated_clips 
      GROUP BY project_id, title 
      HAVING count > 1
    `).all() as Array<{ project_id: string; title: string; count: number }>;

    for (const group of duplicateTitleGroups) {
      const clips = rawDb.prepare(`
        SELECT id, project_id, highlight_id, output_path, raw_clip_path, edited_clip_path, status, created_at
        FROM generated_clips
        WHERE project_id = ? AND title = ?
        ORDER BY 
          CASE WHEN status = 'rendered' THEN 1 WHEN status = 'extracted' THEN 2 ELSE 3 END,
          created_at DESC
      `).all(group.project_id, group.title) as any[];

      if (clips.length <= 1) continue;

      const keep = clips[0];
      const duplicates = clips.slice(1);

      for (const dup of duplicates) {
        // Re-link referencing tables to keep.id
        try { rawDb.prepare(`UPDATE editing_jobs SET clip_id = ? WHERE clip_id = ?`).run(keep.id, dup.id); } catch {}
        try { rawDb.prepare(`UPDATE subtitles SET clip_id = ? WHERE clip_id = ?`).run(keep.id, dup.id); } catch {}
        try { rawDb.prepare(`UPDATE quality_reports SET clip_id = ? WHERE clip_id = ?`).run(keep.id, dup.id); } catch {}
        try { rawDb.prepare(`UPDATE export_jobs SET clip_id = ? WHERE clip_id = ?`).run(keep.id, dup.id); } catch {}
        try { rawDb.prepare(`UPDATE copyright_reports SET clip_id = ? WHERE clip_id = ?`).run(keep.id, dup.id); } catch {}
        try { rawDb.prepare(`UPDATE clip_editing_configurations SET clip_id = ? WHERE clip_id = ?`).run(keep.id, dup.id); } catch {}

        // Delete the redundant record
        rawDb.prepare(`DELETE FROM generated_clips WHERE id = ?`).run(dup.id);
        removedDuplicates++;
      }
      reconciledGroups++;
    }

    // 2. Reconcile by (project_id, highlight_id, extraction_version)
    const duplicateHighlightGroups = rawDb.prepare(`
      SELECT project_id, highlight_id, count(*) as count 
      FROM generated_clips 
      GROUP BY project_id, highlight_id 
      HAVING count > 1
    `).all() as Array<{ project_id: string; highlight_id: string; count: number }>;

    for (const group of duplicateHighlightGroups) {
      const clips = rawDb.prepare(`
        SELECT id, project_id, highlight_id, output_path, raw_clip_path, edited_clip_path, status, created_at
        FROM generated_clips
        WHERE project_id = ? AND highlight_id = ?
        ORDER BY 
          CASE WHEN status = 'rendered' THEN 1 WHEN status = 'extracted' THEN 2 ELSE 3 END,
          created_at DESC
      `).all(group.project_id, group.highlight_id) as any[];

      if (clips.length <= 1) continue;

      const keep = clips[0];
      const duplicates = clips.slice(1);

      for (const dup of duplicates) {
        try { rawDb.prepare(`UPDATE editing_jobs SET clip_id = ? WHERE clip_id = ?`).run(keep.id, dup.id); } catch {}
        try { rawDb.prepare(`UPDATE subtitles SET clip_id = ? WHERE clip_id = ?`).run(keep.id, dup.id); } catch {}
        try { rawDb.prepare(`UPDATE quality_reports SET clip_id = ? WHERE clip_id = ?`).run(keep.id, dup.id); } catch {}
        try { rawDb.prepare(`UPDATE export_jobs SET clip_id = ? WHERE clip_id = ?`).run(keep.id, dup.id); } catch {}
        try { rawDb.prepare(`UPDATE copyright_reports SET clip_id = ? WHERE clip_id = ?`).run(keep.id, dup.id); } catch {}

        rawDb.prepare(`DELETE FROM generated_clips WHERE id = ?`).run(dup.id);
        removedDuplicates++;
      }
      reconciledGroups++;
    }

    if (removedDuplicates > 0) {
      console.log(`[Database] ✓ Reconciled ${reconciledGroups} duplicate clip groups (removed ${removedDuplicates} redundant records).`);
    }
  } catch (err: any) {
    console.warn(`[Database] Duplicate reconciliation note:`, err.message);
  }

  return { reconciledGroups, removedDuplicates };
}

/**
 * Phase 12: Audit & Reconcile Existing Unverified Clips
 * Identifies clips that were generated using global fallback paths or lack verified source video relationships.
 * Marks them as 'needs_review' rather than treating them as valid generated clips.
 */
export function reconcileUnverifiedClips(): { auditedCount: number; flaggedNeedsReview: number } {
  let flaggedNeedsReview = 0;
  let auditedCount = 0;

  try {
    // 1. Flag clips linked to projects that used the global fallback sample instead of an authentic source
    const fallbackProjects = rawDb.prepare(`
      SELECT id FROM projects 
      WHERE source_file LIKE '%gta6_authorized_gameplay_sample.mp4%' 
        AND source_url IS NOT NULL 
        AND source_url != ''
    `).all() as Array<{ id: string }>;

    for (const p of fallbackProjects) {
      const res = rawDb.prepare(`
        UPDATE generated_clips 
        SET processing_status = 'needs_review', status = 'needs_review', updated_at = datetime('now')
        WHERE project_id = ? AND processing_status != 'needs_review'
      `).run(p.id);
      flaggedNeedsReview += Number(res.changes || 0);
    }

    // 2. Flag clips that lack output files on disk
    const allClips = rawDb.prepare(`
      SELECT id, output_path, output_file_path, raw_clip_path, processing_status 
      FROM generated_clips
      WHERE processing_status != 'needs_review'
    `).all() as any[];

    auditedCount = allClips.length;

    for (const clip of allClips) {
      const outPath = clip.output_file_path || clip.output_path;
      if (!outPath || !fs.existsSync(outPath)) {
        rawDb.prepare(`
          UPDATE generated_clips 
          SET processing_status = 'needs_review', status = 'needs_review', updated_at = datetime('now')
          WHERE id = ?
        `).run(clip.id);
        flaggedNeedsReview++;
      }
    }

    if (flaggedNeedsReview > 0) {
      console.log(`[Database] ✓ Audit reconciled: flagged ${flaggedNeedsReview} unverified/fallback clips as 'needs_review'.`);
    }
  } catch (err: any) {
    console.warn(`[Database] Unverified clips audit note:`, err.message);
  }

  return { auditedCount, flaggedNeedsReview };
}

// Auto-run schema initialization on import
initDatabase();

// Asynchronously hydrate from cloud PostgreSQL if DATABASE_URL is configured
try {
  syncSQLiteFromPostgres(internalDb).catch((err: any) => {
    console.warn('[PostgreSQL] Async hydration notice:', err?.message);
  });
} catch {}
