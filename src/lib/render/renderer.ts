import fs from 'node:fs';
import path from 'node:path';
import { ffmpegWithProgress, type ProbeResult } from '../media/ff.ts';
import { APP_ROOT } from '../app-paths.ts';
import { buildAss } from './ass.ts';
import { outputSize, totalOutputDuration, type EditDoc } from './edit-doc.ts';

export const FONTS_DIR = path.resolve(APP_ROOT, 'public', 'fonts');

function atempoChain(speed: number): string {
  // atempo accepts 0.5..2.0 per instance; speeds are validated to that range.
  return Math.abs(speed - 1) < 1e-3 ? '' : `,atempo=${speed.toFixed(4)}`;
}

function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

/** Build the FFmpeg arguments for an edit document. Exported for tests. */
export function buildRenderArgs(p: {
  doc: EditDoc;
  sourcePath: string;
  source: Pick<ProbeResult, 'width' | 'height' | 'hasAudio'>;
  musicPath?: string | null;
  assFile: string | null; // relative to cwd
  fontsDir: string; // relative to cwd
  outFile: string;
}): string[] {
  const { doc, source } = p;
  const { width: W, height: H } = outputSize(doc.aspect);
  const total = totalOutputDuration(doc);
  const args: string[] = ['-y'];
  const filters: string[] = [];

  doc.segments.forEach((s) => {
    args.push('-ss', s.start.toFixed(3), '-t', (s.end - s.start).toFixed(3), '-i', p.sourcePath);
  });
  const musicIndex = p.musicPath && doc.audio.music ? doc.segments.length : -1;
  if (musicIndex >= 0) args.push('-stream_loop', '-1', '-i', p.musicPath!);

  const vLabels: string[] = [];
  doc.segments.forEach((s, i) => {
    const speed = s.speed || 1;
    filters.push(`[${i}:v:0]setpts=(PTS-STARTPTS)/${speed.toFixed(4)},fps=30,format=yuv420p,setsar=1[v${i}]`);
    const dur = ((s.end - s.start) / speed).toFixed(3);
    if (source.hasAudio) {
      filters.push(`[${i}:a:0]asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo${atempoChain(speed)},apad,atrim=0:${dur}[a${i}]`);
    } else {
      filters.push(`aevalsrc=0:c=stereo:s=48000:d=${dur}[a${i}]`);
    }
    vLabels.push(`[v${i}][a${i}]`);
  });
  filters.push(`${vLabels.join('')}concat=n=${doc.segments.length}:v=1:a=1[vcat][acat]`);

  // Framing
  const f = doc.framing;
  let framed: string;
  if (f.mode === 'crop') {
    const targetAr = W / H;
    const srcAr = source.width / source.height;
    const zoom = Math.max(1, Math.min(3, f.zoom || 1));
    let cw: number, ch: number;
    if (srcAr > targetAr) {
      ch = source.height / zoom;
      cw = ch * targetAr;
    } else {
      cw = source.width / zoom;
      ch = cw / targetAr;
    }
    cw = Math.min(even(cw), source.width - (source.width % 2));
    ch = Math.min(even(ch), source.height - (source.height % 2));
    const x = Math.round((source.width - cw) * Math.max(0, Math.min(1, f.focusX)));
    const y = Math.round((source.height - ch) * Math.max(0, Math.min(1, f.focusY)));
    framed = `[vcat]crop=${cw}:${ch}:${x}:${y},scale=${W}:${H}:flags=lanczos,setsar=1[vf]`;
  } else if (f.mode === 'fit') {
    framed = `[vcat]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1[vf]`;
  } else {
    framed =
      `[vcat]split=2[bg][fg];[bg]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=24:2,eq=brightness=-0.08[bgb];` +
      `[fg]scale=${W}:${H}:force_original_aspect_ratio=decrease[fgs];[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1[vf]`;
  }
  filters.push(framed);
  if (p.assFile) {
    filters.push(`[vf]subtitles=filename=${p.assFile}:fontsdir=${p.fontsDir}[vout]`);
  } else {
    filters.push(`[vf]null[vout]`);
  }

  // Audio
  const vol = Math.max(0, Math.min(2, doc.audio.sourceVolume ?? 1));
  if (musicIndex >= 0) {
    const m = doc.audio.music!;
    filters.push(`[acat]volume=${vol.toFixed(3)}[asrc]`);
    filters.push(`[${musicIndex}:a:0]atrim=0:${total.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${Math.max(0, Math.min(1.5, m.volume)).toFixed(3)}[mus]`);
    if (m.duck && source.hasAudio) {
      filters.push(`[asrc]asplit=2[as1][as2]`);
      filters.push(`[mus][as2]sidechaincompress=threshold=0.04:ratio=8:attack=20:release=350[musd]`);
      filters.push(`[as1][musd]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[aout]`);
    } else {
      filters.push(`[asrc][mus]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[aout]`);
    }
  } else {
    filters.push(`[acat]volume=${vol.toFixed(3)},alimiter=limit=0.95[aout]`);
  }

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', process.env.RENDER_PRESET || 'veryfast', '-crf', process.env.RENDER_CRF || '20',
    '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '30', '-g', '60',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
    '-t', total.toFixed(3),
    '-movflags', '+faststart',
    p.outFile
  );
  return args;
}

/**
 * Render an edit document to MP4. Writes to a temporary file and renames on success, so a failed render
 * never overwrites a previous good output.
 */
export async function renderEditDoc(p: {
  doc: EditDoc;
  sourcePath: string;
  source: ProbeResult;
  musicPath?: string | null;
  outPath: string;
  workDir: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<{ outPath: string; duration: number }> {
  fs.mkdirSync(p.workDir, { recursive: true });
  fs.mkdirSync(path.dirname(p.outPath), { recursive: true });
  const total = totalOutputDuration(p.doc);

  let assFile: string | null = null;
  const needsAss = (p.doc.captions.enabled && p.doc.captions.cues.length > 0) || (p.doc.texts || []).length > 0;
  if (needsAss) {
    fs.writeFileSync(path.join(p.workDir, 'overlay.ass'), buildAss(p.doc), 'utf8');
    assFile = 'overlay.ass';
  }
  // Filter arguments cannot safely contain Windows drive letters; use paths relative to the work dir.
  let fontsRel = path.relative(p.workDir, FONTS_DIR).split(path.sep).join('/');
  if (!fontsRel || path.isAbsolute(fontsRel) || /^[a-zA-Z]:/.test(fontsRel)) {
    const local = path.join(p.workDir, 'fonts');
    fs.mkdirSync(local, { recursive: true });
    for (const f of fs.readdirSync(FONTS_DIR)) if (f.endsWith('.ttf')) fs.copyFileSync(path.join(FONTS_DIR, f), path.join(local, f));
    fontsRel = 'fonts';
  }

  const tmpOut = path.join(p.workDir, `render_${Date.now()}.mp4`);
  const args = buildRenderArgs({
    doc: p.doc,
    sourcePath: path.resolve(p.sourcePath),
    source: p.source,
    musicPath: p.musicPath ? path.resolve(p.musicPath) : null,
    assFile,
    fontsDir: fontsRel,
    outFile: tmpOut,
  });
  try {
    await ffmpegWithProgress(args, total, (f) => p.onProgress?.(f), { cwd: p.workDir, signal: p.signal, timeoutMs: Math.max(10 * 60 * 1000, total * 60 * 1000) });
    fs.renameSync(tmpOut, p.outPath);
  } finally {
    try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
  }
  return { outPath: p.outPath, duration: total };
}
