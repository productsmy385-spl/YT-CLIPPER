import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Asynchronous FFmpeg / FFprobe toolkit. Nothing here blocks the Node event loop, so long-running analysis and
 * renders never stall HTTP requests (the legacy ffmpeg-core uses spawnSync for analysis).
 */

export const FFMPEG = process.env.FFMPEG || 'ffmpeg';
export const FFPROBE = process.env.FFPROBE || 'ffprobe';

export interface RunResult { code: number; stdout: string; stderr: string }

export class FfmpegError extends Error {
  readonly stderrTail: string;
  constructor(message: string, stderrTail: string) {
    super(message);
    this.stderrTail = stderrTail;
  }
}

export function run(
  bin: string,
  args: string[],
  opts: { cwd?: string; signal?: AbortSignal; timeoutMs?: number; onStdout?: (chunk: string) => void; onStderr?: (chunk: string) => void; keepStdout?: boolean } = {}
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    const kill = () => child.kill('SIGKILL');
    opts.signal?.addEventListener('abort', kill, { once: true });
    const timer = opts.timeoutMs ? setTimeout(kill, opts.timeoutMs) : null;
    child.stdout.on('data', (b) => {
      const s = b.toString();
      if (opts.keepStdout !== false) stdout += s;
      opts.onStdout?.(s);
    });
    child.stderr.on('data', (b) => {
      const s = b.toString();
      stderr += s;
      if (stderr.length > 4_000_000) stderr = stderr.slice(-2_000_000);
      opts.onStderr?.(s);
    });
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(new FfmpegError(`Could not start ${path.basename(bin)}: ${err.message}`, ''));
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener('abort', kill);
      if (opts.signal?.aborted) return reject(new FfmpegError('Cancelled', ''));
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

function meaningfulError(stderr: string): string {
  const lines = stderr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const hit = [...lines].reverse().find((l) => /error|invalid|no such|not found|unable|failed|does not contain|unknown|cannot/i.test(l));
  return (hit || lines[lines.length - 1] || 'unknown error').slice(0, 300);
}

export async function ffmpeg(args: string[], opts: Parameters<typeof run>[2] = {}): Promise<RunResult> {
  const r = await run(FFMPEG, ['-hide_banner', '-nostdin', ...args], opts);
  if (r.code !== 0) throw new FfmpegError(`FFmpeg failed: ${meaningfulError(r.stderr)}`, r.stderr.slice(-3000));
  return r;
}

// ---------------------------------------------------------------------------------------------

export interface ProbeResult {
  duration: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string | null;
  audioCodec: string | null;
  hasVideo: boolean;
  hasAudio: boolean;
  audioChannels: number;
  audioSampleRate: number;
  bitrate: number;
  size: number;
  rotation: number;
  formatName: string;
  videoDuration: number | null;
  audioDuration: number | null;
}

export async function probe(file: string): Promise<ProbeResult> {
  const r = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { timeoutMs: 60000 });
  // Never surface server paths to users.
  if (r.code !== 0) throw new FfmpegError(`FFprobe could not read the file: ${meaningfulError(r.stderr.split(file).join(path.basename(file)))}`, r.stderr);
  let j: any;
  try {
    j = JSON.parse(r.stdout);
  } catch {
    throw new FfmpegError('FFprobe returned unreadable output.', r.stdout.slice(0, 500));
  }
  const v = (j.streams || []).find((s: any) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
  const a = (j.streams || []).find((s: any) => s.codec_type === 'audio');
  const rate = (x?: string) => {
    if (!x) return 0;
    const [n, d] = x.split('/').map(Number);
    return d ? n / d : n;
  };
  let rotation = 0;
  const sideRot = v?.side_data_list?.find((s: any) => s.rotation !== undefined)?.rotation;
  if (sideRot !== undefined) rotation = Number(sideRot);
  else if (v?.tags?.rotate) rotation = Number(v.tags.rotate);
  let width = Number(v?.width || 0);
  let height = Number(v?.height || 0);
  if (Math.abs(rotation) === 90 || Math.abs(rotation) === 270) [width, height] = [height, width];
  const duration = Number(j.format?.duration || v?.duration || a?.duration || 0);
  return {
    duration,
    width,
    height,
    fps: Math.round((rate(v?.avg_frame_rate) || rate(v?.r_frame_rate)) * 100) / 100,
    videoCodec: v?.codec_name || null,
    audioCodec: a?.codec_name || null,
    hasVideo: Boolean(v),
    hasAudio: Boolean(a),
    audioChannels: Number(a?.channels || 0),
    audioSampleRate: Number(a?.sample_rate || 0),
    bitrate: Number(j.format?.bit_rate || 0),
    size: Number(j.format?.size || 0),
    rotation,
    formatName: j.format?.format_name || '',
    videoDuration: v?.duration ? Number(v.duration) : null,
    audioDuration: a?.duration ? Number(a.duration) : null,
  };
}

/**
 * Full decode check: catches truncated / corrupted files that still have a valid header.
 * Decodes a sample of the file at low cost (every keyframe) rather than the whole stream.
 */
export async function verifyDecodable(file: string, signal?: AbortSignal): Promise<string | null> {
  const r = await run(FFMPEG, ['-hide_banner', '-nostdin', '-v', 'error', '-skip_frame', 'nokey', '-i', file, '-map', '0:v:0', '-f', 'null', '-'], { signal, timeoutMs: 15 * 60 * 1000 });
  const errs = r.stderr.split(/\r?\n/).filter((l) => l.trim());
  if (r.code !== 0) return meaningfulError(r.stderr);
  if (errs.length > 50) return `The video stream has ${errs.length} decode errors (file is damaged).`;
  return null;
}

/** Run FFmpeg and report progress 0..1 based on output time vs expected duration. */
export async function ffmpegWithProgress(
  args: string[],
  expectedDuration: number,
  onProgress: (fraction: number) => void,
  opts: { cwd?: string; signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<RunResult> {
  let buf = '';
  let last = -1;
  return ffmpeg(['-progress', 'pipe:1', '-nostats', ...args], {
    ...opts,
    keepStdout: false,
    onStdout: (chunk) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        const m = /^out_time_us=(\d+)/.exec(line) || /^out_time_ms=(\d+)/.exec(line);
        if (m && expectedDuration > 0) {
          const f = Math.max(0, Math.min(1, Number(m[1]) / 1e6 / expectedDuration));
          if (f - last >= 0.01) {
            last = f;
            onProgress(f);
          }
        }
      }
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Analysis primitives (all real signal extraction from the media)
// ---------------------------------------------------------------------------------------------

/** Scene changes (seconds) using FFmpeg's scene score on a downscaled 5 fps stream. */
export async function detectSceneCuts(file: string, threshold = 0.32, signal?: AbortSignal): Promise<number[]> {
  const r = await run(
    FFMPEG,
    ['-hide_banner', '-nostdin', '-i', file, '-an', '-sn', '-vf', `fps=5,scale=320:-2,select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-'],
    { signal, keepStdout: false }
  );
  if (r.code !== 0) throw new FfmpegError(`Scene detection failed: ${meaningfulError(r.stderr)}`, r.stderr.slice(-2000));
  const cuts: number[] = [];
  for (const m of r.stderr.matchAll(/showinfo.*?pts_time:\s*([\d.]+)/g)) cuts.push(Math.round(Number(m[1]) * 100) / 100);
  return cuts;
}

/** Per-second loudness (RMS dBFS) of the first audio stream. Index i = second i. */
export async function loudnessPerSecond(file: string, signal?: AbortSignal): Promise<number[]> {
  const r = await run(
    FFMPEG,
    ['-hide_banner', '-nostdin', '-i', file, '-vn', '-sn', '-af', 'aresample=8000,asetnsamples=n=8000:p=0,astats=metadata=1:reset=1,ametadata=mode=print:key=lavfi.astats.Overall.RMS_level', '-f', 'null', '-'],
    { signal, keepStdout: false }
  );
  if (r.code !== 0) throw new FfmpegError(`Audio loudness analysis failed: ${meaningfulError(r.stderr)}`, r.stderr.slice(-2000));
  const out: number[] = [];
  for (const m of r.stderr.matchAll(/lavfi\.astats\.Overall\.RMS_level=(-?[\d.]+|-inf|inf|nan)/g)) {
    const v = Number(m[1]);
    out.push(Number.isFinite(v) ? Math.round(v * 10) / 10 : -90);
  }
  return out;
}

export interface TimeRange { start: number; end: number }

export async function detectSilences(file: string, noiseDb = -40, minSec = 0.8, signal?: AbortSignal): Promise<TimeRange[]> {
  const r = await run(FFMPEG, ['-hide_banner', '-nostdin', '-i', file, '-vn', '-sn', '-af', `silencedetect=n=${noiseDb}dB:d=${minSec}`, '-f', 'null', '-'], { signal, keepStdout: false });
  if (r.code !== 0) throw new FfmpegError(`Silence detection failed: ${meaningfulError(r.stderr)}`, r.stderr.slice(-2000));
  const out: TimeRange[] = [];
  let start: number | null = null;
  for (const line of r.stderr.split(/\r?\n/)) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    const e = /silence_end:\s*([\d.]+)/.exec(line);
    if (s) start = Math.max(0, Number(s[1]));
    if (e && start !== null) {
      out.push({ start, end: Number(e[1]) });
      start = null;
    }
  }
  return out;
}

export async function detectBlackSegments(file: string, minSec = 0.5, signal?: AbortSignal): Promise<TimeRange[]> {
  const r = await run(FFMPEG, ['-hide_banner', '-nostdin', '-i', file, '-an', '-sn', '-vf', `fps=10,scale=320:-2,blackdetect=d=${minSec}:pix_th=0.10`, '-f', 'null', '-'], { signal, keepStdout: false });
  if (r.code !== 0) throw new FfmpegError(`Black frame detection failed: ${meaningfulError(r.stderr)}`, r.stderr.slice(-2000));
  return [...r.stderr.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)/g)].map((m) => ({ start: Number(m[1]), end: Number(m[2]) }));
}

/** Waveform peaks (0..1), `buckets` values across the file's audio. */
export async function waveformPeaks(file: string, buckets: number, duration: number, signal?: AbortSignal): Promise<number[]> {
  const sampleRate = 1000;
  const total = Math.max(1, Math.ceil(duration * sampleRate));
  const per = Math.max(1, Math.floor(total / buckets));
  const peaks = new Array(buckets).fill(0);
  let idx = 0;
  let carry: Buffer = Buffer.alloc(0);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(FFMPEG, ['-hide_banner', '-nostdin', '-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(sampleRate), '-f', 's16le', '-'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    signal?.addEventListener('abort', () => child.kill('SIGKILL'), { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      const data = carry.length ? Buffer.concat([carry, chunk]) : chunk;
      const usable = data.length - (data.length % 2);
      for (let i = 0; i < usable; i += 2) {
        const b = Math.min(buckets - 1, Math.floor(idx / per));
        const v = Math.abs(data.readInt16LE(i)) / 32768;
        if (v > peaks[b]) peaks[b] = v;
        idx++;
      }
      carry = data.subarray(usable);
    });
    child.on('error', reject);
    child.on('close', () => resolve());
  });
  const max = Math.max(0.001, ...peaks);
  return peaks.map((p) => Math.round((p / max) * 1000) / 1000);
}

export async function extractThumbnail(file: string, atSec: number, out: string, width = 640): Promise<string> {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await ffmpeg(['-y', '-ss', String(Math.max(0, atSec)), '-i', file, '-frames:v', '1', '-vf', `scale=${width}:-2,format=yuvj420p`, '-q:v', '3', out], { timeoutMs: 60000 });
  return out;
}

/** Compact mono speech-band audio for transcription. */
export async function extractSpeechAudio(file: string, out: string, start?: number, duration?: number, signal?: AbortSignal): Promise<string> {
  const args = ['-y'];
  if (start !== undefined) args.push('-ss', String(start));
  args.push('-i', file);
  if (duration !== undefined) args.push('-t', String(duration));
  args.push('-vn', '-sn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '48k', out);
  await ffmpeg(args, { signal });
  return out;
}

/** Small, low-frame-rate video used only for AI visual analysis (never for output). */
export async function makeAnalysisProxy(file: string, out: string, start: number, duration: number, signal?: AbortSignal): Promise<string> {
  await ffmpeg(
    ['-y', '-ss', String(start), '-i', file, '-t', String(duration), '-an', '-sn', '-vf', 'fps=1,scale=-2:360', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '33', '-pix_fmt', 'yuv420p', out],
    { signal }
  );
  return out;
}
