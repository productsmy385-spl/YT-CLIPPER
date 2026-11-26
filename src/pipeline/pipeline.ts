import fs from 'node:fs';
import path from 'node:path';
import { dbRepo } from '../db/repository.ts';
import { getProjectStoragePaths, STORAGE_TMP_DIR, STORAGE_UPLOADS_DIR, MUSIC_DIR } from '../lib/app-paths.ts';
import { computeFileChecksum } from '../lib/video-ingestion.ts';
import { probe, verifyDecodable, extractThumbnail, waveformPeaks, ffmpegWithProgress, type ProbeResult } from '../lib/media/ff.ts';
import { inspectYouTubeVideo, acquireYouTubeVideo, AcquisitionError } from '../lib/youtube/media-source.ts';
import { renderEditDoc } from '../lib/render/renderer.ts';
import { newId, totalOutputDuration, type EditDoc } from '../lib/render/edit-doc.ts';
import { updateJobProgress, heartbeat, type Job } from '../lib/jobs/queue.ts';
import * as store from '../lib/studio/store.ts';
import { STAGES, overallProgress, type StageKey } from './stages.ts';
import { throwIfAborted, type AgentContext } from './context.ts';
import { VideoAnalysisAgent } from './agents/video-analysis-agent.ts';
import { AudioIntelligenceAgent, type AudioIntelligenceOutput } from './agents/audio-intelligence-agent.ts';
import { HighlightDetectionAgent, type Highlight } from './agents/highlight-detection-agent.ts';
import { ShortsGenerationAgent, defaultEditDoc, removeDeadAir } from './agents/shorts-generation-agent.ts';
import { CaptionAgent } from './agents/caption-agent.ts';
import { QualityControlAgent } from './agents/quality-control-agent.ts';

/** A failure the user should see verbatim; `retryable` decides whether the queue retries automatically. */
export class PipelineError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

export interface ProcessOptions {
  sourceType: 'youtube' | 'upload';
  sourceUrl?: string;
  uploadFile?: string; // basename inside STORAGE_UPLOADS_DIR
  durations: number[];
  maxShorts: number;
  aspect: '9:16' | '16:9' | '1:1';
  captionPreset: string;
  removeDeadAir: boolean;
}

const BROWSER_SAFE_VIDEO = new Set(['h264', 'vp9', 'av1', 'vp8']);

/** Wires stage records, project status, job progress and heartbeats together. */
function makeTracker(job: Job, workerId: string) {
  const projectId = job.project_id;
  let current: StageKey = 'inspecting';
  let lastBeat = 0;
  const write = (key: StageKey, fraction: number, message: string, status: 'ACTIVE' | 'COMPLETED' | 'FAILED') => {
    const s = STAGES.find((x) => x.key === key)!;
    const pct = overallProgress(key, fraction);
    const t = new Date().toISOString();
    dbRepo.savePipelineStage({
      projectId, stageNumber: s.n, stageKey: s.key, stageName: s.name, status,
      progressPercent: Math.round(fraction * 100),
      startedAt: status === 'ACTIVE' ? t : undefined,
      completedAt: status === 'COMPLETED' ? t : undefined,
      errorMessage: status === 'FAILED' ? message : undefined,
      detailsJson: JSON.stringify({ message }),
    });
    dbRepo.updateProjectStatus(projectId, status === 'FAILED' ? 'error' : key === 'completed' && status === 'COMPLETED' ? 'ready' : 'in_progress', pct, message, {
      stageId: String(s.n), stageStatus: status, errorMessage: status === 'FAILED' ? message : undefined, workerId,
    });
    updateJobProgress(job.id, pct, key, message);
  };
  const completed = new Set<StageKey>();
  return {
    get current() { return current; },
    enter(key: StageKey, message: string) {
      // Any earlier stage not explicitly completed (e.g. skipped because cached) is closed off first.
      for (const s of STAGES.slice(0, STAGES.findIndex((x) => x.key === key))) {
        if (!completed.has(s.key)) {
          write(s.key, 1, `${s.name} done`, 'COMPLETED');
          completed.add(s.key);
        }
      }
      current = key;
      write(key, 0, message, 'ACTIVE');
    },
    progress(fraction: number, message: string) {
      const now = Date.now();
      if (now - lastBeat < 700 && fraction < 1) return; // throttle DB writes
      lastBeat = now;
      write(current, fraction, message, 'ACTIVE');
    },
    complete(key: StageKey, message: string) {
      write(key, 1, message, 'COMPLETED');
      completed.add(key);
    },
    fail(message: string) { write(current, 0, message, 'FAILED'); },
    beat() { heartbeat(job.id); },
  };
}

