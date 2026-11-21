import { BaseAgent } from './base-agent.ts';
import { ffmpegCore } from '../lib/ffmpeg-core.ts';
import { dbRepo } from '../db/repository.ts';
import type { QualityAssuranceReport } from '../types/index.ts';

export class QualityAssuranceAgent extends BaseAgent<{ clipId: string; videoPath: string }, QualityAssuranceReport> {
  readonly id = 'agent_10_qa';
  readonly name = 'Quality Assurance Agent';
  readonly role = 'Black Frame, Audio Peak & Aspect Ratio Audit';

  protected async run(projectId: string, input: { clipId: string; videoPath: string }): Promise<QualityAssuranceReport> {
    const validation = ffmpegCore.validateRenderedVideo(input.videoPath);
    const audioClipping = ffmpegCore.checkAudioClipping(input.videoPath);

    const resolutionCheck = validation.width === 1080 && validation.height === 1920;
    const aspectRatioCheck = Math.abs(validation.width / validation.height - 9 / 16) < 0.02;

    const recommendations: string[] = [];
    let qaScore = 100;

    if (!resolutionCheck) {
      qaScore -= 20;
      recommendations.push('Resolution is not 1080x1920; re-encode with standard vertical scaling');
    }
    if (!aspectRatioCheck) {
      qaScore -= 20;
      recommendations.push('Aspect ratio violates 9:16 vertical standards');
    }
    if (validation.isBlackScreen) {
      qaScore -= 40;
      recommendations.push('Black frames detected in video stream; original gameplay missing');
    }
    if (validation.isSilentAudio) {
      qaScore -= 40;
      recommendations.push('Original streamer voice is inaudible or missing from audio stream');
    }
    if (audioClipping) {
      qaScore -= 10;
      recommendations.push('Audio clipping near 0dB; decrease SFX or BGM volume');
    }

    if (validation.errors.length > 0) {
      recommendations.push(...validation.errors);
    }

    const passed = qaScore >= 80 && validation.isValid;

    const report: QualityAssuranceReport = {
      clipId: input.clipId,
      qaScore: Math.max(0, qaScore),
      passed,
      resolutionCheck,
      aspectRatioCheck,
      audioClippingDetected: audioClipping,
      blackFramesDetected: validation.isBlackScreen,
      subtitleSyncOffsetMs: 0,
      openingHookGrade: qaScore >= 90 ? 'A+' : qaScore >= 80 ? 'A' : qaScore >= 70 ? 'B' : 'Fail',
      recommendations,
    };

    dbRepo.saveQualityReport(report);

    return report;
  }
}
