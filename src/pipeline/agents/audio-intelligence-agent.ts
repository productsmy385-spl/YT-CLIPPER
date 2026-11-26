import path from 'node:path';
import fs from 'node:fs';
import { BaseAgent } from '../../agents/base-agent.ts';
import { loudnessPerSecond, detectSilences, extractSpeechAudio, type ProbeResult, type TimeRange } from '../../lib/media/ff.ts';
import { geminiConfigured, geminiModel, uploadFile, deleteFile, generateJson } from '../../lib/ai/gemini.ts';
import { mapLimit, throwIfAborted, type AgentContext, type AiUsage, type TimedEvent, type TranscriptSegment } from '../context.ts';

export interface AudioIntelligenceInput { ctx: AgentContext; sourcePath: string; probe: ProbeResult }
export interface AudioIntelligenceOutput {
  hasAudio: boolean;
  loudness: number[]; // dBFS per second
  silences: TimeRange[];
  transcript: { language: string | null; segments: TranscriptSegment[] };
  audioEvents: TimedEvent[];
  ai: AiUsage;
}

const CHUNK_SECONDS = 10 * 60;
const AUDIO_EVENT_TYPES = ['laughter', 'scream', 'excited_shout', 'cheer', 'gunfire', 'explosion', 'crash', 'siren', 'music', 'other'];

const schema = {
  type: 'OBJECT',
  properties: {
    language: { type: 'STRING' },
    segments: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { start: { type: 'NUMBER' }, end: { type: 'NUMBER' }, text: { type: 'STRING' } },
        required: ['start', 'end', 'text'],
      },
    },
    events: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          start: { type: 'NUMBER' },
          end: { type: 'NUMBER' },
          type: { type: 'STRING', enum: AUDIO_EVENT_TYPES },
          description: { type: 'STRING' },
          intensity: { type: 'INTEGER' },
        },
        required: ['start', 'end', 'type', 'description', 'intensity'],
      },
    },
  },
  required: ['language', 'segments', 'events'],
};

/** Spread a segment's duration over its words in proportion to their length (Gemini gives segment timing). */
export function wordsFromSegment(start: number, end: number, text: string) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const weights = tokens.map((t) => Math.max(1, t.replace(/[^\p{L}\p{N}]/gu, '').length) + 1);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const span = Math.max(0.05, end - start);
  let t = start;
  return tokens.map((w, i) => {
    const d = (span * weights[i]) / total;
    const word = { start: Math.round(t * 1000) / 1000, end: Math.round((t + d) * 1000) / 1000, text: w };
    t += d;
    return word;
  });
}

/**
 * Agent 2 — Audio Intelligence.
 * Input: the acquired source. Processing: FFmpeg per-second loudness and silence detection over the whole
 * track; Gemini transcription and sound-event detection on 10-minute speech-band chunks (3 in parallel).
 * Output: loudness curve, silences, timestamped transcript (segment timing; word timing is distributed within
 * each segment), audio events. Errors: FFmpeg failures throw; Gemini failure is recorded in `ai.error` and the
 * transcript is left empty (captions are then not invented).
 */
export class AudioIntelligenceAgent extends BaseAgent<AudioIntelligenceInput, AudioIntelligenceOutput> {
  readonly id = 'agent_audio_intelligence';
  readonly name = 'Audio Intelligence Agent';
  readonly role = 'Loudness, silences, transcript and sound events';

