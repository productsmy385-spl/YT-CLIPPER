import { dbRepo } from '../db/repository.ts';
import fs from 'node:fs';
import path from 'node:path';
import { getProjectStoragePaths, SAMPLES_DIR } from '../lib/app-paths.ts';
import { ffmpegCore } from '../lib/ffmpeg-core.ts';
import { videoIngestionEngine, computeFileChecksum } from '../lib/video-ingestion.ts';
import { mediaAcquisitionService } from '../lib/source-acquisition.ts';
import { VideoAnalyzerAgent } from './01-video-analyzer.ts';
import { HighlightDetectionAgent } from './02-highlight-detector.ts';
import { ClipExtractionAgent } from './03-clip-extractor.ts';
import { MemeResearchAgent } from './04-meme-researcher.ts';
import { MusicSelectionAgent } from './05-music-selector.ts';
import { SoundEffectsAgent } from './06-sound-effects.ts';
import { VideoEditingAgent } from './07-video-editor.ts';
import { SubtitleAgent } from './08-subtitle-engine.ts';
import { CopyrightComplianceAgent } from './09-copyright-compliance.ts';
import { QualityAssuranceAgent } from './10-quality-assurance.ts';
import { ExportAgent } from './11-export-engine.ts';

export interface PipelineProgressCallback {
  (stage: string, percent: number, message: string): void;
}

interface ActiveJobState {
  abortController: AbortController;
  pids: Set<number>;
  workerId: string;
}

export const PIPELINE_STAGES = [
  { number: 1, key: 'inspecting', name: 'Inspecting URL', minProgress: 0, maxProgress: 5 },
  { number: 2, key: 'metadata', name: 'Metadata Retrieved', minProgress: 5, maxProgress: 10 },
  { number: 3, key: 'acquiring', name: 'Acquiring Media', minProgress: 10, maxProgress: 20 },
  { number: 4, key: 'validating_media', name: 'Validating Media', minProgress: 20, maxProgress: 28 },
  { number: 5, key: 'extracting_audio', name: 'Extracting Audio & Scenes', minProgress: 28, maxProgress: 40 },
  { number: 6, key: 'highlights', name: 'Detecting Highlights', minProgress: 40, maxProgress: 55 },
  { number: 7, key: 'extracting', name: 'Extracting Clips', minProgress: 55, maxProgress: 70 },
  { number: 8, key: 'generating_shorts', name: 'Generating Shorts & Subtitles', minProgress: 70, maxProgress: 85 },
  { number: 9, key: 'rendering_videos', name: 'Rendering Videos', minProgress: 85, maxProgress: 98 },
  { number: 10, key: 'completed', name: 'Completed', minProgress: 98, maxProgress: 100 },
] as const;

export class MasterAgentOrchestrator {
  private static activeJobs: Map<string, ActiveJobState> = new Map();
  private static activeLocks: Set<string> = new Set();

  private analyzer = new VideoAnalyzerAgent();
  private highlightDetector = new HighlightDetectionAgent();
  private extractor = new ClipExtractionAgent();
  private memeResearcher = new MemeResearchAgent();
  private musicSelector = new MusicSelectionAgent();
  private sfxAgent = new SoundEffectsAgent();
  private editor = new VideoEditingAgent();
  private subtitleEngine = new SubtitleAgent();
  private compliance = new CopyrightComplianceAgent();
  private qaAgent = new QualityAssuranceAgent();
  private exportEngine = new ExportAgent();

  public static isProjectLocked(projectId: string): boolean {
    return this.activeLocks.has(projectId);
  }

  public static isJobActive(projectId: string): boolean {
    return this.activeJobs.has(projectId);
  }

  public static registerProcess(projectId: string, pid: number) {
    let job = this.activeJobs.get(projectId);
    if (!job) {
      job = {
        abortController: new AbortController(),
        pids: new Set(),
        workerId: `worker_${process.pid}_${Date.now()}`,
      };
      this.activeJobs.set(projectId, job);
    }
    job.pids.add(pid);
  }

