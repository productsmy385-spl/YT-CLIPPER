import { BaseAgent } from '../../agents/base-agent.ts';
import { geminiConfigured, geminiModel, generateJson } from '../../lib/ai/gemini.ts';
import { fmtTime, type AgentContext, type AiUsage, type TimedEvent, type TranscriptSegment } from '../context.ts';
import type { TimeRange } from '../../lib/media/ff.ts';

export interface HighlightInput {
  ctx: AgentContext;
  duration: number;
  sceneCuts: number[];
  blackSegments: TimeRange[];
  visualEvents: TimedEvent[];
  audioEvents: TimedEvent[];
  loudness: number[];
  transcript: TranscriptSegment[];
  targetDurations: number[]; // seconds
  maxHighlights: number;
  /** Restrict to a window (used when regenerating one short). */
  window?: { start: number; end: number };
}

export interface Highlight {
  start: number;
  end: number;
  targetDuration: number;
  title: string;
  description: string;
  category: string;
  reason: string;
  score: number;
  keywords: string[];
  method: 'ai' | 'signal';
}

export interface HighlightOutput { highlights: Highlight[]; excitement: number[]; ai: AiUsage }

const CATEGORIES = ['funny', 'fail', 'action', 'chase', 'crash', 'stunt', 'unexpected', 'reaction', 'clutch', 'story', 'other'];

const schema = {
  type: 'OBJECT',
  properties: {
    highlights: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          start: { type: 'NUMBER' },
          end: { type: 'NUMBER' },
          title: { type: 'STRING' },
          description: { type: 'STRING' },
          category: { type: 'STRING', enum: CATEGORIES },
          reason: { type: 'STRING' },
          score: { type: 'INTEGER' },
          keywords: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['start', 'end', 'title', 'description', 'category', 'reason', 'score', 'keywords'],
      },
    },
  },
  required: ['highlights'],
};

/** Per-second excitement 0..1 from measured loudness, scene-cut density and detected events. Exported for tests. */
export function excitementCurve(i: Pick<HighlightInput, 'duration' | 'loudness' | 'sceneCuts' | 'visualEvents' | 'audioEvents' | 'blackSegments'>): number[] {
  const n = Math.max(1, Math.ceil(i.duration));
  const curve = new Array(n).fill(0);
  const loud = i.loudness.slice(0, n).filter((v) => v > -89);
  if (loud.length > 5) {
    const mean = loud.reduce((a, b) => a + b, 0) / loud.length;
    const sd = Math.sqrt(loud.reduce((a, b) => a + (b - mean) ** 2, 0) / loud.length) || 1;
    for (let s = 0; s < n; s++) {
      const v = i.loudness[s] ?? -90;
      curve[s] += Math.max(0, Math.min(2.5, (v - mean) / sd)) * 0.25;
    }
  }
  for (const c of i.sceneCuts) {
    for (let s = Math.max(0, Math.floor(c) - 2); s <= Math.min(n - 1, Math.floor(c) + 2); s++) curve[s] += 0.06;
  }
  for (const e of [...i.visualEvents, ...i.audioEvents]) {
    const w = e.type === 'dead_time' ? -0.6 : (e.intensity / 10) * (e.source === 'audio' ? 0.35 : 0.5);
    for (let s = Math.max(0, Math.floor(e.start)); s <= Math.min(n - 1, Math.ceil(e.end)); s++) curve[s] += w;
  }
  for (const b of i.blackSegments) {
    for (let s = Math.max(0, Math.floor(b.start)); s <= Math.min(n - 1, Math.ceil(b.end)); s++) curve[s] -= 1;
  }
  const max = Math.max(0.001, ...curve);
  return curve.map((v) => Math.max(0, v) / max);
}

/** Move boundaries onto natural edges: sentence starts/ends and scene cuts, without breaking the duration target. */
export function snapBoundaries(start: number, end: number, duration: number, transcript: TranscriptSegment[], sceneCuts: number[]): { start: number; end: number } {
  let s = start;
  let e = end;
  // Never start mid-sentence: move back to the start of a sentence in progress (max 3 s).
  const inSentence = transcript.find((t) => t.start < s && t.end > s + 0.2);
  if (inSentence && s - inSentence.start <= 3) s = inSentence.start;
  else {
    const cut = sceneCuts.filter((c) => c <= s && s - c <= 1.5).pop();
    if (cut !== undefined) s = cut;
  }
  // Never end mid-sentence: extend to the end of the sentence in progress (max 3 s).
  const endSentence = transcript.find((t) => t.start < e - 0.2 && t.end > e);
  if (endSentence && endSentence.end - e <= 3) e = endSentence.end + 0.25;
  s = Math.max(0, Math.round(s * 100) / 100);
  e = Math.min(duration, Math.round(e * 100) / 100);
  return { start: s, end: e };
}

