import { BaseAgent } from './base-agent.ts';
import { ffmpegCore } from '../lib/ffmpeg-core.ts';
import { dbRepo } from '../db/repository.ts';
import path from 'node:path';
import fs from 'node:fs';
import { getProjectStoragePaths } from '../lib/app-paths.ts';
import type { DetectedHighlight } from '../types/index.ts';

export interface ExtractedClipResult {
  clipId: string;
  highlightId: string;
  sourceStart: number;
  sourceEnd: number;
  duration: number;
  rawClipPath: string;
  title: string;
  reused?: boolean;
}

export class ClipExtractionAgent extends BaseAgent<{ sourceVideoPath: string; highlights: DetectedHighlight[]; sourceVideoId?: string; sourceChecksum?: string; jobId?: string; extractionVersion?: number }, ExtractedClipResult[]> {
  readonly id = 'agent_03_extractor';
  readonly name = 'Clip Extraction Agent';
  readonly role = 'Idempotent Intelligent Boundary Trimming';

  protected async run(
    projectId: string,
    input: { sourceVideoPath: string; highlights: DetectedHighlight[]; sourceVideoId?: string; sourceChecksum?: string; jobId?: string; extractionVersion?: number }
  ): Promise<ExtractedClipResult[]> {
    const results: ExtractedClipResult[] = [];
    const storagePaths = getProjectStoragePaths(projectId);
    const extractionVersion = input.extractionVersion || 1;
    const sourceVideoId = input.sourceVideoId || `sv_${projectId}`;

    // Verify source video file existence and integrity before trimming
    if (!fs.existsSync(input.sourceVideoPath)) {
      throw new Error(`Source video not found on disk at: ${input.sourceVideoPath}`);
    }

    const probeMeta = ffmpegCore.probe(input.sourceVideoPath);
    if (!probeMeta || probeMeta.duration <= 0) {
      throw new Error(`Source video stream is empty or unreadable: ${input.sourceVideoPath}`);
    }

    console.log(`[ClipExtractionAgent] Source verified: ${path.basename(input.sourceVideoPath)} (${probeMeta.duration.toFixed(1)}s, ${probeMeta.width}x${probeMeta.height})`);

    for (let i = 0; i < input.highlights.length; i++) {
      const h = input.highlights[i];
      // Deterministic clip ID uniquely associated with project, highlight, and extraction version
      const clipId = `clip_${projectId}_${i + 1}_v${extractionVersion}`;
      const rawClipPath = path.join(storagePaths.extractedDir, `clip_${projectId}_${sourceVideoId}_hl${i + 1}_v${extractionVersion}_raw.mp4`);

      // Add 0.2s lead-in buffer to protect audio context, clamped to valid stream boundaries
      const safeStart = Number(Math.max(0, Math.min(h.startTime - 0.2, Math.max(0, probeMeta.duration - 1))).toFixed(1));
      const maxAvailDuration = Number(Math.max(1, probeMeta.duration - safeStart).toFixed(1));
      const safeDuration = Number(Math.min(h.duration, maxAvailDuration).toFixed(1));
      const safeEnd = Number((safeStart + safeDuration).toFixed(1));
      const title = `GTA 6: ${h.categoryLabel} #${i + 1}`;

      // ================= IDEMPOTENT EXTRACTION CHECK =================
      // Check whether an equivalent completed clip already exists within THIS project
      const existing = dbRepo.findEquivalentClip(projectId, h.id, extractionVersion);

      if (existing) {
        const existingPath = existing.raw_clip_path || existing.output_path || existing.output_file_path;
        if (
          existingPath &&
          fs.existsSync(existingPath) &&
          fs.statSync(existingPath).size > 10000 &&
          existing.project_id === projectId &&
          existingPath.includes(projectId)
        ) {
          console.log(`[ClipExtractionAgent] ✓ Reusing existing completed clip (${existing.id}) for highlight ${h.id} at [${safeStart}s–${safeEnd}s].`);
          results.push({
            clipId: existing.id,
            highlightId: h.id,
            sourceStart: existing.start_time !== undefined && existing.start_time !== null ? existing.start_time : safeStart,
            sourceEnd: existing.end_time !== undefined && existing.end_time !== null ? existing.end_time : safeEnd,
            duration: existing.duration || safeDuration,
            rawClipPath: existingPath,
            title: existing.title || title,
            reused: true,
          });
          continue;
        }
      }

      console.log(`[ClipExtractionAgent] Extracting Clip ${i + 1} from ${input.sourceVideoPath} (${safeStart}s - ${safeEnd}s) -> ${rawClipPath}`);
      await ffmpegCore.cutSegment(input.sourceVideoPath, safeStart, safeDuration, rawClipPath);

      dbRepo.saveGeneratedClip({
        id: clipId,
        projectId,
        highlightId: h.id,
        sourceVideoId,
        sourceChecksum: input.sourceChecksum,
        jobId: input.jobId,
        title,
        duration: safeDuration,
        startTime: safeStart,
        endTime: safeEnd,
        extractionVersion,
        editingVersion: 1,
        outputPath: rawClipPath,
        outputFilePath: rawClipPath,
        rawClipPath,
        status: 'extracted',
        processingStatus: 'extracted',
      });

      results.push({
        clipId,
        highlightId: h.id,
        sourceStart: safeStart,
        sourceEnd: safeEnd,
        duration: safeDuration,
        rawClipPath,
        title,
        reused: false,
      });
    }

    return results;
  }
}