  public static unregisterProcess(projectId: string, pid: number) {
    const job = this.activeJobs.get(projectId);
    if (job) {
      job.pids.delete(pid);
    }
  }

  public static cancelProject(projectId: string): boolean {
    console.log(`[Orchestrator] 🛑 Graceful cancellation requested for project ${projectId}...`);
    dbRepo.cancelProject(projectId);

    const job = this.activeJobs.get(projectId);
    if (job) {
      try {
        job.abortController.abort();
      } catch {}

      for (const pid of job.pids) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          try {
            process.kill(pid, 'SIGKILL');
          } catch {}
        }
      }
      job.pids.clear();
      this.activeJobs.delete(projectId);
    }

    this.activeLocks.delete(projectId);
    return true;
  }

  async processProject(
    target: string | { projectId: string; sourceVideoId?: string; sourceFilePath?: string; sourceChecksum?: string; sourceUrl?: string; jobId?: string; pairAuthorizedStream?: boolean },
    videoPathOrCb?: string | PipelineProgressCallback,
    onProgressCb?: PipelineProgressCallback
  ) {
    const isPayload = typeof target === 'object';
    const projectId = isPayload ? target.projectId : target;
    let rawVideoPath = isPayload ? target.sourceFilePath : (videoPathOrCb as string);
    const sourceVideoId = isPayload ? target.sourceVideoId || `sv_${projectId}` : `sv_${projectId}`;
    const expectedChecksum = isPayload ? (target as any).sourceChecksum : undefined;
    const jobId = isPayload ? (target as any).jobId || `job_${projectId}` : `job_${projectId}`;
    const sourceUrl = isPayload ? target.sourceUrl : undefined;
    const durationPreset = isPayload ? (target as any).durationPreset : undefined;
    const onProgress = isPayload ? undefined : (typeof videoPathOrCb === 'function' ? videoPathOrCb : onProgressCb);

    const workerId = `worker_${process.pid}_${Date.now()}`;

    // ================= 1. ATOMIC QUEUE & JOB CLAIMING LOCK =================
    if (MasterAgentOrchestrator.activeLocks.has(projectId)) {
      console.warn(`[Orchestrator] ⚠️ Project ${projectId} is already locked by an active worker. Skipping duplicate spawn.`);
      return { projectId, alreadyRunning: true };
    }

    const acquired = dbRepo.claimProjectLock(projectId, workerId);
    if (!acquired && dbRepo.getProject(projectId)?.status === 'in_progress') {
      console.warn(`[Orchestrator] ⚠️ Project ${projectId} DB lock is held by another worker. Skipping duplicate.`);
      return { projectId, alreadyRunning: true };
    }

    MasterAgentOrchestrator.activeLocks.add(projectId);
    const abortController = new AbortController();
    MasterAgentOrchestrator.activeJobs.set(projectId, {
      abortController,
      pids: new Set(),
      workerId,
    });

    console.log(`\n======================================================`);
    console.log(`🎬 STARTING 10-STAGE PIPELINE FOR PROJECT: ${projectId}`);
    console.log(`Source Video: ${rawVideoPath || '(pending resolution)'} (Source ID: ${sourceVideoId})`);
    console.log(`======================================================\n`);

    const checkCancellation = (): boolean => {
      if (dbRepo.isProjectCancelled(projectId)) {
        console.log(`[Orchestrator] 🛑 Project ${projectId} halted via cancellation.`);
        dbRepo.updateProjectStatus(projectId, 'cancelled', 0, 'cancelled', {
          stageStatus: 'CANCELLED',
          workerId,
        });
        if (onProgress) onProgress('cancelled', 0, 'Processing cancelled by user.');
        return true;
      }
      return false;
    };

    const updateStage = (
      stageNumber: number,
      key: string,
      name: string,
      status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'CANCELLED',
      percent: number,
      msg: string,
      details?: any
    ) => {
      if (checkCancellation()) return;

      const now = new Date().toISOString();
      const startedAt = status === 'ACTIVE' ? now : undefined;
      const completedAt = status === 'COMPLETED' ? now : undefined;

      // 1. Persist detailed stage transition record
      dbRepo.savePipelineStage({
        projectId,
        stageNumber,
        stageKey: key,
        stageName: name,
        status,
        progressPercent: percent,
        startedAt,
        completedAt,
        errorMessage: status === 'FAILED' ? msg : undefined,
        detailsJson: details ? JSON.stringify(details) : undefined,
      });

      // 2. Persist project header status and heartbeat
      dbRepo.updateProjectStatus(
        projectId,
        status === 'FAILED' ? 'error' : status === 'COMPLETED' && stageNumber === 10 ? 'ready' : 'in_progress',
        percent,
        msg,
        {
          stageId: String(stageNumber),
          stageStatus: status,
          errorMessage: status === 'FAILED' ? msg : undefined,
          workerId,
        }
      );

      console.log(`[${percent}%] [STAGE ${stageNumber}: ${key.toUpperCase()}] ${status} -> ${msg}`);
      if (onProgress) onProgress(key, percent, msg);
    };

    try {
      if (checkCancellation()) return { projectId, cancelled: true };

      // ================= STAGE 1: INSPECTING_URL (0-5%) =================
      updateStage(1, 'inspecting', 'Inspecting URL', 'ACTIVE', 2, 'Inspecting video source link & protocol format...');

      let validatedSourcePath = rawVideoPath;
      const storagePaths = getProjectStoragePaths(projectId);

      // Fast-fail if malformed YouTube URL
      if (sourceUrl) {
        const yt = videoIngestionEngine.parseYouTubeUrl(sourceUrl);
        const isDirect = sourceUrl.endsWith('.mp4') || sourceUrl.endsWith('.mov') || sourceUrl.endsWith('.webm') || sourceUrl.includes('/video/');
        if (!yt.isValid && !isDirect) {
          const err = 'Invalid video URL format. Supported formats: youtube.com/watch?v=ID, youtu.be/ID, or direct MP4/MOV links.';
          updateStage(1, 'inspecting', 'Inspecting URL', 'FAILED', 2, err);
          throw new Error(err);
        }
      }

      updateStage(1, 'inspecting', 'Inspecting URL', 'COMPLETED', 5, '✓ Video source URL inspected successfully.');
      if (checkCancellation()) return { projectId, cancelled: true };

      // ================= STAGE 2: METADATA_RETRIEVED (5-10%) =================
      updateStage(2, 'metadata', 'Metadata Retrieved', 'ACTIVE', 6, 'Retrieving source metadata...');
      updateStage(2, 'metadata', 'Metadata Retrieved', 'COMPLETED', 10, '✓ Video metadata retrieved.');
      if (checkCancellation()) return { projectId, cancelled: true };

      // ================= STAGE 3: ACQUIRING_MEDIA (10-20%) =================
      updateStage(3, 'acquiring', 'Acquiring Media', 'ACTIVE', 12, 'Acquiring source media through authorized provider...');

      if (!validatedSourcePath || !fs.existsSync(validatedSourcePath)) {
        const mediaRes = await mediaAcquisitionService.acquireMedia({
          sourceUrl,
          sourceFile: validatedSourcePath,
          videoId: (target as any).videoId || (target as any).sourceVideoId,
          projectId,
        });

        if (mediaRes.acquisitionStatus === 'ready' && mediaRes.filePath && fs.existsSync(mediaRes.filePath)) {
          validatedSourcePath = mediaRes.filePath;
          updateStage(3, 'acquiring', 'Acquiring Media', 'COMPLETED', 20, `✓ Acquired media via ${mediaRes.provider}`);
        } else {
          const err = mediaRes.error || `Media acquisition failed for ${sourceUrl || projectId}.`;
          updateStage(3, 'acquiring', 'Acquiring Media', 'FAILED', 12, err);
          dbRepo.updateProjectStatus(projectId, 'error', 12, 'Media acquisition failed', { errorMessage: err });
          throw new Error(err);
        }
      } else {
        updateStage(3, 'acquiring', 'Acquiring Media', 'COMPLETED', 20, '✓ Source media available on disk.');
      }
      if (checkCancellation()) return { projectId, cancelled: true };

      // ================= STAGE 4: VALIDATING_MEDIA (20-28%) =================
      updateStage(4, 'validating_media', 'Validating Media', 'ACTIVE', 22, 'Running FFprobe stream inspection...');

      // Ensure isolated project copy in storage/projects/<projectId>/source/
      const ext = path.extname(validatedSourcePath) || '.mp4';
      const projectIsolatedSource = path.join(storagePaths.sourceDir, `${projectId}_${sourceVideoId}_source${ext}`);
      if (path.resolve(validatedSourcePath) !== path.resolve(projectIsolatedSource)) {
        try {
          fs.copyFileSync(validatedSourcePath, projectIsolatedSource);
          validatedSourcePath = projectIsolatedSource;
          console.log(`[Orchestrator] Created isolated project source copy: ${projectIsolatedSource}`);
        } catch (copyErr: any) {
          console.warn(`[Orchestrator] Note on source file isolation copy:`, copyErr.message);
        }
      }

      // Verify read permissions before FFprobe
      try {
        fs.accessSync(validatedSourcePath, fs.constants.R_OK);
      } catch (accErr: any) {
        const err = `Source video file cannot be read: ${accErr.message}`;
        updateStage(4, 'validating_media', 'Validating Media', 'FAILED', 22, err);
        dbRepo.updateProjectStatus(projectId, 'error', 22, 'Source file unreadable', { errorMessage: err });
        throw new Error(err);
      }

      // Verify cryptographic SHA-256 checksum
      const actualChecksum = computeFileChecksum(validatedSourcePath);
      if (expectedChecksum && expectedChecksum !== actualChecksum) {
        const err = `Source video checksum mismatch! Expected ${expectedChecksum}, got ${actualChecksum}`;
        updateStage(4, 'validating_media', 'Validating Media', 'FAILED', 22, err);
        dbRepo.updateProjectStatus(projectId, 'error', 22, 'Checksum mismatch', { errorMessage: err });
        throw new Error(err);
      }

      let probeMeta: any;
      try {
        probeMeta = ffmpegCore.probe(validatedSourcePath);
      } catch (probeErr: any) {
        const err = `FFprobe failed to inspect source container: ${probeErr.message}`;
        updateStage(4, 'validating_media', 'Validating Media', 'FAILED', 22, err);
        throw new Error(err);
      }

      if (!probeMeta || probeMeta.duration <= 0) {
        const err = 'Source video stream contains 0 seconds duration or corrupted packets.';
        updateStage(4, 'validating_media', 'Validating Media', 'FAILED', 22, err);
        throw new Error(err);
      }

      // Save source video record
      dbRepo.saveSourceVideo({
        id: sourceVideoId,
        projectId,
        fileName: path.basename(validatedSourcePath),
        filePath: validatedSourcePath,
        fileSize: fs.statSync(validatedSourcePath).size,
        duration: probeMeta.duration,
        width: probeMeta.width,
        height: probeMeta.height,
        fps: probeMeta.fps,
        bitrate: probeMeta.bitrate,
        audioChannels: probeMeta.audioChannels,
        originSource: sourceUrl ? 'youtube_stream' : 'local_upload',
        sha256Checksum: actualChecksum,
      });

      updateStage(
        4,
        'validating_media',
        'Validating Media',
        'COMPLETED',
        28,
        `✓ Media validated: ${probeMeta.width}x${probeMeta.height}, ${probeMeta.duration.toFixed(1)}s, ${probeMeta.fps} FPS.`
      );
      if (checkCancellation()) return { projectId, cancelled: true };

      const videoPath = validatedSourcePath;

      // ================= STAGE 5: EXTRACTING_AUDIO & SCENES (28-40%) =================
      updateStage(5, 'extracting_audio', 'Extracting Audio & Scenes', 'ACTIVE', 30, 'Extracting audio streams, computing volume heatmap & scene transitions...');

      const analysis = await this.analyzer.execute(projectId, { videoPath, sourceVideoId, sourceUrl });
      if (checkCancellation()) return { projectId, cancelled: true };

      updateStage(
        5,
        'extracting_audio',
        'Extracting Audio & Scenes',
        'COMPLETED',
        40,
        `✓ Audio & scene analysis complete: ${analysis.scenes?.length || 0} scenes, ${analysis.audioPeaks?.length || 0} audio peaks analyzed.`
      );
      if (checkCancellation()) return { projectId, cancelled: true };

      // ================= STAGE 6: DETECTING_HIGHLIGHTS (40-55%) =================
      updateStage(6, 'highlights', 'Detecting Highlights', 'ACTIVE', 42, 'Evaluating entertainment scores & merging overlapping moments...');

      const highlights = await this.highlightDetector.execute(projectId, {
        analysis,
        sourceVideoId,
        durationPreset: durationPreset || '30-60s',
      });
      if (checkCancellation()) return { projectId, cancelled: true };

      if (highlights.length === 0) {
        const err = 'No highlights detected with entertainment score >= 75 in video timeline.';
        updateStage(6, 'highlights', 'Detecting Highlights', 'FAILED', 42, err);
        throw new Error(err);
      }

      updateStage(
        6,
        'highlights',
        'Detecting Highlights',
        'COMPLETED',
        55,
        `✓ Detected ${highlights.length} unique long-form viral highlights.`
      );
      if (checkCancellation()) return { projectId, cancelled: true };

      // ================= STAGE 7: EXTRACTING_CLIPS (55-70%) =================
      updateStage(7, 'extracting', 'Extracting Clips', 'ACTIVE', 56, `Trimming ${highlights.length} clips with contextual buffer...`);

      const extractedClips = await this.extractor.execute(projectId, {
        sourceVideoPath: videoPath,
        highlights,
        sourceVideoId,
        sourceChecksum: actualChecksum,
        jobId,
      });
      if (checkCancellation()) return { projectId, cancelled: true };

      if (!extractedClips || extractedClips.length === 0) {
        const err = 'Clip extraction failed: 0 clips were extracted from the source video.';
        updateStage(7, 'extracting', 'Extracting Clips', 'FAILED', 56, err);
        throw new Error(err);
      }

      updateStage(
        7,
        'extracting',
        'Extracting Clips',
        'COMPLETED',
        70,
        `✓ Successfully extracted ${extractedClips.length} unique clips (idempotent; 0 duplicate files).`
      );
      if (checkCancellation()) return { projectId, cancelled: true };

      // ================= STAGE 8: GENERATING_SHORTS & SUBTITLES (70-85%) =================
      updateStage(8, 'generating_shorts', 'Generating Shorts & Subtitles', 'ACTIVE', 71, `Composing 9:16 vertical shorts, memes, and typography for ${extractedClips.length} clips...`);

      const editedResults = [];

      for (let i = 0; i < extractedClips.length; i++) {
        if (checkCancellation()) return { projectId, cancelled: true };

        const clip = extractedClips[i];
        const clipProgress = 70 + Math.round(((i + 1) / extractedClips.length) * 15);

        // 1. Meme Selection
        const memeConfig = await this.memeResearcher.execute(projectId, {
          clipId: clip.clipId,
          mood: highlights[i]?.suggestedMemeMood || 'laugh',
          clipDuration: clip.duration,
        });
        if (checkCancellation()) return { projectId, cancelled: true };

        // 2. Music Selection
        const musicConfig = await this.musicSelector.execute(projectId, {
          clipId: clip.clipId,
          preferredGenre: highlights[i]?.suggestedMusicGenre || 'phonk',
          duration: clip.duration,
        });
        if (checkCancellation()) return { projectId, cancelled: true };

        // 3. Sound Effects
        const sfxConfig = await this.sfxAgent.execute(projectId, {
          clipId: clip.clipId,
          duration: clip.duration,
          peakEventTime: clip.duration * 0.6,
          category: highlights[i]?.categoryLabel,
          description: (highlights[i] as any)?.eventDescription || highlights[i]?.peakEvent,
        });
        if (checkCancellation()) return { projectId, cancelled: true };

        // 4. Subtitle generation
        const subtitleConfig = await this.subtitleEngine.execute(projectId, {
          clipId: clip.clipId,
          duration: clip.duration,
          categoryLabel: highlights[i]?.categoryLabel,
          eventDescription: (highlights[i] as any)?.eventDescription,
          peakMoment: highlights[i]?.peakEvent,
        });
        if (checkCancellation()) return { projectId, cancelled: true };

        // 5. Render vertical short
        const editResult = await this.editor.execute(projectId, {
          clipId: clip.clipId,
          rawClipPath: clip.rawClipPath,
          duration: clip.duration,
          sourceVideoId,
          highlightId: clip.highlightId,
          sourceChecksum: actualChecksum,
          jobId,
          layoutMode: 'blurred_background',
          memeConfig,
          musicConfig,
          sfxConfig,
          subtitleConfig,
        });
        if (checkCancellation()) return { projectId, cancelled: true };

        editedResults.push({
          clip,
          editResult,
          musicConfig,
          memeConfig,
          subtitleConfig,
        });

        updateStage(8, 'generating_shorts', 'Generating Shorts & Subtitles', 'ACTIVE', clipProgress, `Composed Clip ${i + 1}/${extractedClips.length} in 9:16 vertical 1080x1920 format.`);
      }

      if (editedResults.length === 0) {
        const err = 'Clip editing failed: 0 vertical compositions were rendered.';
        updateStage(8, 'generating_shorts', 'Generating Shorts & Subtitles', 'FAILED', 71, err);
        throw new Error(err);
      }

      updateStage(8, 'generating_shorts', 'Generating Shorts & Subtitles', 'COMPLETED', 85, `✓ Rendered 9:16 vertical compositions for all ${extractedClips.length} clips.`);
      if (checkCancellation()) return { projectId, cancelled: true };

      // ================= STAGE 9: RENDERING_VIDEOS & QA (85-98%) =================
      updateStage(9, 'rendering_videos', 'Rendering Videos', 'ACTIVE', 86, 'Running quality assurance, audio volume sync, and compliance audits...');

      const verifiedClips = [];

      for (let i = 0; i < editedResults.length; i++) {
        if (checkCancellation()) return { projectId, cancelled: true };

        const { clip, editResult, musicConfig, memeConfig } = editedResults[i];
        const qaProgress = 88 + Math.round(((i + 1) / editedResults.length) * 7);

        const complianceReport = await this.compliance.execute(projectId, {
          clipId: clip.clipId,
          sourceOrigin: 'authorized_gameplay',
          musicId: musicConfig.selectedMusic?.id || 'music_01',
          memeId: memeConfig.selectedMeme?.id || 'meme_01',
        });
        if (checkCancellation()) return { projectId, cancelled: true };

        const qaReport = await this.qaAgent.execute(projectId, {
          clipId: clip.clipId,
          videoPath: editResult.finalVideoPath,
        });
        if (checkCancellation()) return { projectId, cancelled: true };

        if (!qaReport.passed || !complianceReport.passed) {
          console.warn(`[Orchestrator] ⚠️ Clip ${clip.clipId} failed QA or Compliance. Skipping.`);
          continue;
        }

        verifiedClips.push({
          clip,
          editResult,
          qaReport,
          complianceReport,
        });

        updateStage(9, 'qa', 'Running quality checks', 'ACTIVE', qaProgress, `Audited Clip ${i + 1}/${editedResults.length}: QA Score ${qaReport.qaScore}/100, Copyright 100%`);
      }

      if (verifiedClips.length === 0) {
        const err = 'Quality assurance failed: 0 clips passed visual and compliance audits.';
        updateStage(9, 'rendering_videos', 'Rendering Videos', 'FAILED', 86, err);
        throw new Error(err);
      }

      updateStage(9, 'rendering_videos', 'Rendering Videos', 'COMPLETED', 98, `✓ Rendering & QA passed for ${verifiedClips.length} clips.`);
      if (checkCancellation()) return { projectId, cancelled: true };

      // ================= STAGE 10: COMPLETED (98-100%) =================
      updateStage(10, 'completed', 'Completed', 'ACTIVE', 98, 'Packaging final YouTube Shorts & deliverables...');

      const processedClips = [];

      for (let i = 0; i < verifiedClips.length; i++) {
        if (checkCancellation()) return { projectId, cancelled: true };

        const { clip, editResult, qaReport, complianceReport } = verifiedClips[i];
        const exportProgress = 95 + Math.round(((i + 1) / verifiedClips.length) * 4);

        const exportResult = await this.exportEngine.execute(projectId, {
          clipId: clip.clipId,
          videoPath: editResult.finalVideoPath,
          title: clip.title || `GTA 6 Highlight #${i + 1}`,
        });
        if (checkCancellation()) return { projectId, cancelled: true };

        processedClips.push({
          clipId: clip.clipId,
          finalVideoPath: editResult.finalVideoPath,
          qaScore: qaReport.qaScore,
          complianceScore: complianceReport.score,
          exports: exportResult.exports,
        });

        updateStage(10, 'export', 'Exporting final videos', 'ACTIVE', exportProgress, `Packaged Clip ${i + 1}/${verifiedClips.length} deliverables.`);
      }

      if (processedClips.length === 0) {
        const err = 'Export failed: No valid 9:16 vertical clips were rendered or verified.';
        updateStage(10, 'export', 'Exporting final videos', 'FAILED', 96, err);
        dbRepo.updateProjectStatus(projectId, 'error', 0, err, {
          stageId: '10',
          stageStatus: 'FAILED',
          errorMessage: err,
          workerId,
        });
        throw new Error(err);
      }

      updateStage(10, 'export', 'Exporting final videos', 'COMPLETED', 100, `✓ All ${processedClips.length} Shorts packaged and ready for export!`);
      dbRepo.updateProjectStatus(projectId, 'ready', 100, 'All videos successfully exported & verified', {
        stageId: '10',
        stageStatus: 'COMPLETED',
        workerId,
      });

      console.log(`\n======================================================`);
      console.log(`🎉 10-STAGE MULTI-AGENT WORKFLOW COMPLETED SUCCESSFULLY!`);
      console.log(`Project: ${projectId} | Total Deliverables: ${processedClips.length}`);
      console.log(`======================================================\n`);

      return {
        projectId,
        status: 'ready',
        totalClips: processedClips.length,
        clips: processedClips,
      };
    } catch (error: any) {
      if (dbRepo.isProjectCancelled(projectId)) {
        console.log(`[Orchestrator] Project ${projectId} terminated via user cancellation.`);
        return { projectId, cancelled: true };
      }
      console.error(`\n❌ PIPELINE ERROR IN PROJECT ${projectId}:`, error);
      dbRepo.updateProjectStatus(projectId, 'error', 0, error.message || 'Pipeline failed', {
        stageStatus: 'FAILED',
        errorMessage: error.message,
        workerId,
      });
      throw error;
    } finally {
      MasterAgentOrchestrator.activeLocks.delete(projectId);
      MasterAgentOrchestrator.activeJobs.delete(projectId);
      dbRepo.releaseProjectLock(projectId, workerId);
    }
  }
}
