import { BaseAgent } from '../../agents/base-agent.ts';
import { CAPTION_PRESETS, newId, type AspectRatio, type EditDoc, type Segment } from '../../lib/render/edit-doc.ts';
import type { TimeRange } from '../../lib/media/ff.ts';
import type { AgentContext, TranscriptSegment } from '../context.ts';
import type { Highlight } from './highlight-detection-agent.ts';

export interface ShortsGenerationInput {
  ctx: AgentContext;
  highlights: Highlight[];
  silences: TimeRange[];
  transcript: TranscriptSegment[];
  sourceWidth: number;
  sourceHeight: number;
  aspect: AspectRatio;
  captionPreset: string;
  removeDeadAir: boolean;
}

export interface GeneratedShort {
  highlight: Highlight;
  edit: EditDoc;
  transcript: string;
}

/** Split [start,end] around internal silences longer than `minGap`, keeping `pad` seconds of breathing room. Exported for tests. */
export function removeDeadAir(start: number, end: number, silences: TimeRange[], minGap = 1.2, pad = 0.25): Array<{ start: number; end: number }> {
  const cuts = silences
    .filter((s) => s.end - s.start >= minGap && s.start > start + 0.5 && s.end < end - 0.5)
    .map((s) => ({ start: s.start + pad, end: s.end - pad }))
    .filter((s) => s.end > s.start);
  const parts: Array<{ start: number; end: number }> = [];
  let cur = start;
  for (const c of cuts) {
    if (c.start - cur >= 0.6) parts.push({ start: cur, end: c.start });
    cur = Math.max(cur, c.end);
  }
  if (end - cur >= 0.6) parts.push({ start: cur, end });
  if (parts.length === 0 || parts.length > 12) return [{ start, end }];
  return parts;
}

export function defaultEditDoc(p: { segments: Array<{ start: number; end: number }>; aspect: AspectRatio; captionPreset: string; sourceWidth: number; sourceHeight: number }): EditDoc {
  const style = CAPTION_PRESETS[p.captionPreset] || CAPTION_PRESETS.bold_pop;
  const segments: Segment[] = p.segments.map((s) => ({ id: newId('seg'), start: Math.round(s.start * 1000) / 1000, end: Math.round(s.end * 1000) / 1000, speed: 1 }));
  const sourceAr = p.sourceWidth / Math.max(1, p.sourceHeight);
  const targetAr = p.aspect === '9:16' ? 9 / 16 : p.aspect === '1:1' ? 1 : 16 / 9;
  // Very wide sources (ultrawide gameplay) lose too much in a vertical crop; frame them over a blurred fill instead.
  const mode = Math.abs(sourceAr - targetAr) < 0.05 ? 'fit' : sourceAr / targetAr > 3.4 ? 'blur' : 'crop';
  return {
    version: 1,
    segments,
    aspect: p.aspect,
    framing: { mode, focusX: 0.5, focusY: 0.5, zoom: 1 },
    audio: { sourceVolume: 1, music: null },
    captions: { enabled: true, style: { ...style }, cues: [] },
    texts: [],
  };
}

/**
 * Agent 4 — Shorts Generation.
 * Input: ranked highlights + silences + transcript. Processing: turns each highlight into an edit document —
 * removes internal dead air (silences > 1.2 s), keeps context around the moment, picks vertical framing that
 * suits the source aspect ratio. Output: one edit document per short (the same format the editor uses).
 */
export class ShortsGenerationAgent extends BaseAgent<ShortsGenerationInput, GeneratedShort[]> {
  readonly id = 'agent_shorts_generation';
  readonly name = 'Shorts Generation Agent';
  readonly role = 'Turn highlights into timed, framed short-form edits';

  protected async run(_projectId: string, input: ShortsGenerationInput): Promise<GeneratedShort[]> {
    const out: GeneratedShort[] = [];
    for (const h of input.highlights) {
      const parts = input.removeDeadAir ? removeDeadAir(h.start, h.end, input.silences) : [{ start: h.start, end: h.end }];
      const edit = defaultEditDoc({ segments: parts, aspect: input.aspect, captionPreset: input.captionPreset, sourceWidth: input.sourceWidth, sourceHeight: input.sourceHeight });
      const transcript = input.transcript.filter((t) => t.end > h.start && t.start < h.end).map((t) => t.text).join(' ');
      out.push({ highlight: h, edit, transcript });
    }
    input.ctx.progress(1, `${out.length} short${out.length === 1 ? '' : 's'} laid out`);
    return out;
  }
}
