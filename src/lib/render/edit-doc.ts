/**
 * The edit document: the single editable description of a short. AI agents create one per highlight, the
 * editor modifies it, and the FFmpeg renderer turns it into an MP4. It is identical for YouTube and uploaded
 * sources. Pure data + pure functions: safe to import in the browser.
 *
 * Time bases:
 *  - segments and caption cues are in SOURCE seconds (so trimming/splitting never desyncs captions)
 *  - text overlays are in OUTPUT seconds (they belong to the finished short, not the source)
 */

export type AspectRatio = '9:16' | '16:9' | '1:1';
export type FramingMode = 'crop' | 'fit' | 'blur';
export type CaptionPosition = 'top' | 'middle' | 'bottom';
export type CaptionAnimation = 'none' | 'pop' | 'karaoke' | 'fade';
export type CaptionBackground = 'none' | 'box' | 'shadow';

export interface Segment { id: string; start: number; end: number; speed: number }

export interface CaptionWord { start: number; end: number; text: string; highlight?: boolean }
export interface CaptionCue { id: string; start: number; end: number; text: string; words: CaptionWord[] }

export interface CaptionStyle {
  font: string;
  size: number; // px at 1080 short-side
  color: string; // #RRGGBB
  highlightColor: string;
  outlineColor: string;
  background: CaptionBackground;
  position: CaptionPosition;
  animation: CaptionAnimation;
  uppercase: boolean;
}

export interface TextOverlay {
  id: string;
  text: string;
  start: number; // output seconds
  end: number;
  x: number; // 0..1 of frame width (centre)
  y: number; // 0..1 of frame height (centre)
  size: number;
  color: string;
  font: string;
  box: boolean;
}

export interface EditDoc {
  version: 1;
  segments: Segment[];
  aspect: AspectRatio;
  framing: { mode: FramingMode; focusX: number; focusY: number; zoom: number };
  audio: { sourceVolume: number; music: { trackId: string; volume: number; duck: boolean } | null };
  captions: { enabled: boolean; style: CaptionStyle; cues: CaptionCue[] };
  texts: TextOverlay[];
}

export const FONTS = ['Poppins ExtraBold', 'Poppins', 'Anton', 'Bebas Neue', 'Bangers', 'Noto Sans Telugu', 'Noto Sans Devanagari'] as const;

/** Latin display fonts have no Indic glyphs; pick a font that can actually draw the caption text. */
export function fontForText(text: string, preferred: string): string {
  if (/[ఀ-౿]/.test(text)) return 'Noto Sans Telugu';
  if (/[ऀ-ॿ]/.test(text)) return 'Noto Sans Devanagari';
  return preferred;
}

export const CAPTION_PRESETS: Record<string, CaptionStyle> = {
  bold_pop: { font: 'Poppins ExtraBold', size: 76, color: '#FFFFFF', highlightColor: '#FFD400', outlineColor: '#000000', background: 'shadow', position: 'bottom', animation: 'pop', uppercase: true },
  karaoke: { font: 'Poppins ExtraBold', size: 72, color: '#FFFFFF', highlightColor: '#2EE6A6', outlineColor: '#000000', background: 'shadow', position: 'bottom', animation: 'karaoke', uppercase: false },
  clean_box: { font: 'Poppins', size: 60, color: '#FFFFFF', highlightColor: '#FF5C8A', outlineColor: '#000000', background: 'box', position: 'bottom', animation: 'fade', uppercase: false },
  impact: { font: 'Anton', size: 92, color: '#FFFFFF', highlightColor: '#FF3B30', outlineColor: '#000000', background: 'shadow', position: 'middle', animation: 'pop', uppercase: true },
  comic: { font: 'Bangers', size: 88, color: '#FFF3B0', highlightColor: '#00C2FF', outlineColor: '#1A1A1A', background: 'shadow', position: 'top', animation: 'pop', uppercase: true },
};

export function outputSize(aspect: AspectRatio): { width: number; height: number } {
  if (aspect === '16:9') return { width: 1920, height: 1080 };
  if (aspect === '1:1') return { width: 1080, height: 1080 };
  return { width: 1080, height: 1920 };
}

export function segmentOutputDuration(s: Segment): number {
  return Math.max(0, (s.end - s.start) / (s.speed || 1));
}

export function totalOutputDuration(doc: Pick<EditDoc, 'segments'>): number {
  return doc.segments.reduce((a, s) => a + segmentOutputDuration(s), 0);
}

/** Map a source timestamp to output time, or null if that moment was cut out. */
export function sourceToOutput(doc: Pick<EditDoc, 'segments'>, t: number): number | null {
  let acc = 0;
  for (const s of doc.segments) {
    if (t >= s.start && t <= s.end) return acc + (t - s.start) / (s.speed || 1);
    acc += segmentOutputDuration(s);
  }
  return null;
}

/** Map output time back to a source timestamp (for the editor playhead). */
export function outputToSource(doc: Pick<EditDoc, 'segments'>, t: number): { segment: Segment; source: number } | null {
  let acc = 0;
  for (const s of doc.segments) {
    const d = segmentOutputDuration(s);
    if (t <= acc + d + 1e-6) return { segment: s, source: s.start + (t - acc) * (s.speed || 1) };
    acc += d;
  }
  const last = doc.segments[doc.segments.length - 1];
  return last ? { segment: last, source: last.end } : null;
}

/** Cues mapped onto the output timeline (cues spanning a cut are clipped to the kept part). */
export function cuesOnOutput(doc: EditDoc): Array<CaptionCue & { outStart: number; outEnd: number }> {
  const out: Array<CaptionCue & { outStart: number; outEnd: number }> = [];
  for (const cue of doc.captions.cues) {
    let acc = 0;
    for (const s of doc.segments) {
      const a = Math.max(cue.start, s.start);
      const b = Math.min(cue.end, s.end);
      if (b - a > 0.05) {
        const words = cue.words
          .filter((w) => w.end > a && w.start < b)
          .map((w) => ({ ...w, start: acc + (Math.max(w.start, a) - s.start) / s.speed, end: acc + (Math.min(w.end, b) - s.start) / s.speed }));
        out.push({ ...cue, words, outStart: acc + (a - s.start) / s.speed, outEnd: acc + (b - s.start) / s.speed });
      }
      acc += segmentOutputDuration(s);
    }
  }
  return out.sort((x, y) => x.outStart - y.outStart);
}

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter = (idCounter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** Validate and normalise an edit document coming from the client. Returns a list of problems (empty = ok). */
export function validateEditDoc(doc: any, sourceDuration: number): string[] {
  const problems: string[] = [];
  if (!doc || doc.version !== 1) return ['Unsupported edit document.'];
  if (!Array.isArray(doc.segments) || doc.segments.length === 0) problems.push('The timeline is empty.');
  for (const s of doc.segments || []) {
    if (!(s.end > s.start)) problems.push(`Segment ${s.id} has no length.`);
    if (s.start < 0 || s.end > sourceDuration + 0.05) problems.push(`Segment ${s.id} is outside the source video.`);
    if (!(s.speed >= 0.5 && s.speed <= 2)) problems.push(`Segment ${s.id} speed must be between 0.5x and 2x.`);
  }
  if (!['9:16', '16:9', '1:1'].includes(doc.aspect)) problems.push('Unknown aspect ratio.');
  if (!['crop', 'fit', 'blur'].includes(doc.framing?.mode)) problems.push('Unknown framing mode.');
  const total = totalOutputDuration(doc);
  if (total > 600) problems.push('Shorts are limited to 10 minutes.');
  if (total < 1) problems.push('The short must be at least 1 second long.');
  return problems;
}