  protected async run(_projectId: string, { ctx, sourcePath, probe }: AudioIntelligenceInput): Promise<AudioIntelligenceOutput> {
    const empty: AudioIntelligenceOutput = { hasAudio: false, loudness: [], silences: [], transcript: { language: null, segments: [] }, audioEvents: [], ai: { used: false } };
    if (!probe.hasAudio) {
      ctx.progress(1, 'This video has no audio track');
      ctx.stage('transcribing', 'No audio track: skipping transcript');
      return { ...empty, ai: { used: false, error: 'No audio track.' } };
    }

    ctx.progress(0.05, 'Measuring loudness');
    const loudness = await loudnessPerSecond(sourcePath, ctx.signal);
    throwIfAborted(ctx.signal);
    ctx.progress(0.6, 'Finding silences');
    const silences = await detectSilences(sourcePath, -40, 0.8, ctx.signal);
    throwIfAborted(ctx.signal);
    ctx.progress(1, `Audio measured (${silences.length} silent stretches)`);

    ctx.stage('transcribing', 'Transcribing speech and detecting sound events');
    const ai: AiUsage = { used: false };
    const segments: TranscriptSegment[] = [];
    const audioEvents: TimedEvent[] = [];
    let language: string | null = null;

    if (!geminiConfigured()) {
      ai.error = 'GEMINI_API_KEY not configured; no transcript generated.';
    } else {
      try {
        const chunks: Array<{ start: number; dur: number; i: number }> = [];
        for (let s = 0, i = 0; s < probe.duration; s += CHUNK_SECONDS, i++) chunks.push({ start: s, dur: Math.min(CHUNK_SECONDS, probe.duration - s), i });
        let done = 0;
        const results = await mapLimit(chunks, 3, async (c) => {
          throwIfAborted(ctx.signal);
          const audioPath = path.join(ctx.workDir, `speech_${c.i}.mp3`);
          await extractSpeechAudio(sourcePath, audioPath, c.start, c.dur, ctx.signal);
          const file = await uploadFile(audioPath, 'audio/mpeg', `speech_${ctx.projectId}_${c.i}`);
          try {
            const r = await generateJson<{ language: string; segments: any[]; events: any[] }>({
              schema,
              system: 'You are a precise transcriber for gameplay commentary. Never invent speech. Timestamps are seconds from the start of the supplied audio.',
              parts: [
                { fileData: { mimeType: file.mimeType, fileUri: file.uri } },
                {
                  text:
                    `This audio is ${c.dur.toFixed(0)} seconds long. Transcribe every spoken word verbatim in the original language, ` +
                    `as segments no longer than about 8 seconds each, with accurate start and end times. Ignore in-game background chatter you cannot make out. Put ONLY spoken words in segment text, never sound labels like (laughter) or crash; segments must not overlap. ` +
                    `Also list non-speech sound events (laughter, screams, excited shouts, cheering, gunfire, explosions, crashes, sirens, music) with start, end, ` +
                    `a short description and an intensity from 1 to 10. If there is no speech, return an empty segments list.`,
                },
              ],
            });
            return { c, r };
          } finally {
            await deleteFile(file.name);
            try { fs.unlinkSync(audioPath); } catch {}
            done++;
            ctx.progress(done / chunks.length, `Transcribed ${done} of ${chunks.length} audio part${chunks.length > 1 ? 's' : ''}`);
          }
        });
        for (const { c, r } of results) {
          language = language || r.language || null;
          for (const s of r.segments || []) {
            const start = Math.max(0, Number(s.start)) + c.start;
            const end = Math.min(c.start + c.dur, Math.max(Number(s.end), Number(s.start) + 0.2) + c.start);
            const text = String(s.text || '').trim();
            if (!text || !(end > start)) continue;
            const clean = cleanTranscriptText(text);
            if (clean) segments.push({ start, end, text: clean, words: wordsFromSegment(start, end, clean) });
          }
          for (const e of r.events || []) {
            const start = Math.max(0, Number(e.start)) + c.start;
            const end = Math.max(start + 0.3, Number(e.end) + c.start);
            audioEvents.push({ start, end: Math.min(probe.duration, end), type: String(e.type), description: String(e.description).slice(0, 200), intensity: Math.max(1, Math.min(10, Math.round(e.intensity))), source: 'audio' });
          }
        }
        segments.sort((a, b) => a.start - b.start);
        // Gemini sometimes returns overlapping segments; make them sequential so caption timing stays valid.
        for (let i = 1; i < segments.length; i++) {
          const prev = segments[i - 1], cur = segments[i];
          if (cur.start < prev.end) {
            cur.start = Math.min(prev.end, cur.end - 0.2);
            cur.words = wordsFromSegment(cur.start, cur.end, cur.text);
          }
        }
        ai.used = true;
        ai.model = geminiModel();
      } catch (err: any) {
        if (ctx.signal.aborted) throw err;
        ai.error = `Transcription failed: ${err.message}`;
        console.error(`[AudioIntelligenceAgent] ${ai.error}`);
      }
    }

    ctx.progress(1, `${segments.length} transcript segments, ${audioEvents.length} sound events`);
    return { hasAudio: true, loudness, silences, transcript: { language, segments }, audioEvents: audioEvents.sort((a, b) => a.start - b.start), ai };
  }
}

const SOUND_LABELS = /^(laughter|laughs?|laughing|crash|music|applause|gunshots?|gunfire|explosions?|siren|screams?|screaming|cheering|noise|inaudible)$/i;

/** Remove non-speech labels Gemini sometimes mixes into transcript text. Exported for tests. */
export function cleanTranscriptText(text: string): string {
  // Any non-Latin script in the segment: English sound words there are labels, not speech.
  const nonLatin = /[Ͱ-￿]/.test(text);
  const tokens = text.replace(/[\[(][^\])]{1,40}[\])]/g, ' ').split(/\s+/).filter(Boolean);
  // A segment made only of sound labels ("laughter", "crash") is not speech.
  if (tokens.length && tokens.length <= 3 && tokens.every((w) => SOUND_LABELS.test(w.replace(/[^\w]/g, '')))) return '';
  return text
    .replace(/[\[(][^\])]{1,40}[\])]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !(nonLatin && SOUND_LABELS.test(w.replace(/[^\w]/g, ''))))
    .join(' ')
    .trim();
}
