import { BaseAgent } from '../../agents/base-agent.ts';
import { newId, fontForText, type CaptionCue, type EditDoc } from '../../lib/render/edit-doc.ts';
import type { AgentContext, TranscriptSegment } from '../context.ts';

export interface CaptionInput {
  ctx: AgentContext;
  items: Array<{ key: string; edit: EditDoc; start: number; end: number; keywords: string[] }>;
  transcript: TranscriptSegment[];
}
export interface CaptionOutput { key: string; edit: EditDoc; cueCount: number; problemsFixed: number }

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

/** Group transcript words in [start,end] into short caption cues. Exported for tests. */
export function buildCues(transcript: TranscriptSegment[], start: number, end: number, keywords: string[], maxWords = 3, maxChars = 18): CaptionCue[] {
  const kw = new Set(keywords.flatMap((k) => k.split(/\s+/)).map(norm).filter(Boolean));
  const words = transcript
    .flatMap((s) => s.words)
    .filter((w) => w.end > start && w.start < end)
    .map((w) => ({ start: Math.max(w.start, start), end: Math.min(w.end, end), text: w.text, highlight: kw.has(norm(w.text)) || /\d/.test(w.text) }));
  const cues: CaptionCue[] = [];
  let cur: typeof words = [];
  const flush = () => {
    if (!cur.length) return;
    cues.push({ id: newId('cue'), start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.text).join(' '), words: cur });
    cur = [];
  };
  for (const w of words) {
    const prev = cur[cur.length - 1];
    const chars = cur.reduce((a, x) => a + x.text.length + 1, 0) + w.text.length;
    if (cur.length && (cur.length >= maxWords || chars > maxChars || (prev && w.start - prev.end > 0.6))) flush();
    cur.push(w);
    if (/[.!?,;:]$/.test(w.text)) flush();
  }
  flush();
  return cues;
}

/** Make cue timing valid: min 0.25 s, no overlaps, inside [start,end]. Returns number of fixes. */
export function validateCueTiming(cues: CaptionCue[], start: number, end: number): number {
  let fixes = 0;
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    if (c.start < start) { c.start = start; fixes++; }
    if (c.end > end) { c.end = end; fixes++; }
    if (c.end - c.start < 0.25) { c.end = Math.min(end, c.start + 0.25); fixes++; }
    const next = cues[i + 1];
    if (next && c.end > next.start) { c.end = next.start; fixes++; }
  }
  return fixes;
}

/**
 * Agent 5 — Captions.
 * Input: shorts + the real transcript. Processing: groups the spoken words inside each short into 1–3 word cues,
 * emphasises the highlight agent's keywords and numbers, validates timing. Output: caption cues in each edit
 * document (fully editable in the editor; style, position, animation are set there). If nothing was said,
 * captions are left empty — they are never invented.
 */
export class CaptionAgent extends BaseAgent<CaptionInput, CaptionOutput[]> {
  readonly id = 'agent_captions';
  readonly name = 'Caption Agent';
  readonly role = 'Synchronized, emphasised captions from the transcript';

  protected async run(_projectId: string, input: CaptionInput): Promise<CaptionOutput[]> {
    const out: CaptionOutput[] = [];
    for (const item of input.items) {
      const cues = buildCues(input.transcript, item.start, item.end, item.keywords);
      const fixes = validateCueTiming(cues, item.start, item.end);
      const allText = cues.map((c) => c.text).join(' ');
      const font = fontForText(allText, item.edit.captions.style.font);
      const base = item.edit.captions.style;
      // Indic scripts render visually smaller at the same point size as Latin display fonts.
      const style = font !== base.font ? { ...base, font, size: Math.round(base.size * 1.15), uppercase: false } : base;
      const edit: EditDoc = { ...item.edit, captions: { ...item.edit.captions, style, enabled: cues.length > 0 && item.edit.captions.enabled, cues } };
      out.push({ key: item.key, edit, cueCount: cues.length, problemsFixed: fixes });
    }
    input.ctx.progress(1, `Captions created (${out.reduce((a, o) => a + o.cueCount, 0)} cues)`);
    return out;
  }
}
