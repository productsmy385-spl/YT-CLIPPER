import { BaseAgent } from './base-agent.ts';
import { dbRepo } from '../db/repository.ts';
import { fullVideoAnalyzer } from '../lib/full-video-analyzer.ts';
import { getProjectStoragePaths } from '../lib/app-paths.ts';
import fs from 'node:fs';
import path from 'node:path';
import type { CandidateHighlight, DurationPreset } from '../lib/full-video-analyzer.ts';
import type { VideoAnalysisResult, DetectedHighlight, HighlightCategory } from '../types/index.ts';

export class HighlightDetectionAgent extends BaseAgent<
  { analysis: VideoAnalysisResult; durationPreset?: DurationPreset; sourceVideoId?: string },
  DetectedHighlight[]
> {
  readonly id = 'agent_02_highlight';
  readonly name = 'Highlight Detection Agent';
  readonly role = 'Long-Form Viral Clip Extraction (90-120s Default) & Story Arc Assembly';

  protected async run(
    projectId: string,
    input: { analysis: VideoAnalysisResult; durationPreset?: DurationPreset; sourceVideoId?: string }
  ): Promise<DetectedHighlight[]> {
    const { analysis, durationPreset = '90-120s', sourceVideoId } = input;
    const totalDuration = analysis.duration;
    const storagePaths = getProjectStoragePaths(projectId);

    console.log(
      `[HighlightDetectionAgent] Evaluating full-video timeline (${totalDuration.toFixed(
        1
      )}s) for top story-based highlights (Preset: ${durationPreset})...`
    );

    // Use fullVideoAnalyzer to extract sequence-combined candidate highlights across ALL segments
    const candidateHighlights = fullVideoAnalyzer.detectBestHighlights(
      projectId,
      totalDuration,
      {
        segments: (analysis as any).segmentedAnalysis || [],
        allAudioPeaks: analysis.audioPeaks || [],
        allSceneCuts: analysis.scenes?.map((s) => s.endTime) || [],
      },
      durationPreset
    );

    const highlights: DetectedHighlight[] = candidateHighlights.map((c, idx) => {
      let memeMood: 'laugh' | 'shock' | 'fail' | 'rage' | 'triumph' = 'laugh';
      let musicGenre: 'phonk' | 'action' | 'comedy' | 'suspense' | 'synthwave' = 'phonk';

      if (c.category.includes('police') || c.category.includes('driving') || c.category.includes('stunt')) {
        musicGenre = 'phonk';
        memeMood = 'shock';
      } else if (c.category.includes('fail') || c.category.includes('npc')) {
        musicGenre = 'comedy';
        memeMood = 'fail';
      } else if (c.category.includes('action') || c.category.includes('explosion')) {
        musicGenre = 'action';
        memeMood = 'shock';
      } else if (c.category.includes('cinematic')) {
        musicGenre = 'synthwave';
        memeMood = 'triumph';
      }

      return {
        id: `hl_${projectId}_${sourceVideoId || 'sv'}_${idx + 1}`,
        projectId,
        sourceVideoId,
        category: c.category as HighlightCategory,
        categoryLabel: c.categoryLabel,
        entertainmentScore: c.entertainmentScore, // Viral Potential Score (1-100)
        startTime: c.startTime,
        endTime: c.endTime,
        duration: c.duration,
        hookStrength: c.metrics?.hookStrength || Math.min(100, c.entertainmentScore + 2),
        hookReason: c.hookDescription,
        peakEvent: c.peakMoment,
        suggestedMemeMood: memeMood,
        suggestedMusicGenre: musicGenre,
        selectedForExport: true,
      };
    });

    console.log(
      `[HighlightDetectionAgent] ✓ Ranked and selected ${highlights.length} top long-form viral highlights across complete footage.`
    );

    // Persist to database
    dbRepo.saveHighlights(highlights);

    // Save project-specific highlights artifact in storage/projects/<projectId>/analysis/
    try {
      fs.writeFileSync(
        path.join(storagePaths.analysisDir, 'highlights.json'),
        JSON.stringify(highlights, null, 2),
        'utf-8'
      );
    } catch (err: any) {
      console.warn(`[HighlightDetectionAgent] Could not write highlights.json:`, err.message);
    }

    return highlights;
  }
}
