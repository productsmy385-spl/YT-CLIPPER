import fs from 'node:fs';
import { BaseAgent } from '../../agents/base-agent.ts';
import { probe, detectBlackSegments, detectSilences, verifyDecodable } from '../../lib/media/ff.ts';
import { cuesOnOutput, outputSize, totalOutputDuration, type EditDoc } from '../../lib/render/edit-doc.ts';
import type { AgentContext } from '../context.ts';

/** sourceAudible: the source sections used by this edit contain audible sound (so silent output = a bug). */
export interface QcInput { ctx: AgentContext; outputPath: string; edit: EditDoc; sourceAudible: boolean }
export interface QcCheck { name: string; ok: boolean; detail: string; severity: 'error' | 'warning' }
export interface QcReport { passed: boolean; checks: QcCheck[]; checkedAt: string }

/**
 * Agent 6 — Quality Control.
 * Input: a rendered MP4 and the edit document it came from. Processing: inspects the actual file — container
 * decodes cleanly, duration matches the edit, resolution matches the aspect ratio, audio and video streams are
 * the same length (sync), black-frame ratio, audio not silent, caption cues inside the clip and non-overlapping.
 * Output: pass/fail with every check. A failed report rejects the output (the short is marked failed).
 */
export class QualityControlAgent extends BaseAgent<QcInput, QcReport> {
  readonly id = 'agent_quality_control';
  readonly name = 'Quality Control Agent';
  readonly role = 'Validate rendered shorts and reject broken outputs';

  protected async run(_projectId: string, { ctx, outputPath, edit, sourceAudible }: QcInput): Promise<QcReport> {
    const checks: QcCheck[] = [];
    const add = (name: string, ok: boolean, detail: string, severity: 'error' | 'warning' = 'error') => checks.push({ name, ok, detail, severity });

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 10_000) {
      add('Output file', false, 'Rendered file is missing or empty.');
      return { passed: false, checks, checkedAt: new Date().toISOString() };
    }
    const p = await probe(outputPath);
    const expected = totalOutputDuration(edit);
    const { width, height } = outputSize(edit.aspect);

    add('Video stream', p.hasVideo && p.videoCodec === 'h264', `codec ${p.videoCodec || 'none'}`);
    add('Audio stream', p.hasAudio && p.audioCodec === 'aac', `codec ${p.audioCodec || 'none'}`);
    add('Duration', Math.abs(p.duration - expected) <= 0.35, `${p.duration.toFixed(2)}s rendered vs ${expected.toFixed(2)}s expected`);
    add('Resolution', p.width === width && p.height === height, `${p.width}x${p.height} (expected ${width}x${height})`);
    const vd = p.videoDuration ?? p.duration;
    const ad = p.audioDuration ?? p.duration;
    add('Audio/video sync', Math.abs(vd - ad) <= 0.15, `video ${vd.toFixed(2)}s, audio ${ad.toFixed(2)}s`);

    const decodeError = await verifyDecodable(outputPath, ctx.signal);
    add('Decodes cleanly', !decodeError, decodeError || 'no decode errors');

    const black = await detectBlackSegments(outputPath, 0.4, ctx.signal);
    const blackSec = black.reduce((a, b) => a + (b.end - b.start), 0);
    add('Black frames', blackSec <= p.duration * 0.25, `${blackSec.toFixed(1)}s of black frames`);
    if (blackSec > 0.8 && blackSec <= p.duration * 0.25) add('Black frames (minor)', false, `${blackSec.toFixed(1)}s black stretch present`, 'warning');

    const expectSound = (sourceAudible && edit.audio.sourceVolume > 0) || Boolean(edit.audio.music && edit.audio.music.volume > 0);
    if (expectSound) {
      const silent = await detectSilences(outputPath, -55, 0.5, ctx.signal);
      const silentSec = silent.reduce((a, s) => a + (s.end - s.start), 0);
      add('Audio present', silentSec < p.duration * 0.9, `${silentSec.toFixed(1)}s of near-silence (source sections are audible)`);
    } else {
      add('Audio present', true, 'source sections are silent; silent output is expected', 'warning');
    }

    if (edit.captions.enabled) {
      const cues = cuesOnOutput(edit);
      let bad = 0;
      for (let i = 0; i < cues.length; i++) {
        const c = cues[i];
        if (c.outStart < -0.01 || c.outEnd > expected + 0.05 || c.outEnd - c.outStart < 0.1) bad++;
        if (i > 0 && c.outStart < cues[i - 1].outEnd - 0.02) bad++;
      }
      add('Subtitle timing', bad === 0, `${cues.length} cues, ${bad} timing problems`);
    }

    const passed = checks.every((c) => c.ok || c.severity === 'warning');
    ctx.progress(1, passed ? 'Quality check passed' : `Quality check failed: ${checks.filter((c) => !c.ok && c.severity === 'error').map((c) => c.name).join(', ')}`);
    return { passed, checks, checkedAt: new Date().toISOString() };
  }
}
