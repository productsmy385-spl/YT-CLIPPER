/** Processing stages, in execution order. Shared by the backend pipeline and the progress UI. */
export const STAGES = [
  { n: 1, key: 'inspecting', name: 'Inspecting video', weight: 1 },
  { n: 2, key: 'acquiring', name: 'Acquiring video', weight: 10 },
  { n: 3, key: 'validating', name: 'Validating media', weight: 4 },
  { n: 4, key: 'extracting_audio', name: 'Extracting audio', weight: 4 },
  { n: 5, key: 'transcribing', name: 'Generating transcript', weight: 14 },
  { n: 6, key: 'analyzing_scenes', name: 'Analyzing scenes', weight: 16 },
  { n: 7, key: 'detecting_highlights', name: 'Detecting highlights', weight: 6 },
  { n: 8, key: 'generating_shorts', name: 'Generating shorts', weight: 2 },
  { n: 9, key: 'creating_captions', name: 'Creating captions', weight: 2 },
  { n: 10, key: 'rendering', name: 'Rendering', weight: 36 },
  { n: 11, key: 'quality_check', name: 'Quality checking', weight: 4 },
  { n: 12, key: 'completed', name: 'Completed', weight: 1 },
] as const;

export type StageKey = (typeof STAGES)[number]['key'];

const TOTAL = STAGES.reduce((a, s) => a + s.weight, 0);

/** Overall percentage when `key` is `fraction` (0..1) done and every earlier stage is complete. */
export function overallProgress(key: StageKey, fraction: number): number {
  let acc = 0;
  for (const s of STAGES) {
    if (s.key === key) return Math.min(100, Math.round(((acc + s.weight * Math.max(0, Math.min(1, fraction))) / TOTAL) * 100));
    acc += s.weight;
  }
  return 0;
}

export const DURATION_PRESETS = [15, 30, 45, 60] as const;