function overlap(a: { start: number; end: number }, b: { start: number; end: number }) {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

function closestTarget(d: number, targets: number[]) {
  return targets.reduce((best, t) => (Math.abs(t - d) < Math.abs(best - d) ? t : best), targets[0]);
}

/**
 * Agent 3 — Highlight Detection.
 * Input: everything agents 1 and 2 measured. Processing: builds a per-second excitement curve from real signals,
 * then asks Gemini (text only: transcript, events, loudness peaks) to choose and rank entertaining moments that fit
 * the requested durations. Every boundary is then validated and snapped to sentence/scene edges.
 * Without AI it selects the highest-energy windows and says so in the reason.
 * Output: ranked highlights with accurate start/end, title, description, category, reason, keywords.
 */
export class HighlightDetectionAgent extends BaseAgent<HighlightInput, HighlightOutput> {
  readonly id = 'agent_highlight_detection';
  readonly name = 'Highlight Detection Agent';
  readonly role = 'Find, rank and time the most entertaining moments';

  protected async run(_projectId: string, input: HighlightInput): Promise<HighlightOutput> {
    const { ctx, duration, transcript, sceneCuts } = input;
    const targets = input.targetDurations.filter((d) => d >= 5).sort((a, b) => a - b);
    if (!targets.length) throw new Error('No valid target duration.');
    const win = input.window || { start: 0, end: duration };
    const excitement = excitementCurve(input);
    const ai: AiUsage = { used: false };
    let candidates: Highlight[] = [];

    if (geminiConfigured()) {
      ctx.progress(0.1, 'AI is ranking the best moments');
      try {
        candidates = await this.aiCandidates(input, excitement, targets, win);
        ai.used = true;
        ai.model = geminiModel();
      } catch (err: any) {
        if (ctx.signal.aborted) throw err;
        ai.error = `AI ranking failed: ${err.message}`;
        console.error(`[HighlightDetectionAgent] ${ai.error}`);
      }
    } else {
      ai.error = 'GEMINI_API_KEY not configured; using measured signals only.';
    }

    if (!candidates.length) candidates = this.signalCandidates(input, excitement, targets, win);

    // Validate, snap, de-duplicate.
    const out: Highlight[] = [];
    for (const c of candidates.sort((a, b) => b.score - a.score)) {
      let start = Math.max(win.start, Math.min(c.start, duration));
      let end = Math.min(win.end, Math.max(c.end, start + 1));
      const target = closestTarget(end - start, targets);
      // Enforce the requested length (±25 %), expanding/contracting around the centre.
      const len = end - start;
      if (len < target * 0.75 || len > target * 1.25) {
        const mid = (start + end) / 2;
        start = Math.max(win.start, mid - target / 2);
        end = Math.min(win.end, start + target);
        start = Math.max(win.start, end - target);
      }
      const snapped = snapBoundaries(start, end, duration, transcript, sceneCuts);
      if (snapped.end - snapped.start < Math.min(5, target * 0.5)) continue;
      const blackOverlap = input.blackSegments.reduce((a, b) => a + overlap(b, snapped), 0);
      if (blackOverlap > (snapped.end - snapped.start) * 0.3) continue;
      if (out.some((o) => overlap(o, snapped) > 0.5 * Math.min(o.end - o.start, snapped.end - snapped.start))) continue;
      out.push({ ...c, ...snapped, targetDuration: target });
      if (out.length >= input.maxHighlights) break;
    }

    ctx.progress(1, `${out.length} highlight${out.length === 1 ? '' : 's'} selected`);
    return { highlights: out, excitement, ai };
  }

  private async aiCandidates(input: HighlightInput, excitement: number[], targets: number[], win: { start: number; end: number }): Promise<Highlight[]> {
    const inWin = (t: { start: number; end: number }) => t.end > win.start && t.start < win.end;
    const lines: string[] = [];
    const transcript = input.transcript.filter(inWin);
    if (transcript.length) {
      lines.push('TRANSCRIPT (start-end seconds: text):');
      let budget = 120000;
      for (const t of transcript) {
        const l = `${t.start.toFixed(1)}-${t.end.toFixed(1)}: ${t.text}`;
        budget -= l.length;
        if (budget < 0) break;
        lines.push(l);
      }
    } else lines.push('TRANSCRIPT: (no speech detected)');
    const ev = [...input.visualEvents, ...input.audioEvents].filter(inWin).sort((a, b) => a.start - b.start);
    lines.push('', 'DETECTED EVENTS (start-end seconds [source/type, intensity 1-10]: description):');
    for (const e of ev.slice(0, 1500)) lines.push(`${e.start.toFixed(1)}-${e.end.toFixed(1)} [${e.source}/${e.type}, ${e.intensity}]: ${e.description}`);
    const peaks = excitement
      .map((v, s) => ({ v, s }))
      .filter((p) => p.s >= win.start && p.s <= win.end && p.v > 0.6)
      .sort((a, b) => b.v - a.v)
      .slice(0, 60)
      .sort((a, b) => a.s - b.s)
      .map((p) => `${p.s}s`);
    lines.push('', `MEASURED ENERGY PEAKS (loud audio / fast cuts): ${peaks.join(', ') || 'none'}`);

    const ask = input.maxHighlights;
    const res = await generateJson<{ highlights: any[] }>({
      schema,
      temperature: 0.4,
      system:
        'You are a senior short-form video editor for gaming content. You pick moments that make viewers stop scrolling: funny interactions, ' +
        'fails, unexpected events, intense action, strong reactions. You only use evidence supplied to you and never invent events.',
      parts: [
        {
          text:
            `The video window runs from ${win.start.toFixed(1)}s to ${win.end.toFixed(1)}s (total video length ${input.duration.toFixed(1)}s).\n` +
            `Choose up to ${ask} non-overlapping highlights. Each must last close to one of these durations: ${targets.join(', ')} seconds (within ±20%).\n` +
            `Start a clip just before the setup of the moment (never mid-sentence) and end right after the payoff or reaction. Avoid dead time.\n` +
            `For each give: start, end (seconds, absolute), a punchy honest title under 60 characters, a one-sentence description of what happens, ` +
            `a category, the reason it works citing the evidence (quote or event), a score 1-100 for how entertaining it is, and up to 6 keywords ` +
            `copied exactly from the transcript that deserve emphasis in captions (empty if no speech). Rank best first.\n\n` +
            lines.join('\n'),
        },
      ],
    });
    return (res.highlights || [])
      .map((h) => ({
        start: Number(h.start),
        end: Number(h.end),
        targetDuration: 0,
        title: String(h.title || '').slice(0, 80) || 'Highlight',
        description: String(h.description || '').slice(0, 400),
        category: CATEGORIES.includes(h.category) ? h.category : 'other',
        reason: String(h.reason || '').slice(0, 400),
        score: Math.max(1, Math.min(100, Math.round(Number(h.score) || 50))),
        keywords: Array.isArray(h.keywords) ? h.keywords.map(String).slice(0, 6) : [],
        method: 'ai' as const,
      }))
      .filter((h) => Number.isFinite(h.start) && Number.isFinite(h.end) && h.end > h.start);
  }

  /** Highest-energy windows from measured signals (used when AI is unavailable). */
  private signalCandidates(input: HighlightInput, excitement: number[], targets: number[], win: { start: number; end: number }): Highlight[] {
    const out: Highlight[] = [];
    const prefix = [0];
    for (const v of excitement) prefix.push(prefix[prefix.length - 1] + v);
    const mean = (a: number, b: number) => (prefix[Math.min(prefix.length - 1, b)] - prefix[Math.max(0, a)]) / Math.max(1, b - a);
    for (const target of targets) {
      const windows: Array<{ s: number; score: number }> = [];
      for (let s = Math.floor(win.start); s + target <= Math.ceil(win.end); s++) windows.push({ s, score: mean(s, s + target) });
      windows.sort((a, b) => b.score - a.score);
      for (const w of windows) {
        const r = { start: w.s, end: w.s + target };
        if (out.some((o) => overlap(o, r) > 0)) continue;
        const events = [...input.visualEvents, ...input.audioEvents].filter((e) => overlap(e, r) > 0);
        const words = input.transcript.filter((t) => overlap(t, r) > 0).map((t) => t.text).join(' ');
        out.push({
          ...r,
          targetDuration: target,
          title: `Moment at ${fmtTime(r.start)}`,
          description: events[0]?.description || (words ? `"${words.slice(0, 140)}${words.length > 140 ? '…' : ''}"` : 'High-energy section of the video.'),
          category: events[0]?.type || 'other',
          reason: `Selected from measured signals (loudness and scene changes); AI ranking was unavailable.`,
          score: Math.round(w.score * 100),
          keywords: [],
          method: 'signal',
        });
        if (out.filter((o) => o.targetDuration === target).length >= input.maxHighlights) break;
      }
    }
    return out;
  }
}
