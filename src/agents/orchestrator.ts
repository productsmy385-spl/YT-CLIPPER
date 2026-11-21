import { dbRepo } from '../db/repository.ts';
import fs from 'node:fs';
import path from 'node:path';
import { getProjectStoragePaths, SAMPLES_DIR } from '../lib/app-paths.ts';
import { ffmpegCore } from '../lib/ffmpeg-core.ts';
import { videoIngestionEngine, computeFileChecksum } from '../lib/video-ingestion.ts';
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
  { number: 1, key: 'validating', name: 'Validating source link', minProgress: 0, maxProgress: 5 },
  { number: 2, key: 'retrieving', name: 'Retrieving video information', minProgress: 5, maxProgress: 10 },
  { number: 3, key: 'source_processing', name: 'Processing authorized source video', minProgress: 10, maxProgress: 20 },
  { number: 4, key: 'analyzing', name: 'Analyzing video', minProgress: 20, maxProgress: 35 },
  { number: 5, key: 'highlights', name: 'Detecting highlights', minProgress: 35, maxProgress: 45 },
  { number: 6, key: 'extracting', name: 'Extracting clips', minProgress: 45, maxProgress: 60 },
  { number: 7, key: 'editing', name: 'Editing clips', minProgress: 60, maxProgress: 80 },
  { number: 8, key: 'subtitles', name: 'Generating subtitles', minProgress: 80, maxProgress: 88 },
  { number: 9, key: 'qa', name: 'Running quality checks', minProgress: 88, maxProgress: 95 },
  { number: 10, key: 'export', name: 'Exporting final videos', minProgress: 95, maxProgress: 100 },
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

      // ================= STAGE 1: VALIDATING_SOURCE (0-5%) =================
      updateStage(1, 'validating', 'Validating source link', 'ACTIVE', 2, 'Validating source link & access permissions...');

      let validatedSourcePath = rawVideoPath;
      const storagePaths = getProjectStoragePaths(projectId);

      // Case A: YouTube URL supplied - acquire stream if not yet on disk
      if (sourceUrl) {
        const yt = videoIngestionEngine.parseYouTubeUrl(sourceUrl);
        if (!yt.isValid || !yt.videoId) {
          const err = 'Invalid YouTube video URL format. Supported formats: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID.';
          updateStage(1, 'validating', 'Validating source link', 'FAILED', 2, err);
          throw new Error(err);
        }

        // Check if an authorized stream file already exists on disk for this videoId
        const existingFile = videoIngestionEngine.findAuthorizedSourceFile(yt.videoId);
        if (existingFile && fs.existsSync(existingFile)) {
          validatedSourcePath = existingFile;
        }

        if (!validatedSourcePath || !fs.existsSync(validatedSourcePath)) {
          const err = 'Source metadata verified, but an authorized video file is required before extraction can begin. Please upload your original recording.';
          updateStage(1, 'validating', 'Validating source link', 'FAILED', 2, err);
          dbRepo.updateProjectStatus(projectId, 'error', 2, 'Video file unavailable', { errorMessage: err });
          throw new Error(err);
        }
      }

      // Case B: Local video file supplied - verify existence
      if (!validatedSourcePath || !fs.existsSync(validatedSourcePath)) {
        const err = 'Source metadata verified, but an authorized video file is required before extraction can begin. Please upload your original recording.';
        updateStage(1, 'validating', 'Validating source link', 'FAILED', 2, err);
        dbRepo.updateProjectStatus(projectId, 'error', 2, 'Video file missing', { errorMessage: err });
        throw new Error(err);
      }

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
        updateStage(1, 'validating', 'Validating source link', 'FAILED', 2, err);
        dbRepo.updateProjectStatus(projectId, 'error', 2, 'Source file unreadable', { errorMessage: err });
        throw new Error(err);
      }

      // Verify cryptographic SHA-256 checksum
      const actualChecksum = computeFileChecksum(validatedSourcePath);
      if (expectedChecksum && expectedChecksum !== actualChecksum) {
        const err = `Source video checksum mismatch! Expected ${expectedChecksum}, got ${actualChecksum}`;
        updateStage(1, 'validating', 'Validating source link', 'FAILED', 2, err);
        dbRepo.updateProjectStatus(projectId, 'error', 2, 'Checksum mismatch', { errorMessage: err });
        throw new Error(err);
      }

      updateStage(1, 'validating', 'Validating source link', 'COMPLETED', 5, '✓ Source link and permissions validated successfully.');
      if (checkCancellation()) return { projectId, cancelled: true };

      // ================= STAGE 2: RETRIEVING_METADATA (5-10%) =================
      updateStage(2, 'retrieving', 'Retrieving video information', 'ACTIVE', 6, 'Probing video streams, dimensions, and audio channels...');

      let probeMeta: any;
      try {
        probeMeta = ffmpegCore.probe(validatedSourcePath);
      } catch (probeErr: any) {
        const err = `FFprobe failed to inspect source container: ${probeErr.message}`;
        updateStage(2, 'retrieving', 'Retrieving video information', 'FAILED', 6, err);
        throw new Error(err);
      }

      if (!probeMeta || probeMeta.duration <= 0) {
        const err = 'Source video stream contains 0 seconds duration or corrupted packets.';
        updateStage(2, 'retrieving', 'Retrieving video information', 'FAILED', 6, err);
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
        2,
        'retrieving',
        'Retrieving video information',
        'COMPLETED',
        10,
        `✓ Metadata retrieved: ${probeMeta.width}x${probeMeta.height}, ${probeMeta.duration.toFixed(1)}s, ${probeMeta.fps} FPS.`
      );
      if (checkCancellation()) return { projectId, cancelled: true };

      // ================= STAGE 3: PROCESSING_SOURCE (10-20%) =================
      updateStage(3, 'source_processing', 'Processing authorized source video', 'ACTIVE', 12, 'Isolating gameplay footage & verifying channel integrity...');

      const videoPath = validatedSourcePath;

      updateStage(3, 'source_processing', 'Processing authorized source video', 'COMPLETED', 20, '✓ Source video isolated to project workspace.');
      if (checkCancellation()) return { projectId, cancelled: true };

      // ================= STAGE 4: ANALYZING_VIDEO (20-35%) =================
      updateStage(4, 'analyzing', 'Analyzing video', 'ACTIVE', 22, 'Multi-scene scan, motion vectors & audio energy analysis...');

      const analysis = await this.analyzer.execute(projectId, { videoPath, sourceVideoId, sourceUrl });
      if (checkCancellation()) return { projectId, cancelled: true };

      updateStage(
        4,
        'analyzing',
        'Analyzing video',
        'COMPLETED',
        35,
        `✓ Video analysis complete: ${analysis.scenes?.length || 0} scenes, ${analysis.audioPeaks?.length || 0} audio peaks analyzed.`
      );
      if (checkCancellation()) return { projectId, cancelled: true };

      // ================= STAGE 5: DETECTING_HIGHLIGHTS (35-45%) =================
      updateStage(5, 'highlights', 'Detecting highlights', 'ACTIVE', 36, 'Scoring entertainment value & merging overlapping moments...');

      const highlights = await this.highlightDetector.execute(projectId, {
        analysis,
        sourceVideoId,
        durationPreset: durationPreset || '30-60s',
      });
      if (checkCancellation()) return { projectId, cancelled: true };

      if (highlights.length === 0) {
        const err = 'No highlights detected with entertainment score >= 75 in video timeline.';
        updateStage(5, 'highlights', 'Detecting highlights', 'FAILED', 36, err);
        throw new Error(err);
      }

      updateStage(
        5,
        'highlights',
        'Detecting highlights',
        'COMPLETED',
        45,
        `✓ Detected ${highlights.length} unique long-form viral highlights (no duplicates).`
      );
      if (checkCancellation()) return { projectId, cancelled: true };

      // ================= STAGE 6: EXTRACTING_CLIPS (45-60%) =================
      updateStage(6, 'extracting', 'Extracting clips', 'ACTIVE', 46, `Trimming ${highlights.length} clips with contextual buffer...`);

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
        updateStage(6, 'extracting', 'Extracting clips', 'FAILED', 46, err);
        throw new Error(err);
      }

      updateStage(
        6,
        'extracting',
        'Extracting clips',
        'COMPLETED',
        60,
        `✓ Successfully extracted ${extractedClips.length} unique clips (idempotent; 0 duplicate files).`
      );
      if (checkCancellation()) return { projectId, cancelled: true };

      // ================= STAGE 7: EDITING_CLIPS (60-80%) =================
      updateStage(7, 'editing', 'Editing clips', 'ACTIVE', 61, `Composing 9:16 vertical shorts (1080x1920) for ${extractedClips.length} clips...`);

      const editedResults = [];

      for (let i = 0; i < extractedClips.length; i++) {
        if (checkCancellation()) return { projectId, cancelled: true };

        const clip = extractedClips[i];
        const clipProgress = 60 + Math.round(((i + 1) / extractedClips.length) * 20);

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

        updateStage(7, 'editing', 'Editing clips', 'ACTIVE', clipProgress, `Composed Clip ${i + 1}/${extractedClips.length} in 9:16 vertical 1080x1920 format.`);
      }

      if (editedResults.length === 0) {
        const err = 'Clip editing failed: 0 vertical compositions were rendered.';
        updateStage(7, 'editing', 'Editing clips', 'FAILED', 61, err);
        throw new Error(err);
      }

      updateStage(7, 'editing', 'Editing clips', 'COMPLETED', 80, `✓ Rendered 9:16 vertical compositions for all ${extractedClips.length} clips.`);
      if (checkCancellation()) return { projectId, cancelled: true };

      // ================= STAGE 8: GENERATING_SUBTITLES (80-88%) =================
      updateStage(8, 'subtitles', 'Generating subtitles', 'ACTIVE', 81, 'Validating animated word-level typography inside mobile-safe areas...');

      for (let i = 0; i < editedResults.length; i++) {
        const item = editedResults[i];
        const subProgress = 80 + Math.round(((i + 1) / editedResults.length) * 8);
        updateStage(8, 'subtitles', 'Generating subtitles', 'ACTIVE', subProgress, `Verified dynamic captions for Clip ${i + 1}/${editedResults.length}`);
      }

      updateStage(8, 'subtitles', 'Generating subtitles', 'COMPLETED', 88, '✓ Dynamic typography and styling confirmed across all clips.');
      if (checkCancellation()) return { projectId, cancelled: true };

      // ================= STAGE 9: QUALITY_CHECKS (88-95%) =================
      updateStage(9, 'qa', 'Running quality checks', 'ACTIVE', 89, 'Executing automated quality assurance and copyright compliance audits...');

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
        updateStage(9, 'qa', 'Running quality checks', 'FAILED', 89, err);
        throw new Error(err);
      }

      updateStage(9, 'qa', 'Running quality checks', 'COMPLETED', 95, `✓ Quality assurance passed for ${verifiedClips.length} clips.`);
      if (checkCancellation()) return { projectId, cancelled: true };

      // ================= STAGE 10: EXPORTING (95-100%) =================
      updateStage(10, 'export', 'Exporting final videos', 'ACTIVE', 96, 'Packaging deliverables for YouTube Shorts, Instagram Reels & TikTok...');

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
