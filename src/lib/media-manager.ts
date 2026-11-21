import fs from 'node:fs';
import path from 'node:path';
import { dbRepo } from '../db/repository.ts';
import { rawDb } from '../db/index.ts';
import { STORAGE_CLIPS_DIR, STORAGE_EXPORTS_DIR, STORAGE_DIR } from './app-paths.ts';

export type MediaTab = 'all' | 'sources' | 'extracted' | 'edited' | 'ready' | 'published' | 'trash';

export interface UnifiedMediaItem {
  id: string;
  type: 'source' | 'clip' | 'export' | 'published';
  title: string;
  duration: number;
  resolution: string;
  fileSize: number;
  filePath?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  status: string;
  publishingStatus?: string;
  platform?: string;
  platformPostId?: string;
  publishedUrl?: string;
  categoryLabel?: string;
  category?: string;
  projectId?: string;
  projectTitle?: string;
  sourceUrl?: string;
  dependentClipsCount?: number;
  scheduledPostId?: string;
  scheduledAt?: string;
  isDeleted: boolean;
  deletedAt?: string;
  createdAt: string;
}

export interface StorageBreakdown {
  totalBytes: number;
  totalGigabytes: number;
  sourcesBytes: number;
  clipsBytes: number;
  exportsBytes: number;
  trashBytes: number;
  totalFiles: number;
  trashCount: number;
}

