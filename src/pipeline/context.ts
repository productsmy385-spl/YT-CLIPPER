import type { StageKey } from './stages.ts';

/** Passed to every agent: where to work, how to report progress, and how to notice cancellation. */
export interface AgentContext {
  projectId: string;
  workDir: string;
  signal: AbortSignal;
  /** Report progress inside the current stage (0..1) with a human-readable message. */
  progress: (fraction: number, message: string) => void;
  /** Move the visible pipeline to another stage (agents that span stages use this). */
  stage: (key: StageKey, message: string) => void;
}

export interface AiUsage {
  used: boolean;
  model?: string;
  error?: string;
}

export interface TimedEvent {
  start: number;
  end: number;
  type: string;
  description: string;
  intensity: number; // 1..10
  source: 'visual' | 'audio';
}

export interface TranscriptWord { start: number; end: number; text: string }
export interface TranscriptSegment { start: number; end: number; text: string; words: TranscriptWord[] }

export function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new Error('Cancelled');
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

/** Run async tasks with a concurrency limit, preserving order of results. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
