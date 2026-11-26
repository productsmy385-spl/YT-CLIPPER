import path from 'node:path';
import fs from 'node:fs';
import { BaseAgent } from '../../agents/base-agent.ts';
import { detectSceneCuts, detectBlackSegments, makeAnalysisProxy, type ProbeResult, type TimeRange } from '../../lib/media/ff.ts';
import { geminiConfigured, geminiModel, uploadFile, deleteFile, generateJson } from '../../lib/ai/gemini.ts';
import { throwIfAborted, type AgentContext, type AiUsage, type TimedEvent } from '../context.ts';

export interface VideoAnalysisInput { ctx: AgentContext; sourcePath: string; probe: ProbeResult }
export interface VideoAnalysisOutput {
  sceneCuts: number[];
  blackSegments: TimeRange[];
  events: TimedEvent[];
  summary: string;
  ai: AiUsage;
}

const CHUNK_SECONDS = 40 * 60;

const EVENT_TYPES = ['action', 'chase', 'crash', 'explosion', 'stunt', 'fail', 'funny', 'kill', 'combat', 'cutscene', 'scenic', 'dialogue', 'dead_time', 'other'];

const schema = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    events: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          start: { type: 'NUMBER' },
          end: { type: 'NUMBER' },
          type: { type: 'STRING', enum: EVENT_TYPES },
          description: { type: 'STRING' },
          intensity: { type: 'INTEGER' },
        },
        required: ['start', 'end', 'type', 'description', 'intensity'],
      },
    },
  },
  required: ['summary', 'events'],
};

/**
 * Agent 1 — Video Analysis.
 * Input: the acquired source file. Processing: FFmpeg scene-change and black-frame detection over the whole
 * video, plus Gemini visual understanding of a 1 fps proxy (in 40-minute chunks) to name what actually happens
 * on screen with timestamps. Output: scene cuts, black segments, timestamped visual events, a summary.
 * Errors: FFmpeg failures throw (the job fails and can be retried); a Gemini failure is recorded in `ai.error`
 * and analysis continues on measured signals only.
 */
export class VideoAnalysisAgent extends BaseAgent<VideoAnalysisInput, VideoAnalysisOutput> {
  readonly id = 'agent_video_analysis';
  readonly name = 'Video Analysis Agent';
  readonly role = 'Scene changes, black frames and timestamped visual events';

  protected async run(_projectId: string, { ctx, sourcePath, probe }: VideoAnalysisInput): Promise<VideoAnalysisOutput> {
    ctx.progress(0.02, 'Detecting scene changes');
    const sceneCuts = await detectSceneCuts(sourcePath, 0.32, ctx.signal);
    throwIfAborted(ctx.signal);
    ctx.progress(0.25, `Found ${sceneCuts.length} scene changes; checking for black frames`);
    const blackSegments = await detectBlackSegments(sourcePath, 0.5, ctx.signal);
    throwIfAborted(ctx.signal);

    const ai: AiUsage = { used: false };
    const events: TimedEvent[] = [];
    const summaries: string[] = [];

    if (!geminiConfigured()) {
      ai.error = 'GEMINI_API_KEY not configured; visual events not analysed.';
    } else {
      try {
        const chunks: Array<{ start: number; dur: number }> = [];
        for (let s = 0; s < probe.duration; s += CHUNK_SECONDS) chunks.push({ start: s, dur: Math.min(CHUNK_SECONDS, probe.duration - s) });
        for (let i = 0; i < chunks.length; i++) {
          const c = chunks[i];
          throwIfAborted(ctx.signal);
          ctx.progress(0.3 + (0.65 * i) / chunks.length, `AI is watching ${chunks.length > 1 ? `part ${i + 1} of ${chunks.length}` : 'the video'}`);
          const proxy = path.join(ctx.workDir, `analysis_proxy_${i}.mp4`);
          await makeAnalysisProxy(sourcePath, proxy, c.start, c.dur, ctx.signal);
          const file = await uploadFile(proxy, 'video/mp4', `proxy_${ctx.projectId}_${i}`);
          try {
            const res = await generateJson<{ summary: string; events: any[] }>({
              mediaResolution: 'MEDIA_RESOLUTION_LOW',
              schema,
              system:
                'You analyse gameplay footage (often Grand Theft Auto) to find moments worth turning into short-form clips. ' +
                'Report only what is actually visible. Timestamps are seconds from the start of the supplied clip.',
              parts: [
                { fileData: { mimeType: file.mimeType, fileUri: file.uri } },
                {
                  text:
                    `This clip is ${c.dur.toFixed(0)} seconds long. List the notable visual moments: action, chases, crashes, explosions, stunts, ` +
                    `fails, funny or unexpected moments, kills/combat, cutscenes, and also stretches of dead time (menus, loading screens, idle walking) as type "dead_time". ` +
                    `Give each one a start and end in seconds, a concrete one-sentence description of what is on screen, and an intensity from 1 (dull) to 10 (extremely exciting). ` +
                    `Then summarise the whole clip in two sentences.`,
                },
              ],
            });
            summaries.push(res.summary);
            for (const e of res.events || []) {
              const start = Math.max(0, Number(e.start)) + c.start;
              const end = Math.min(probe.duration, Math.max(Number(e.end), Number(e.start) + 0.5) + c.start);
              if (!(end > start) || start >= probe.duration) continue;
              events.push({ start, end, type: String(e.type), description: String(e.description).slice(0, 300), intensity: Math.max(1, Math.min(10, Math.round(e.intensity))), source: 'visual' });
            }
          } finally {
            await deleteFile(file.name);
            try { fs.unlinkSync(proxy); } catch {}
          }
        }
        ai.used = true;
        ai.model = geminiModel();
      } catch (err: any) {
        if (ctx.signal.aborted) throw err;
        ai.error = `Visual AI analysis failed: ${err.message}`;
        console.error(`[VideoAnalysisAgent] ${ai.error}`);
      }
    }

    ctx.progress(1, `${sceneCuts.length} scene changes, ${events.length} visual events`);
    return { sceneCuts, blackSegments, events: events.sort((a, b) => a.start - b.start), summary: summaries.join(' '), ai };
  }
}
