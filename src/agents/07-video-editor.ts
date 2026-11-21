import { BaseAgent } from './base-agent.ts';
import { ffmpegCore } from '../lib/ffmpeg-core.ts';
import { dbRepo } from '../db/repository.ts';
import path from 'node:path';
import fs from 'node:fs';
import { getProjectStoragePaths } from '../lib/app-paths.ts';
import type { MemeSelectionResult } from './04-meme-researcher.ts';
import type { MusicSelectionResult } from './05-music-selector.ts';
import type { SfxPlacementResult } from './06-sound-effects.ts';
import type { SubtitleResult } from './08-subtitle-engine.ts';

export interface VideoEditingInput {
  clipId: string;
  rawClipPath: string;
  duration: number;
  layoutMode?: 'blurred_background' | 'center_crop';
  cropX?: number;
  zoomScale?: number;
  memeConfig?: MemeSelectionResult;
  musicConfig?: MusicSelectionResult;
  sfxConfig?: SfxPlacementResult;
  subtitleConfig?: SubtitleResult;
  editingVersion?: number;
  sourceVideoId?: string;
  highlightId?: string;
}

export interface VideoEditingResult {
  clipId: string;
  finalVideoPath: string;
  resolution: string;
  duration: number;
  fps: number;
  isValid: boolean;
  meanVolumeDb: number;
  reused?: boolean;
}

export class VideoEditingAgent extends BaseAgent<VideoEditingInput, VideoEditingResult> {
  readonly id = 'agent_07_editor';
  readonly name = 'Video Editing Agent';
  readonly role = 'Idempotent 9:16 Programmatic Vertical Video Composition';

  protected async run(projectId: string, input: VideoEditingInput): Promise<VideoEditingResult> {
    const { editedDir } = getProjectStoragePaths(projectId);
    const editingVersion = input.editingVersion || 1;
    const finalVideoPath = path.join(editedDir, `${input.clipId}_vertical_v${editingVersion}_final.mp4`);

    // ================= IDEMPOTENT EDITING CHECK =================
    // Before rendering, check if valid output already exists for this clip and version
    const existingClip = dbRepo.getClipById(input.clipId) as any;
    const candidatePath = existingClip?.edited_clip_path || finalVideoPath;

    if (
      fs.existsSync(candidatePath) &&
      fs.statSync(candidatePath).size > 50000 &&
      existingClip?.status === 'rendered'
    ) {
      try {
        const val = ffmpegCore.validateRenderedVideo(candidatePath, input.duration);
        if (val.isValid) {
          console.log(`[VideoEditingAgent] ✓ Reusing existing completed 9:16 vertical short for ${input.clipId}: ${candidatePath}`);
          return {
            clipId: input.clipId,
            finalVideoPath: candidatePath,
            resolution: '1080x1920',
            duration: val.duration,
            fps: val.fps || 30,
            isValid: true,
            meanVolumeDb: val.meanVolumeDb,
            reused: true,
          };
        }
      } catch (err: any) {
        console.warn(`[VideoEditingAgent] Existing file validation check note:`, err.message);
      }
    }

    console.log(`[VideoEditingAgent] Rendering 9:16 vertical short for ${input.clipId} (version ${editingVersion})...`);
    console.log(`[VideoEditingAgent] Layout: ${input.layoutMode || 'blurred_background'} | Source: ${input.rawClipPath}`);

    // Programmatic 9:16 Vertical Composition
    ffmpegCore.renderVerticalShort({
      sourceClip: input.rawClipPath,
      outputPath: finalVideoPath,
      duration: input.duration,
      layoutMode: input.layoutMode || 'blurred_background',
      cropX: input.cropX ?? 0.5,
      zoomScale: input.zoomScale ?? 1.05,
      memeOverlayPath: input.memeConfig?.selectedMeme?.filePath,
      memeStart: input.memeConfig?.placementTimestamp,
      memeDuration: input.memeConfig?.duration,
      bgmPath: input.musicConfig?.selectedMusic?.filePath,
      bgmVolume: input.musicConfig?.volume ?? 0.18,
      sfxEvents: input.sfxConfig?.sfxEvents,
      subtitleAssPath: input.subtitleConfig?.assFilePath,
    });

    // Mandatory Post-Render Validation Check
    const validation = ffmpegCore.validateRenderedVideo(finalVideoPath, input.duration);

    if (!validation.isValid) {
      console.error(`[VideoEditingAgent] ❌ Validation FAILED for ${input.clipId}:`, validation.errors);
      
      dbRepo.saveGeneratedClip({
        id: input.clipId,
        projectId,
        highlightId: input.highlightId || existingClip?.highlight_id || input.clipId,
        sourceVideoId: input.sourceVideoId || existingClip?.source_video_id,
        title: `GTA 6 Highlight (${input.duration}s Vertical Short) [FAILED]`,
        duration: input.duration,
        outputPath: finalVideoPath,
        outputFilePath: finalVideoPath,
        status: 'failed',
        processingStatus: 'failed',
        resolution: `${validation.width}x${validation.height}`,
        fps: validation.fps || 30,
      });

      throw new Error(`Rendered video failed quality verification: ${validation.errors.join('; ')}`);
    }

    console.log(`[VideoEditingAgent] ✓ Render passed validation! Duration: ${validation.duration.toFixed(1)}s, Audio Mean: ${validation.meanVolumeDb}dB`);

    // Save validated clip in database
    dbRepo.saveGeneratedClip({
      id: input.clipId,
      projectId,
      highlightId: input.highlightId || existingClip?.highlight_id || input.clipId,
      sourceVideoId: input.sourceVideoId || existingClip?.source_video_id,
      title: `GTA 6 Highlight (${input.duration.toFixed(1)}s Vertical Short)`,
      duration: validation.duration,
      outputPath: finalVideoPath,
      outputFilePath: finalVideoPath,
      status: 'rendered',
      processingStatus: 'rendered',
      resolution: '1080x1920',
      fps: validation.fps || 30,
      rawClipPath: input.rawClipPath,
      editedClipPath: finalVideoPath,
      editingVersion,
    });

    return {
      clipId: input.clipId,
      finalVideoPath,
      resolution: '1080x1920',
      duration: validation.duration,
      fps: validation.fps || 30,
      isValid: true,
      meanVolumeDb: validation.meanVolumeDb,
      reused: false,
    };
  }
}