export const mediaManager = {
  /**
   * List unified media items with tab filtering, search, sorting, and pagination
   */
  async listMedia(options: {
    tab?: MediaTab;
    search?: string;
    sort?: string;
    category?: string;
    platform?: string;
    minDuration?: number;
    maxDuration?: number;
  }) {
    const {
      tab = 'all',
      search = '',
      sort = 'newest',
      category,
      platform,
      minDuration,
      maxDuration,
    } = options;

    const includeDeleted = tab === 'trash';
    const allClips = dbRepo.getAllClips(true) as any[];
    const allSources = dbRepo.listSourceVideos(true) as any[];
    const allExports = dbRepo.getExportFiles(true) as any[];
    const allScheduled = dbRepo.getScheduledPosts() as any[];
    const allProjects = dbRepo.listProjects() as any[];

    const projectMap = new Map<string, any>();
    allProjects.forEach((p) => projectMap.set(p.id, p));

    const exportMap = new Map<string, any>();
    allExports.forEach((e) => exportMap.set(e.id, e));

    const scheduledByExport = new Map<string, any>();
    allScheduled.forEach((s) => scheduledByExport.set(s.export_file_id, s));

    const items: UnifiedMediaItem[] = [];

    // 1. Process Source Videos
    for (const s of allSources) {
      const isDel = s.is_deleted === 1;
      if (tab === 'trash' && !isDel) continue;
      if (tab !== 'trash' && isDel) continue;
      if (tab !== 'all' && tab !== 'sources' && tab !== 'trash') continue;

      const p = projectMap.get(s.project_id);
      const clipsCount = dbRepo.getSourceVideoClipsCount(s.project_id);
      const existsOnDisk = s.file_path && fs.existsSync(s.file_path);
      const fileName = s.file_path ? path.basename(s.file_path) : s.file_name;

      items.push({
        id: s.id,
        type: 'source',
        title: s.file_name || p?.title || 'Original Source Video',
        duration: s.duration || 0,
        resolution: `${s.width || 1920}x${s.height || 1080}`,
        fileSize: s.file_size || 0,
        filePath: s.file_path,
        previewUrl: existsOnDisk ? `/api/media/sources/${fileName}` : undefined,
        status: 'authorized',
        projectId: s.project_id,
        projectTitle: p?.title || 'GTA 6 Stream',
        sourceUrl: p?.source_url,
        dependentClipsCount: clipsCount,
        isDeleted: isDel,
        deletedAt: s.deleted_at,
        createdAt: s.created_at,
      });
    }

    // 2. Process Generated Clips (Extracted raw + Edited shorts)
    for (const c of allClips) {
      const isDel = c.is_deleted === 1;
      if (tab === 'trash' && !isDel) continue;
      if (tab !== 'trash' && isDel) continue;

      const isEdited = c.status === 'rendered' || (c.output_path && c.output_path.includes('vertical_final'));
      if (tab === 'sources') continue;
      if (tab === 'extracted' && isEdited) continue;
      if (tab === 'edited' && !isEdited) continue;

      const p = projectMap.get(c.project_id);
      const fileName = c.output_path ? path.basename(c.output_path) : `${c.id}_raw.mp4`;
      const fileExists = c.output_path && fs.existsSync(c.output_path);
      let size = 0;
      if (fileExists) {
        try {
          size = fs.statSync(c.output_path).size;
        } catch {}
      }

      items.push({
        id: c.id,
        type: 'clip',
        title: c.title,
        duration: c.duration,
        resolution: c.resolution || '1080x1920',
        fileSize: size,
        filePath: c.output_path,
        previewUrl: fileExists ? `/api/media/clips/${fileName}` : undefined,
        thumbnailUrl: c.thumbnail_path,
        status: c.status,
        projectId: c.project_id,
        projectTitle: p?.title || 'GTA 6 Gameplay',
        sourceUrl: p?.source_url,
        isDeleted: isDel,
        deletedAt: c.deleted_at,
        createdAt: c.created_at,
      });
    }

    // 3. Process Export Files & Published Items
    for (const exp of allExports) {
      const isDel = exp.is_deleted === 1;
      if (tab === 'trash' && !isDel) continue;
      if (tab !== 'trash' && isDel) continue;

      const sched = scheduledByExport.get(exp.id);
      const isPublished = sched?.status === 'PUBLISHED';

      if (tab === 'sources' || tab === 'extracted') continue;
      if (tab === 'ready' && isPublished) continue;
      if (tab === 'published' && !isPublished) continue;

      const fileExists = exp.file_path && fs.existsSync(exp.file_path);
      const fileName = exp.file_path ? path.basename(exp.file_path) : '';

      items.push({
        id: exp.id,
        type: isPublished ? 'published' : 'export',
        title: exp.title,
        duration: 30, // Default duration if not embedded
        resolution: '1080x1920',
        fileSize: exp.file_size || 0,
        filePath: exp.file_path,
        previewUrl: fileExists ? `/api/media/clips/${fileName}` : undefined,
        status: isPublished ? 'published' : 'ready_for_publishing',
        publishingStatus: sched?.status || 'READY',
        platform: exp.platform,
        platformPostId: sched?.platform_post_id,
        publishedUrl: sched?.published_url,
        scheduledPostId: sched?.id,
        scheduledAt: sched?.scheduled_at,
        isDeleted: isDel,
        deletedAt: exp.deleted_at,
        createdAt: exp.created_at,
      });
    }

    // Filtering
    let filtered = items;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.projectTitle?.toLowerCase().includes(q) ||
          m.platform?.toLowerCase().includes(q) ||
          m.status.toLowerCase().includes(q)
      );
    }

    if (platform && platform !== 'all') {
      filtered = filtered.filter((m) => m.platform === platform);
    }

    if (minDuration !== undefined) {
      filtered = filtered.filter((m) => m.duration >= minDuration);
    }
    if (maxDuration !== undefined) {
      filtered = filtered.filter((m) => m.duration <= maxDuration);
    }

    // Sorting
    filtered.sort((a, b) => {
      if (sort === 'oldest') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sort === 'title_asc') {
        return a.title.localeCompare(b.title);
      }
      if (sort === 'title_desc') {
        return b.title.localeCompare(a.title);
      }
      if (sort === 'duration_desc') {
        return b.duration - a.duration;
      }
      if (sort === 'duration_asc') {
        return a.duration - b.duration;
      }
      if (sort === 'size_desc') {
        return b.fileSize - a.fileSize;
      }
      // Default: newest
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Counts breakdown per tab
    const allCounts = {
      all: allClips.filter((c) => !c.is_deleted).length + allSources.filter((s) => !s.is_deleted).length,
      sources: allSources.filter((s) => !s.is_deleted).length,
      extracted: allClips.filter((c) => !c.is_deleted && c.status === 'extracted').length,
      edited: allClips.filter((c) => !c.is_deleted && c.status === 'rendered').length,
      ready: allExports.filter((e) => !e.is_deleted && scheduledByExport.get(e.id)?.status !== 'PUBLISHED').length,
      published: allScheduled.filter((s) => s.status === 'PUBLISHED').length,
      trash: allClips.filter((c) => c.is_deleted).length + allSources.filter((s) => s.is_deleted).length + allExports.filter((e) => e.is_deleted).length,
    };

    return {
      items: filtered,
      counts: allCounts,
      total: filtered.length,
    };
  },

  /**
   * Delete single clip (soft delete or permanent delete)
   */
  async deleteClip(clipId: string, options: { permanent?: boolean } = {}) {
    const { permanent = false } = options;
    const clip = dbRepo.getClipById(clipId) as any;
    if (!clip) {
      throw new Error(`Clip not found: ${clipId}`);
    }

    // Verify clip is not actively processing
    if (clip.status === 'processing') {
      throw new Error(`Cannot delete clip ${clipId} while processing is active. Please cancel processing first.`);
    }

    // Cancel pending scheduled publishing jobs if any
    const exports = dbRepo.getExportFiles(true) as any[];
    const matchingExports = exports.filter((e) => e.file_path && e.file_path.includes(clipId));
    for (const exp of matchingExports) {
      try {
        const sched = (dbRepo.getScheduledPosts() as any[]).find((s) => s.export_file_id === exp.id);
        if (sched && sched.status === 'SCHEDULED') {
          dbRepo.updateScheduledPostStatus(sched.id, 'CANCELLED', { lastError: 'Clip moved to trash' });
          console.log(`[MediaManager] Cancelled scheduled post ${sched.id} for deleted clip ${clipId}`);
        }
      } catch {}
    }

    if (!permanent) {
      // Soft Delete: Move to Trash
      dbRepo.softDeleteClip(clipId);
      dbRepo.logMediaDeletion({
        itemType: 'clip',
        itemId: clipId,
        title: clip.title,
        filePath: clip.output_path,
        action: 'soft_delete',
        details: 'Moved clip to Trash.',
      });
      console.log(`[MediaManager] ✓ Soft-deleted clip ${clipId} (moved to Trash)`);
      return { success: true, mode: 'trash', clipId };
    }

    // Permanent Delete: Remove files from disk + purge database records
    const filesToPurge: string[] = [];

    // 1. Output path (vertical final)
    if (clip.output_path && fs.existsSync(clip.output_path)) {
      filesToPurge.push(clip.output_path);
    }

    // 2. Raw clip path in storage/clips
    const rawClipPath = path.join(STORAGE_CLIPS_DIR, `${clipId}_raw.mp4`);
    if (fs.existsSync(rawClipPath)) {
      filesToPurge.push(rawClipPath);
    }

    // 3. Subtitles ASS file
    const subPath = path.join(STORAGE_CLIPS_DIR, `${clipId}_subtitles.ass`);
    if (fs.existsSync(subPath)) {
      filesToPurge.push(subPath);
    }

    // 4. Export files on disk
    for (const exp of matchingExports) {
      if (exp.file_path && fs.existsSync(exp.file_path)) {
        filesToPurge.push(exp.file_path);
      }
    }

    // 5. Thumbnail if exists
    if (clip.thumbnail_path && fs.existsSync(clip.thumbnail_path)) {
      filesToPurge.push(clip.thumbnail_path);
    }

    // Safely unlink all associated files
    let unlinkedCount = 0;
    for (const f of filesToPurge) {
      try {
        fs.unlinkSync(f);
        unlinkedCount++;
        console.log(`[MediaManager] Unlinked file: ${f}`);
      } catch (err: any) {
        console.warn(`[MediaManager] Warning: failed to unlink file ${f}:`, err.message);
      }
    }

    // Permanent purge from SQLite database
    dbRepo.permanentDeleteClip(clipId);

    dbRepo.logMediaDeletion({
      itemType: 'clip',
      itemId: clipId,
      title: clip.title,
      filePath: clip.output_path,
      action: 'permanent_delete',
      details: `Purged database records and unlinked ${unlinkedCount} files.`,
    });

    console.log(`[MediaManager] ✓ Permanently deleted clip ${clipId} and cleaned ${unlinkedCount} storage files.`);
    return { success: true, mode: 'permanent', clipId, unlinkedCount };
  },

  /**
   * Restore clip from Trash
   */
  async restoreClip(clipId: string) {
    const clip = dbRepo.getClipById(clipId) as any;
    if (!clip) {
      throw new Error(`Clip not found: ${clipId}`);
    }

    dbRepo.restoreClip(clipId);
    dbRepo.logMediaDeletion({
      itemType: 'clip',
      itemId: clipId,
      title: clip.title,
      filePath: clip.output_path,
      action: 'restore',
      details: 'Restored clip from Trash.',
    });

    console.log(`[MediaManager] ✓ Restored clip ${clipId} from Trash`);
    return { success: true, clipId };
  },

  /**
   * Delete source video (choice of deleting source only or source + all dependent clips)
   */
  async deleteSourceVideo(sourceId: string, options: { deleteClips?: boolean; permanent?: boolean } = {}) {
    const { deleteClips = false, permanent = false } = options;
    const source = dbRepo.getSourceVideoById(sourceId) as any;
    if (!source) {
      throw new Error(`Source video not found: ${sourceId}`);
    }

    const dependentClipsCount = dbRepo.getSourceVideoClipsCount(source.project_id);

    // If requested to delete dependent clips too
    if (deleteClips && dependentClipsCount > 0) {
      const clips = dbRepo.getClipsByProject(source.project_id) as any[];
      for (const c of clips) {
        await this.deleteClip(c.id, { permanent });
      }
    }

    if (!permanent) {
      dbRepo.softDeleteSourceVideo(sourceId);
      dbRepo.logMediaDeletion({
        itemType: 'source_video',
        itemId: sourceId,
        title: source.file_name,
        filePath: source.file_path,
        action: 'soft_delete',
        details: `Soft deleted source recording. Dependent clips retained: ${!deleteClips}`,
      });
      return { success: true, mode: 'trash', sourceId };
    }

    // Permanent delete: unlink source file on disk
    if (source.file_path && fs.existsSync(source.file_path)) {
      try {
        fs.unlinkSync(source.file_path);
        console.log(`[MediaManager] Unlinked source file: ${source.file_path}`);
      } catch (err: any) {
        console.warn(`[MediaManager] Could not unlink source file: ${err.message}`);
      }
    }

    dbRepo.permanentDeleteSourceVideo(sourceId);
    dbRepo.logMediaDeletion({
      itemType: 'source_video',
      itemId: sourceId,
      title: source.file_name,
      filePath: source.file_path,
      action: 'permanent_delete',
      details: `Permanently removed source video. Delete clips requested: ${deleteClips}`,
    });

    return { success: true, mode: 'permanent', sourceId };
  },

  /**
   * Delete project (options: deleteSource only vs deleteSource + all dependent clips)
   */
  async deleteProject(projectId: string, options: { deleteSource?: boolean; deleteClips?: boolean; permanent?: boolean } = {}) {
    const { deleteSource = false, deleteClips = false, permanent = false } = options;
    const project = dbRepo.getProject(projectId) as any;
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // 1. If deleteClips is true, delete all clips under this project
    if (deleteClips) {
      const clips = dbRepo.getClipsByProject(projectId) as any[];
      for (const clip of clips) {
        await this.deleteClip(clip.id, { permanent });
      }
    }

    // 2. If deleteSource is true, delete source video if found
    if (deleteSource) {
      const source = dbRepo.getSourceVideoByProject(projectId) as any;
      if (source) {
        await this.deleteSourceVideo(source.id, { deleteClips: false, permanent });
      }
    }

    // 3. Delete or soft-delete the project itself
    if (!permanent) {
      rawDb.prepare(`UPDATE projects SET is_deleted = 1, deleted_at = ? WHERE id = ?`).run(new Date().toISOString(), projectId);
      dbRepo.logMediaDeletion({
        itemType: 'project',
        itemId: projectId,
        title: project.title,
        action: 'soft_delete',
        details: `Soft deleted project ${projectId}. deleteSource=${deleteSource}, deleteClips=${deleteClips}`,
      });
      console.log(`[MediaManager] ✓ Soft-deleted project ${projectId}`);
      return { success: true, mode: 'trash', projectId };
    } else {
      rawDb.prepare(`DELETE FROM projects WHERE id = ?`).run(projectId);
      try {
        rawDb.prepare(`DELETE FROM detected_scenes WHERE project_id = ?`).run(projectId);
        rawDb.prepare(`DELETE FROM detected_highlights WHERE project_id = ?`).run(projectId);
        rawDb.prepare(`DELETE FROM video_analysis WHERE project_id = ?`).run(projectId);
        rawDb.prepare(`DELETE FROM editing_jobs WHERE project_id = ?`).run(projectId);
        rawDb.prepare(`DELETE FROM agent_execution_logs WHERE project_id = ?`).run(projectId);
        rawDb.prepare(`DELETE FROM copyright_reports WHERE project_id = ?`).run(projectId);
      } catch (err: any) {
        console.warn(`[MediaManager] Warning cleaning project child records:`, err.message);
      }

      dbRepo.logMediaDeletion({
        itemType: 'project',
        itemId: projectId,
        title: project.title,
        action: 'permanent_delete',
        details: `Permanently purged project ${projectId} and associated metadata.`,
      });
      console.log(`[MediaManager] ✓ Permanently deleted project ${projectId}`);
      return { success: true, mode: 'permanent', projectId };
    }
  },

  /**
   * Delete post (scheduled or published).
   * Note: Removing local record does NOT delete from external social platforms.
   */
  async deletePost(postId: string, options: { permanent?: boolean } = {}) {
    const { permanent = false } = options;
    const post = (dbRepo.getScheduledPosts() as any[]).find((p) => p.id === postId);
    if (!post) {
      throw new Error(`Post not found: ${postId}`);
    }

    if (!permanent) {
      rawDb.prepare(`UPDATE scheduled_posts SET is_deleted = 1, deleted_at = ? WHERE id = ?`).run(new Date().toISOString(), postId);
      dbRepo.logMediaDeletion({
        itemType: 'post',
        itemId: postId,
        title: post.title,
        action: 'soft_delete',
        details: `Soft deleted post ${postId} (status: ${post.status}). Local record moved to trash; remote platform post untouched.`,
      });
      return { success: true, mode: 'trash', postId };
    } else {
      try {
        rawDb.prepare(`DELETE FROM publishing_attempts WHERE scheduled_post_id = ?`).run(postId);
      } catch {}
      rawDb.prepare(`DELETE FROM scheduled_posts WHERE id = ?`).run(postId);
      dbRepo.logMediaDeletion({
        itemType: 'post',
        itemId: postId,
        title: post.title,
        action: 'permanent_delete',
        details: `Permanently removed post ${postId} from library. Remote platform post untouched.`,
      });
      return { success: true, mode: 'permanent', postId };
    }
  },

  /**
   * Bulk Delete (handles clips, sources, and exports)
   */
  async bulkDelete(ids: string[], options: { type?: 'clip' | 'source' | 'export'; permanent?: boolean } = {}) {
    const { type = 'clip', permanent = false } = options;
    let successCount = 0;
    let failedCount = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        if (type === 'source') {
          await this.deleteSourceVideo(id, { permanent, deleteClips: false });
        } else {
          await this.deleteClip(id, { permanent });
        }
        successCount++;
      } catch (err: any) {
        failedCount++;
        errors.push({ id, error: err.message });
      }
    }

    return {
      success: failedCount === 0,
      total: ids.length,
      successCount,
      failedCount,
      errors,
    };
  },

  /**
   * Bulk Restore from Trash
   */
  async bulkRestore(ids: string[]) {
    let successCount = 0;
    let failedCount = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        await this.restoreClip(id);
        successCount++;
      } catch (err: any) {
        failedCount++;
        errors.push({ id, error: err.message });
      }
    }

    return {
      success: failedCount === 0,
      total: ids.length,
      successCount,
      failedCount,
      errors,
    };
  },

  /**
   * Empty Trash: Permanently purge all soft-deleted items and clean storage files
   */
  async emptyTrash() {
    const trashClips = dbRepo.getTrashClips() as any[];
    let purgedClips = 0;

    for (const c of trashClips) {
      try {
        await this.deleteClip(c.id, { permanent: true });
        purgedClips++;
      } catch (err: any) {
        console.warn(`[MediaManager] Failed to purge clip ${c.id}:`, err.message);
      }
    }

    return {
      success: true,
      purgedCount: purgedClips,
    };
  },

  /**
   * Rename Media item
   */
  async renameMedia(id: string, type: 'clip' | 'source' | 'export', newTitle: string) {
    const cleanTitle = newTitle.trim();
    if (!cleanTitle) {
      throw new Error('Title cannot be empty');
    }

    if (type === 'source') {
      return dbRepo.renameSourceVideo(id, cleanTitle);
    } else {
      return dbRepo.renameClip(id, cleanTitle);
    }
  },

  /**
   * Compute comprehensive storage usage statistics
   */
  async getStorageStats(): Promise<StorageBreakdown> {
    const allSources = dbRepo.listSourceVideos(true) as any[];
    const allClips = dbRepo.getAllClips(true) as any[];
    const allExports = dbRepo.getExportFiles(true) as any[];

    let sourcesBytes = 0;
    let clipsBytes = 0;
    let exportsBytes = 0;
    let trashBytes = 0;
    let totalFiles = 0;
    let trashCount = 0;

    for (const s of allSources) {
      const size = s.file_size || 0;
      if (s.is_deleted) {
        trashBytes += size;
        trashCount++;
      } else {
        sourcesBytes += size;
      }
      totalFiles++;
    }

    for (const c of allClips) {
      let size = 0;
      if (c.output_path && fs.existsSync(c.output_path)) {
        try {
          size = fs.statSync(c.output_path).size;
        } catch {}
      }
      if (c.is_deleted) {
        trashBytes += size;
        trashCount++;
      } else {
        clipsBytes += size;
      }
      totalFiles++;
    }

    for (const e of allExports) {
      const size = e.file_size || 0;
      if (e.is_deleted) {
        trashBytes += size;
        trashCount++;
      } else {
        exportsBytes += size;
      }
      totalFiles++;
    }

    const totalBytes = sourcesBytes + clipsBytes + exportsBytes + trashBytes;

    return {
      totalBytes,
      totalGigabytes: Number((totalBytes / (1024 * 1024 * 1024)).toFixed(2)),
      sourcesBytes,
      clipsBytes,
      exportsBytes,
      trashBytes,
      totalFiles,
      trashCount,
    };
  },
};