function ctxFor(job: Job, workDir: string, signal: AbortSignal, tracker: ReturnType<typeof makeTracker>): AgentContext {
  return {
    projectId: job.project_id,
    workDir,
    signal,
    progress: (f, m) => tracker.progress(f, m),
    stage: (k, m) => tracker.enter(k, m),
  };
}

// =============================================================================================
// Process project: source → shorts
// =============================================================================================

export async function runProcessProject(job: Job, signal: AbortSignal, workerId: string): Promise<string> {
  const opts = JSON.parse(job.payload_json || '{}') as ProcessOptions;
  const projectId = job.project_id;
  const paths = getProjectStoragePaths(projectId);
  const workDir = path.join(STORAGE_TMP_DIR, job.id);
  fs.mkdirSync(workDir, { recursive: true });
  const tracker = makeTracker(job, workerId);
  const ctx = ctxFor(job, workDir, signal, tracker);
  const beat = setInterval(() => tracker.beat(), 15000);

  try {
    // ---- 1. Inspect --------------------------------------------------------------------------
    tracker.enter('inspecting', 'Checking the video source');
    let asset = store.getProjectAsset(projectId);
    let inspection: Awaited<ReturnType<typeof inspectYouTubeVideo>> | null = null;
    if (!asset && opts.sourceType === 'youtube') {
      inspection = await inspectYouTubeVideo(opts.sourceUrl || '');
      if ('error' in inspection) throw new PipelineError(inspection.error, false);
      if (!inspection.canAcquire) throw new PipelineError(inspection.message || 'This video cannot be fetched.', false);
    }
    tracker.complete('inspecting', 'Source checked');

    // ---- 2. Acquire --------------------------------------------------------------------------
    tracker.enter('acquiring', opts.sourceType === 'youtube' ? 'Fetching the video from YouTube' : 'Moving the upload into the project');
    if (!asset || !fs.existsSync(asset.filePath)) {
      let filePath: string;
      if (opts.sourceType === 'youtube') {
        const insp = inspection && !('error' in inspection) ? inspection : null;
        if (!insp) throw new PipelineError('YouTube inspection missing.', true);
        try {
          filePath = await acquireYouTubeVideo(insp, path.join(paths.sourceDir, `source_${insp.videoId}.mp4`), (pct) => tracker.progress(pct / 100, `Fetching video: ${Math.round(pct)}%`), signal);
        } catch (err: any) {
          throw new PipelineError(err.message, err instanceof AcquisitionError ? err.retryable : true);
        }
      } else {
        const name = path.basename(opts.uploadFile || '');
        const uploaded = path.join(STORAGE_UPLOADS_DIR, name);
        if (!name || !fs.existsSync(uploaded)) throw new PipelineError('The uploaded file is no longer on the server. Upload it again.', false);
        filePath = path.join(paths.sourceDir, `source${path.extname(name).toLowerCase() || '.mp4'}`);
        fs.renameSync(uploaded, filePath);
      }
      asset = {
        id: `asset_${projectId}`, projectId, sourceType: opts.sourceType, sourceRef: opts.sourceUrl || opts.uploadFile || null,
        videoId: inspection && !('error' in inspection) ? inspection.videoId : null, filePath, fileSize: fs.statSync(filePath).size,
        checksum: null, probe: null, thumbnailPath: null, waveform: null, transcript: null, analysis: null,
      };
      store.upsertMediaAsset(asset);
    }
    tracker.complete('acquiring', `Video acquired (${(asset.fileSize! / 1048576).toFixed(1)} MB)`);
    throwIfAborted(signal);

    // ---- 3. Validate -------------------------------------------------------------------------
    tracker.enter('validating', 'Inspecting streams with FFprobe');
    let info: ProbeResult;
    try {
      info = await probe(asset.filePath);
    } catch (err: any) {
      throw new PipelineError(`This file is not a readable video (${String(err.message).replace(/^FFprobe could not read the file: [^:]*: /, "")}).`, false);
    }
    if (!info.hasVideo || info.duration <= 0.5) throw new PipelineError('This file has no playable video stream.', false);
    if (info.duration > Number(process.env.MAX_SOURCE_SECONDS || 4 * 3600)) throw new PipelineError('Videos longer than 4 hours are not supported.', false);
    tracker.progress(0.3, 'Checking the file decodes cleanly');
    const decodeErr = await verifyDecodable(asset.filePath, signal);
    if (decodeErr) throw new PipelineError(`The video is damaged and cannot be processed: ${decodeErr}`, false);
    tracker.progress(0.6, 'Creating thumbnail and waveform');
    const thumb = await extractThumbnail(asset.filePath, Math.min(info.duration * 0.1, 30), path.join(paths.thumbnailsDir, 'source.jpg'));
    const wave = info.hasAudio ? await waveformPeaks(asset.filePath, Math.min(100000, Math.ceil(info.duration * 10)), info.duration, signal) : [];
    let previewPath = asset.filePath;
    const containerOk = /mp4|mov/.test(info.formatName) && BROWSER_SAFE_VIDEO.has(info.videoCodec || '') && (!info.hasAudio || info.audioCodec === 'aac' || info.audioCodec === 'mp3' || info.audioCodec === 'opus');
    if (!containerOk) {
      tracker.progress(0.65, 'Creating a browser preview (the source codec cannot play in browsers)');
      previewPath = path.join(paths.sourceDir, 'preview.mp4');
      if (!fs.existsSync(previewPath)) {
        const tmp = path.join(workDir, 'preview.mp4');
        await ffmpegWithProgress(['-y', '-i', asset.filePath, '-vf', 'scale=-2:min(720\\,ih)', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', tmp], info.duration, (f) => tracker.progress(0.65 + f * 0.33, `Creating browser preview: ${Math.round(f * 100)}%`), { signal });
        fs.renameSync(tmp, previewPath);
      }
    }
    asset = { ...asset, probe: info, thumbnailPath: thumb, waveform: wave, checksum: asset.checksum || computeFileChecksum(asset.filePath), analysis: { ...(asset.analysis || {}), previewPath } };
    store.upsertMediaAsset(asset);
    dbRepo.saveSourceVideo({
      id: `sv_${projectId}`, projectId, fileName: path.basename(asset.filePath), filePath: asset.filePath, fileSize: asset.fileSize || 0,
      duration: info.duration, width: info.width, height: info.height, fps: info.fps, bitrate: info.bitrate, audioChannels: info.audioChannels,
      originSource: opts.sourceType === 'youtube' ? 'owned_youtube_channel' : 'local_upload', sha256Checksum: asset.checksum || undefined,
    } as any);
    tracker.complete('validating', `${info.width}x${info.height}, ${info.duration.toFixed(1)}s, ${info.hasAudio ? `${info.audioCodec} audio` : 'no audio'}`);
    throwIfAborted(signal);

    // ---- 4-5. Audio intelligence (cached) ----------------------------------------------------
    tracker.enter('extracting_audio', 'Extracting and measuring audio');
    let audio: AudioIntelligenceOutput = asset.transcript;
    if (!audio) {
      audio = await new AudioIntelligenceAgent().execute(projectId, { ctx, sourcePath: asset.filePath, probe: info });
      // Measured signals are always kept (QC and re-renders need them). The transcript is only cached when the AI
      // step succeeded, so a retry gets another chance at transcription.
      asset = { ...asset, analysis: { ...(asset.analysis || {}), loudness: audio.loudness, silences: audio.silences } };
      if (audio.ai.used || !audio.hasAudio) asset = { ...asset, transcript: audio };
      store.upsertMediaAsset(asset);
    } else {
      tracker.enter('transcribing', 'Using the transcript from the previous attempt');
    }
    tracker.complete('transcribing', audio.hasAudio ? `${audio.transcript.segments.length} transcript segments${audio.ai.error ? ` (${audio.ai.error})` : ''}` : 'No audio track');
    throwIfAborted(signal);

    // ---- 6. Video analysis (cached) ----------------------------------------------------------
    tracker.enter('analyzing_scenes', 'Analysing scenes and on-screen action');
    let video = asset.analysis?.video;
    if (!video) {
      video = await new VideoAnalysisAgent().execute(projectId, { ctx, sourcePath: asset.filePath, probe: info });
      if (video.ai.used) {
        asset = { ...asset, analysis: { ...(asset.analysis || {}), video } };
        store.upsertMediaAsset(asset);
      }
    }
    tracker.complete('analyzing_scenes', `${video.sceneCuts.length} scene changes, ${video.events.length} visual events${video.ai.error ? ` (${video.ai.error})` : ''}`);
    throwIfAborted(signal);

    // ---- 7. Highlights -----------------------------------------------------------------------
    tracker.enter('detecting_highlights', 'Finding the most entertaining moments');
    const hl = await new HighlightDetectionAgent().execute(projectId, {
      ctx, duration: info.duration, sceneCuts: video.sceneCuts, blackSegments: video.blackSegments, visualEvents: video.events,
      audioEvents: audio.audioEvents, loudness: audio.loudness, transcript: audio.transcript.segments,
      targetDurations: opts.durations.map((d) => Math.min(d, info.duration)), maxHighlights: opts.maxShorts,
    });
    if (!hl.highlights.length) throw new PipelineError('No usable highlight was found in this video (it may be too short or mostly black/silent).', false);
    tracker.complete('detecting_highlights', `${hl.highlights.length} highlights${hl.ai.used ? ' ranked by AI' : ' from measured signals'}`);

    // ---- 8. Shorts ---------------------------------------------------------------------------
    tracker.enter('generating_shorts', 'Laying out shorts');
    const generated = await new ShortsGenerationAgent().execute(projectId, {
      ctx, highlights: hl.highlights, silences: audio.silences, transcript: audio.transcript.segments,
      sourceWidth: info.width, sourceHeight: info.height, aspect: opts.aspect, captionPreset: opts.captionPreset, removeDeadAir: opts.removeDeadAir,
    });
    tracker.complete('generating_shorts', `${generated.length} shorts generated`);

    // ---- 9. Captions -------------------------------------------------------------------------
    tracker.enter('creating_captions', 'Creating synchronized captions');
    const captioned = await new CaptionAgent().execute(projectId, {
      ctx, transcript: audio.transcript.segments,
      items: generated.map((g, i) => ({ key: String(i), edit: g.edit, start: g.highlight.start, end: g.highlight.end, keywords: g.highlight.keywords })),
    });
    store.deleteShortsForProject(projectId);
    const shortIds: string[] = [];
    generated.forEach((g, i) => {
      const id = `short_${projectId.slice(-10)}_${i + 1}_${Date.now().toString(36)}`;
      shortIds.push(id);
      store.insertShort({
        id, projectId, rank: i + 1, title: g.highlight.title, description: g.highlight.description, reason: g.highlight.reason,
        category: g.highlight.category, score: g.highlight.score, startTime: g.highlight.start, endTime: g.highlight.end,
        transcript: g.transcript, edit: captioned[i].edit,
      });
    });
    tracker.complete('creating_captions', `${captioned.reduce((a, c) => a + c.cueCount, 0)} caption cues`);

    // ---- 10-11. Render + QC ------------------------------------------------------------------
    tracker.enter('rendering', `Rendering ${shortIds.length} shorts`);
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (let i = 0; i < shortIds.length; i++) {
      throwIfAborted(signal);
      const short = store.getShort(shortIds[i])!;
      try {
        await renderShortFile(short, asset, info, job.id, workDir, signal, (f) => tracker.progress((i + f) / shortIds.length, `Rendering short ${i + 1} of ${shortIds.length}: ${Math.round(f * 100)}%`));
        results.push({ id: short.id, ok: true });
      } catch (err: any) {
        if (signal.aborted) throw err;
        results.push({ id: short.id, ok: false, error: err.message });
      }
    }
    tracker.complete('rendering', `${results.filter((r) => r.ok).length} of ${results.length} rendered`);
    tracker.enter('quality_check', 'Checking every rendered short');
    let passed = 0;
    for (let i = 0; i < results.length; i++) {
      if (!results[i].ok) continue;
      const ok = await qualityCheckShort(results[i].id, asset.analysis?.loudness || audio.loudness || null, ctx);
      if (ok) passed++;
      tracker.progress((i + 1) / results.length, `Checked ${i + 1} of ${results.length}`);
    }
    if (passed === 0) {
      const firstErr = results.find((r) => r.error)?.error;
      // Render errors may be transient (retry); QC rejections of a successful render are deterministic (do not).
      throw new PipelineError(`No short passed rendering and quality checks.${firstErr ? ` First error: ${firstErr}` : ''}`, results.some((r) => !r.ok));
    }
    tracker.complete('quality_check', `${passed} of ${results.length} shorts passed`);

    tracker.enter('completed', 'Done');
    tracker.complete('completed', `${passed} short${passed === 1 ? '' : 's'} ready`);
    return `${passed} of ${results.length} shorts ready`;
  } catch (err: any) {
    if (!signal.aborted) tracker.fail(err.message || String(err));
    throw err;
  } finally {
    clearInterval(beat);
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

// =============================================================================================
// Rendering a short (used by the pipeline and by editor re-renders)
// =============================================================================================

function musicPathFor(trackId: string | undefined | null): string | null {
  if (!trackId) return null;
  const music = (dbRepo.getMusicAssets() as any[]).find((m) => m.id === trackId);
  const candidates = [music?.filePath, trackId].filter(Boolean).map(String);
  for (const c of candidates) {
    const p = path.join(MUSIC_DIR, path.basename(c));
    if (fs.existsSync(p)) return p;
  }
  throw new PipelineError('The selected music track is not available on the server.', false);
}

async function renderShortFile(short: store.Short, asset: store.MediaAsset, info: ProbeResult, jobId: string, workDir: string, signal: AbortSignal, onProgress: (f: number) => void) {
  const paths = getProjectStoragePaths(short.projectId);
  const renderId = newId('render');
  store.insertRender({ id: renderId, shortId: short.id, projectId: short.projectId, jobId, editVersion: short.version });
  store.updateShort(short.id, { status: 'rendering' });
  const outPath = path.join(paths.exportsDir, `${short.id}_v${short.version}.mp4`);
  try {
    await renderEditDoc({
      doc: short.edit, sourcePath: asset.filePath, source: info, musicPath: musicPathFor(short.edit.audio.music?.trackId),
      outPath, workDir: path.join(workDir, renderId), onProgress, signal,
    });
    const thumb = await extractThumbnail(outPath, Math.min(1, totalOutputDuration(short.edit) / 2), path.join(paths.thumbnailsDir, `${short.id}.jpg`), 360);
    store.finishRender(renderId, { status: 'completed', outputPath: outPath, fileSize: fs.statSync(outPath).size, duration: totalOutputDuration(short.edit) });
    store.updateShort(short.id, { outputPath: outPath, thumbnailPath: thumb });
    pruneOldRenders(short.id);
  } catch (err: any) {
    store.finishRender(renderId, { status: 'failed', error: err.message });
    store.updateShort(short.id, { status: 'failed', qc: { passed: false, checks: [{ name: 'Render', ok: false, detail: err.message, severity: 'error' }] } });
    throw err;
  }
}

/** True if any second of the source used by the edit is louder than -50 dBFS. null loudness = unknown, assume audible. */
export function sectionsAudible(edit: EditDoc, loudness: number[] | null): boolean {
  if (!loudness) return true;
  return edit.segments.some((s) => loudness.slice(Math.floor(s.start), Math.ceil(s.end) + 1).some((v) => v > -50));
}

async function qualityCheckShort(shortId: string, loudness: number[] | null, ctx: AgentContext): Promise<boolean> {
  const short = store.getShort(shortId)!;
  const renders = store.listRenders(shortId);
  const latest = renders[0];
  if (!short.outputPath || !latest) return false;
  const qc = await new QualityControlAgent().execute(short.projectId, { ctx, outputPath: short.outputPath, edit: short.edit, sourceAudible: sectionsAudible(short.edit, loudness) });
  const project = dbRepo.getProject(short.projectId) as any;
  store.updateShort(shortId, { status: qc.passed ? 'ready' : 'failed', qc });
  store.finishRender(latest.id, { status: qc.passed ? 'completed' : 'failed', outputPath: short.outputPath, fileSize: fs.statSync(short.outputPath).size, duration: totalOutputDuration(short.edit), qc, error: qc.passed ? undefined : 'Rejected by quality control' });
  // Keep the legacy library / publishing pages working: they read generated_clips.
  dbRepo.saveGeneratedClip({
    id: `clip_${shortId}`, projectId: short.projectId, highlightId: shortId, title: short.title, duration: totalOutputDuration(short.edit),
    startTime: short.startTime, endTime: short.endTime, outputPath: short.outputPath, outputFilePath: short.outputPath,
    thumbnailPath: short.thumbnailPath || undefined, status: qc.passed ? 'rendered' : 'failed', processingStatus: qc.passed ? 'rendered' : 'failed',
    resolution: short.edit.aspect === '9:16' ? '1080x1920' : short.edit.aspect === '16:9' ? '1920x1080' : '1080x1080',
    fps: 30, qaScore: Math.round((qc.checks.filter((c) => c.ok).length / Math.max(1, qc.checks.length)) * 100),
    sourceVideoId: `sv_${short.projectId}`, editingVersion: short.version, editedClipPath: short.outputPath,
  });
  void project;
  return qc.passed;
}

/** Keep the three newest render files per short; older ones are deleted from disk (history rows stay). */
function pruneOldRenders(shortId: string) {
  const renders = store.listRenders(shortId).filter((r) => r.outputPath);
  const keep = new Set(renders.slice(0, 3).map((r) => r.outputPath));
  for (const r of renders.slice(3)) {
    if (r.outputPath && !keep.has(r.outputPath) && fs.existsSync(r.outputPath)) {
      try { fs.unlinkSync(r.outputPath); } catch {}
    }
  }
}

function loadAssetOrFail(projectId: string): { asset: store.MediaAsset; info: ProbeResult } {
  const asset = store.getProjectAsset(projectId);
  if (!asset || !fs.existsSync(asset.filePath) || !asset.probe) {
    throw new PipelineError('The source video for this project is no longer on the server (storage was reset). Re-run the project from its source.', false);
  }
  return { asset, info: asset.probe };
}

/** Editor re-render: render the short's current edit document, then quality-check it. */
export async function runRenderShort(job: Job, signal: AbortSignal): Promise<string> {
  const short = store.getShort(job.short_id || '');
  if (!short) throw new PipelineError('This short no longer exists.', false);
  const { asset, info } = loadAssetOrFail(short.projectId);
  const workDir = path.join(STORAGE_TMP_DIR, job.id);
  const beat = setInterval(() => heartbeat(job.id), 15000);
  const ctx: AgentContext = { projectId: short.projectId, workDir, signal, progress: (f, m) => updateJobProgress(job.id, 90 + f * 10, 'quality_check', m), stage: () => {} };
  try {
    updateJobProgress(job.id, 1, 'rendering', 'Rendering');
    await renderShortFile(short, asset, info, job.id, workDir, signal, (f) => updateJobProgress(job.id, Math.round(f * 90), 'rendering', `Rendering: ${Math.round(f * 100)}%`));
    updateJobProgress(job.id, 90, 'quality_check', 'Quality checking');
    const ok = await qualityCheckShort(short.id, asset.analysis?.loudness || (info.hasAudio ? null : []), ctx);
    if (!ok) {
      const qc = store.getShort(short.id)?.qc;
      throw new PipelineError(`Quality control rejected the render: ${(qc?.checks || []).filter((c: any) => !c.ok && c.severity === 'error').map((c: any) => `${c.name} (${c.detail})`).join('; ')}`, false);
    }
    return 'Rendered and checked';
  } finally {
    clearInterval(beat);
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

/** Regenerate one short: pick a fresh highlight around the same moment (optionally a new duration). */
export async function runRegenerateShort(job: Job, signal: AbortSignal): Promise<string> {
  const short = store.getShort(job.short_id || '');
  if (!short) throw new PipelineError('This short no longer exists.', false);
  const { asset, info } = loadAssetOrFail(short.projectId);
  const payload = JSON.parse(job.payload_json || '{}') as { duration?: number };
  const target = Math.max(5, Math.min(info.duration, payload.duration || Math.round(short.endTime - short.startTime)));
  const audio: AudioIntelligenceOutput = asset.transcript || { hasAudio: info.hasAudio, loudness: [], silences: [], transcript: { language: null, segments: [] }, audioEvents: [], ai: { used: false } };
  const video = asset.analysis?.video || { sceneCuts: [], blackSegments: [], events: [] };
  const workDir = path.join(STORAGE_TMP_DIR, job.id);
  fs.mkdirSync(workDir, { recursive: true });
  const ctx: AgentContext = { projectId: short.projectId, workDir, signal, progress: (f, m) => updateJobProgress(job.id, 5 + f * 15, 'detecting_highlights', m), stage: () => {} };
  try {
    const mid = (short.startTime + short.endTime) / 2;
    const span = Math.max(90, target * 2);
    const hl = await new HighlightDetectionAgent().execute(short.projectId, {
      ctx, duration: info.duration, sceneCuts: video.sceneCuts, blackSegments: video.blackSegments, visualEvents: video.events,
      audioEvents: audio.audioEvents, loudness: audio.loudness, transcript: audio.transcript.segments,
      targetDurations: [target], maxHighlights: 1, window: { start: Math.max(0, mid - span), end: Math.min(info.duration, mid + span) },
    });
    const h: Highlight | undefined = hl.highlights[0];
    if (!h) throw new PipelineError('No suitable moment was found near this clip.', false);
    // Keep the user's look (aspect, framing, caption style, music, overlays); replace timing and captions.
    const parts = removeDeadAir(h.start, h.end, audio.silences);
    const base = defaultEditDoc({ segments: parts, aspect: short.edit.aspect, captionPreset: 'bold_pop', sourceWidth: info.width, sourceHeight: info.height });
    const edit: EditDoc = { ...short.edit, segments: base.segments, captions: { ...short.edit.captions, cues: [] }, texts: [] };
    const [cap] = await new CaptionAgent().execute(short.projectId, { ctx, transcript: audio.transcript.segments, items: [{ key: '0', edit, start: h.start, end: h.end, keywords: h.keywords }] });
    store.updateShort(short.id, {
      title: h.title, description: h.description, reason: h.reason, category: h.category, score: h.score, startTime: h.start, endTime: h.end,
      transcript: audio.transcript.segments.filter((t) => t.end > h.start && t.start < h.end).map((t) => t.text).join(' '), edit: cap.edit,
    });
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
  return runRenderShort(job, signal);
}
