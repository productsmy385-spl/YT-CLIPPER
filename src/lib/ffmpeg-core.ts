import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  codec: string;
  hasAudio: boolean;
  audioChannels: number;
  audioSampleRate: number;
  audioCodec: string;
}

export interface RenderValidationResult {
  isValid: boolean;
  errors: string[];
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  meanVolumeDb: number;
  maxVolumeDb: number;
  isBlackScreen: boolean;
  isSilentAudio: boolean;
  fileSizeBytes: number;
}

export function extractMeaningfulFfmpegError(stderr: string): string {
  if (!stderr) return 'Unknown FFmpeg execution error';
  const lines = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const errorMatches = lines.filter((line) => {
    const l = line.toLowerCase();
    return (
      l.includes('error') ||
      l.includes('invalid') ||
      l.includes('unable to') ||
      l.includes('failed') ||
      l.includes('no such') ||
      line.startsWith('[Parsed_') ||
      line.startsWith('[AVFilterGraph') ||
      line.startsWith('[fc#')
    );
  });

  if (errorMatches.length > 0) {
    const distinct = Array.from(new Set(errorMatches));
    return distinct.slice(-2).join(' | ');
  }

  return lines.slice(-2).join(' | ');
}

export const ffmpegCore = {
  // 1. Comprehensive probe of video and audio streams
  probe(filePath: string): VideoMetadata {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    const res = spawnSync(
      FFPROBE,
      [
        '-v', 'error',
        '-show_entries', 'stream=width,height,r_frame_rate,codec_name,codec_type,channels,sample_rate:format=duration,bit_rate',
        '-of', 'json',
        filePath,
      ],
      { encoding: 'utf8' }
    );

    if (res.status !== 0) {
      throw new Error(`FFprobe failed: ${res.stderr || 'Unknown error'}`);
    }

    const data = JSON.parse(res.stdout || '{}');
    const vStream = data.streams?.find((s: any) => s.codec_type === 'video' && s.width && s.height) || {};
    const aStream = data.streams?.find((s: any) => s.codec_type === 'audio') || {};
    const format = data.format || {};

    let fps = 30;
    if (vStream.r_frame_rate) {
      const [num, den] = vStream.r_frame_rate.split('/').map(Number);
      if (den > 0) fps = Math.round(num / den);
    }

    return {
      duration: Number(format.duration) || Number(vStream.duration) || 0,
      width: Number(vStream.width) || 1920,
      height: Number(vStream.height) || 1080,
      fps: fps || 30,
      bitrate: Number(format.bit_rate) || 0,
      codec: vStream.codec_name || 'h264',
      hasAudio: !!aStream.codec_name,
      audioChannels: Number(aStream.channels) || 0,
      audioSampleRate: Number(aStream.sample_rate) || 0,
      audioCodec: aStream.codec_name || '',
    };
  },

  // 2. Detect visual scene cuts
  detectScenes(videoPath: string, duration: number, threshold = 0.3): Array<{ start: number; end: number; duration: number }> {
    const res = spawnSync(
      FFMPEG,
      [
        '-i', videoPath,
        '-filter_complex', `select='gt(scene,${threshold})',metadata=print:key=lavfi.scene_score:file=-`,
        '-f', 'null',
        '-',
      ],
      { encoding: 'utf8' }
    );

    const timestamps: number[] = [0];
    const lines = (res.stderr || '').split('\n');
    const timeRegex = /pts_time:([0-9.]+)/;

    for (const line of lines) {
      const match = line.match(timeRegex);
      if (match && match[1]) {
        const t = parseFloat(match[1]);
        if (t > timestamps[timestamps.length - 1] + 1.5) {
          timestamps.push(t);
        }
      }
    }

    if (timestamps[timestamps.length - 1] < duration - 2) {
      timestamps.push(duration);
    }

    if (timestamps.length <= 2) {
      const chunk = Math.min(8.0, duration / 4);
      const generated: number[] = [0];
      for (let t = chunk; t < duration; t += chunk) {
        generated.push(Number(t.toFixed(2)));
      }
      generated.push(duration);
      return generated.slice(0, -1).map((start, idx) => ({
        start,
        end: generated[idx + 1],
        duration: Number((generated[idx + 1] - start).toFixed(2)),
      }));
    }

    const scenes: Array<{ start: number; end: number; duration: number }> = [];
    for (let i = 0; i < timestamps.length - 1; i++) {
      scenes.push({
        start: Number(timestamps[i].toFixed(2)),
        end: Number(timestamps[i + 1].toFixed(2)),
        duration: Number((timestamps[i + 1] - timestamps[i]).toFixed(2)),
      });
    }
    return scenes;
  },

  // 3. Extract audio volume peaks and energy levels
  analyzeAudioPeaks(videoPath: string, duration: number): Array<{ timestamp: number; volumeRms: number; energyLevel: 'low' | 'medium' | 'high' | 'peak' }> {
    const peaks: Array<{ timestamp: number; volumeRms: number; energyLevel: 'low' | 'medium' | 'high' | 'peak' }> = [];
    const step = 2.0;

    for (let t = 0; t < duration; t += step) {
      const res = spawnSync(
        FFMPEG,
        [
          '-ss', String(t),
          '-t', String(step),
          '-i', videoPath,
          '-af', 'volumedetect',
          '-f', 'null',
          '-',
        ],
        { encoding: 'utf8' }
      );

      const meanMatch = (res.stderr || '').match(/mean_volume:\s*(-?[0-9.]+)\s*dB/);
      const meanDb = meanMatch ? parseFloat(meanMatch[1]) : -35;
      const normalizedRms = Math.max(0, Math.min(1, (meanDb + 50) / 40));

      let energyLevel: 'low' | 'medium' | 'high' | 'peak' = 'low';
      if (normalizedRms > 0.85) energyLevel = 'peak';
      else if (normalizedRms > 0.65) energyLevel = 'high';
      else if (normalizedRms > 0.40) energyLevel = 'medium';

      peaks.push({
        timestamp: Number(t.toFixed(2)),
        volumeRms: Number(normalizedRms.toFixed(3)),
        energyLevel,
      });
    }
    return peaks;
  },

  // 4. Cut raw clip segment preserving BOTH video and original audio streams
  cutSegment(inputVideo: string, start: number, duration: number, outputClip: string) {
    fs.mkdirSync(path.dirname(outputClip), { recursive: true });
    const meta = this.probe(inputVideo);

    const args = [
      '-y',
      '-ss', String(start),
      '-i', inputVideo,
      '-t', String(duration),
      '-map', '0:v:0',
    ];

    if (meta.hasAudio) {
      // Map original audio stream explicitly, resample to 48kHz stereo to ensure clean sync
      args.push(
        '-map', '0:a:0',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-af', 'aresample=async=1'
      );
    }

    args.push(
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '19',
      '-pix_fmt', 'yuv420p',
      outputClip
    );

    return new Promise<void>((resolve, reject) => {
      const child = spawn(FFMPEG, args);
      let stderr = '';
      child.stderr?.on('data', (d) => { stderr += d.toString(); });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Cut segment failed for ${inputVideo} (code ${code}): ${stderr.slice(-400)}`));
      });
    });
  },

  // 5. Programmatic 9:16 Vertical Composition with Original Gameplay Preservation,
  // Smart Dual-Mode Cropping (Blurred Background vs Action Crop), Audio Ducking, and Memes
  async renderVerticalShort(params: {
    sourceClip: string;
    outputPath: string;
    duration: number;
    layoutMode?: 'blurred_background' | 'center_crop';
    cropX?: number; // 0.0 to 1.0 (default 0.5)
    zoomScale?: number;
    memeOverlayPath?: string;
    memeStart?: number;
    memeDuration?: number;
    bgmPath?: string;
    bgmVolume?: number; // default 0.18
    sfxEvents?: Array<{ sfxPath: string; timestamp: number; volume: number }>;
    subtitleAssPath?: string;
    skipSubtitles?: boolean;
    skipOptionalAudio?: boolean;
  }) {
    const {
      sourceClip,
      outputPath,
      duration,
      layoutMode = 'blurred_background',
      cropX = 0.5,
      zoomScale = 1.05,
      memeOverlayPath,
      memeStart = 3.0,
      memeDuration = 2.0,
      bgmPath,
      bgmVolume = 0.18,
      sfxEvents = [],
      subtitleAssPath,
      skipSubtitles = false,
      skipOptionalAudio = false,
    } = params;

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const sourceMeta = this.probe(sourceClip);

    // Maintain accurate integer stream index: 0 is always sourceClip
    const inputs: string[] = ['-y', '-i', sourceClip];
    let nextInputIdx = 1;

    const filterParts: string[] = [];

    // --- VIDEO PIPELINE ---
    if (layoutMode === 'blurred_background') {
      // High-End Gaming Shorts Layout:
      // Background: Source gameplay scaled & cropped to 1080x1920 with smooth boxblur
      // Foreground: 100% full original gameplay scaled to 1080 width, centered vertically at (H-h)/2
      filterParts.push(
        `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=25:5[bg]`,
        `[0:v]scale=1080:-1[fg]`,
        `[bg][fg]overlay=(W-w)/2:(H-h)/2[v_base]`
      );
    } else {
      // Direct 9:16 Action Crop:
      filterParts.push(
        `[0:v]crop=ih*9/16:ih:min(max(0\\,(iw-ih*9/16)*${cropX})\\,iw-ih*9/16):0,scale=1080:1920[v_base]`
      );
    }

    // Meme Overlay (PiP at top-right or center)
    let currentV = '[v_base]';
    if (!skipOptionalAudio && memeOverlayPath && fs.existsSync(memeOverlayPath)) {
      const memeIdx = nextInputIdx++;
      const isImage = /\.(png|jpe?g|webp|bmp|gif)$/i.test(memeOverlayPath);
      if (isImage) {
        inputs.push('-loop', '1', '-i', memeOverlayPath);
      } else {
        inputs.push('-i', memeOverlayPath);
      }
      filterParts.push(
        `[${memeIdx}:v]scale=320:320[meme_scaled]`,
        `${currentV}[meme_scaled]overlay=W-w-30:90:enable='between(t,${memeStart},${memeStart + memeDuration})':eof_action=repeat[v_meme]`
      );
      currentV = '[v_meme]';
    }

    // Subtitles (ASS Burn-in)
    if (!skipSubtitles && subtitleAssPath && fs.existsSync(subtitleAssPath)) {
      // Use forward-slash relative path if possible to avoid Windows colon escaping bugs in FFmpeg
      const relPath = path.relative(process.cwd(), subtitleAssPath).split(path.sep).join('/');
      const filterAssPath = (!relPath.startsWith('..') && !path.isAbsolute(relPath))
        ? relPath
        : subtitleAssPath.split(path.sep).join('/').replace(/:/g, '\\:');
      filterParts.push(`${currentV}ass='${filterAssPath}'[v_out]`);
    } else {
      filterParts.push(`${currentV}null[v_out]`);
    }

    // --- AUDIO PIPELINE ---
    // Priority: Original Streamer Voice > Original Gameplay Audio > SFX > Background Music (ducked)
    if (sourceMeta.hasAudio) {
      filterParts.push(
        `[0:a]aformat=channel_layouts=stereo:sample_rates=48000,volume=1.1[master_audio]`
      );
    } else {
      // Source video has no audio track: provide clean 48kHz stereo silence as base channel
      filterParts.push(
        `aevalsrc=0:d=${duration}:s=48000:c=stereo[master_audio]`
      );
    }

    const mixInputs = ['[master_audio]'];

    if (!skipOptionalAudio) {
      // BGM with auto-ducking (low volume, smooth in/out)
      if (bgmPath && fs.existsSync(bgmPath)) {
        const bgmIdx = nextInputIdx++;
        inputs.push('-i', bgmPath);
        const safeFadeOut = Math.max(0, duration - 1.5);
        filterParts.push(
          `[${bgmIdx}:a]aformat=channel_layouts=stereo:sample_rates=48000,aloop=loop=-1:size=2880000,atrim=0:${duration},volume=${bgmVolume},afade=t=in:ss=0:d=1,afade=t=out:st=${safeFadeOut}:d=1.5[bgm_ducked]`
        );
        mixInputs.push('[bgm_ducked]');
      }

      // SFX Events placed without attenuating voice
      sfxEvents.forEach((sfx, idx) => {
        if (sfx.sfxPath && fs.existsSync(sfx.sfxPath)) {
          const sfxIdx = nextInputIdx++;
          inputs.push('-i', sfx.sfxPath);
          const delayMs = Math.max(0, Math.round(sfx.timestamp * 1000));
          filterParts.push(
            `[${sfxIdx}:a]aformat=channel_layouts=stereo:sample_rates=48000,adelay=${delayMs}|${delayMs},volume=${sfx.volume}[sfx_${idx}]`
          );
          mixInputs.push(`[sfx_${idx}]`);
        }
      });
    }

    if (mixInputs.length > 1) {
      // Use normalize=0 to guarantee original master audio is NEVER quieted down
      filterParts.push(
        `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first:normalize=0,alimiter=limit=0.95[a_out]`
      );
    } else {
      filterParts.push(`[master_audio]alimiter=limit=0.95[a_out]`);
    }

    const args = [
      ...inputs,
      '-filter_complex', filterParts.join(';'),
      '-map', '[v_out]',
      '-map', '[a_out]',
      '-t', String(duration),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '19',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      outputPath,
    ];

    return new Promise<void>((resolve, reject) => {
      const child = spawn(FFMPEG, args);
      let fullStderr = '';
      child.stderr?.on('data', (d) => { fullStderr += d.toString(); });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else {
          const meaningfulErr = extractMeaningfulFfmpegError(fullStderr);
          const err: any = new Error(`Vertical render failed (code ${code}): ${meaningfulErr}`);
          err.fullStderr = fullStderr;
          err.exitCode = code;
          reject(err);
        }
      });
    });
  },

  // 5b. Modular Basic Vertical Conversion (Independent Testable Stage)
  async renderBasicVertical(params: {
    sourceClip: string;
    outputPath: string;
    duration: number;
    layoutMode?: 'blurred_background' | 'center_crop';
    cropX?: number;
  }) {
    return this.renderVerticalShort({
      ...params,
      skipSubtitles: true,
      skipOptionalAudio: true,
    });
  },

  // 5c. Modular Subtitle Only Burn-in
  async renderVerticalWithSubtitles(params: {
    sourceClip: string;
    outputPath: string;
    duration: number;
    subtitleAssPath: string;
    layoutMode?: 'blurred_background' | 'center_crop';
    cropX?: number;
  }) {
    return this.renderVerticalShort({
      ...params,
      skipSubtitles: false,
      skipOptionalAudio: true,
    });
  },

  // 6. Mandatory Pre-Export Rendering Validation Engine
  validateRenderedVideo(filePath: string, expectedDuration?: number): RenderValidationResult {
    const errors: string[] = [];

    if (!fs.existsSync(filePath)) {
      return {
        isValid: false,
        errors: [`Rendered file does not exist: ${filePath}`],
        duration: 0,
        width: 0,
        height: 0,
        fps: 0,
        hasAudio: false,
        meanVolumeDb: -99,
        maxVolumeDb: -99,
        isBlackScreen: true,
        isSilentAudio: true,
        fileSizeBytes: 0,
      };
    }

    const fileSizeBytes = fs.statSync(filePath).size;
    if (fileSizeBytes < 150000) {
      errors.push(`Output file size too small (${fileSizeBytes} bytes). Likely an empty or corrupt render.`);
    }

    // 1. Probe stream properties
    let meta: VideoMetadata;
    try {
      meta = this.probe(filePath);
    } catch (err: any) {
      return {
        isValid: false,
        errors: [`FFprobe inspection failed: ${err.message}`],
        duration: 0,
        width: 0,
        height: 0,
        fps: 0,
        hasAudio: false,
        meanVolumeDb: -99,
        maxVolumeDb: -99,
        isBlackScreen: true,
        isSilentAudio: true,
        fileSizeBytes,
      };
    }

    if (meta.width !== 1080 || meta.height !== 1920) {
      errors.push(`Invalid resolution: ${meta.width}x${meta.height}. Expected 1080x1920 9:16 vertical.`);
    }

    if (meta.duration <= 0) {
      errors.push(`Invalid video duration: ${meta.duration}s. Expected > 0.`);
    }

    if (expectedDuration && Math.abs(meta.duration - expectedDuration) > 1.5) {
      errors.push(`Duration mismatch: output is ${meta.duration}s, expected ~${expectedDuration}s.`);
    }

    if (!meta.hasAudio) {
      errors.push(`Missing audio stream in exported video.`);
    }

    // 2. Complete Decodability Test (ensure no corrupt video frames)
    const decodeCheck = spawnSync(
      FFMPEG,
      ['-v', 'error', '-i', filePath, '-f', 'null', '-'],
      { encoding: 'utf8' }
    );
    if (decodeCheck.status !== 0 && (decodeCheck.stderr || '').length > 0) {
      errors.push(`Corrupt video container: FFmpeg decode error: ${decodeCheck.stderr.slice(0, 150)}`);
    }

    // 3. Black Screen Detection (verify video contains actual gameplay frames)
    const isBlackScreen = this.checkBlackFrames(filePath, meta.duration);
    if (isBlackScreen) {
      errors.push(`Black screen detected: video contains empty or unrendered frames.`);
    }

    // 4. Audio Loudness & Presence Check (verify original voice is audible, not silent or beep)
    let meanVolumeDb = -99;
    let maxVolumeDb = -99;
    let isSilentAudio = true;

    if (meta.hasAudio) {
      const volCheck = spawnSync(
        FFMPEG,
        ['-i', filePath, '-af', 'volumedetect', '-f', 'null', '-'],
        { encoding: 'utf8' }
      );
      const meanMatch = (volCheck.stderr || '').match(/mean_volume:\s*(-?[0-9.]+)\s*dB/);
      const maxMatch = (volCheck.stderr || '').match(/max_volume:\s*(-?[0-9.]+)\s*dB/);

      if (meanMatch) meanVolumeDb = parseFloat(meanMatch[1]);
      if (maxMatch) maxVolumeDb = parseFloat(maxMatch[1]);

      // If mean volume is below -50dB, audio is effectively digital silence
      isSilentAudio = meanVolumeDb < -50;
      if (isSilentAudio) {
        errors.push(`Original streamer audio missing: output audio volume is silent (${meanVolumeDb} dB).`);
      }
    }

    const isValid = errors.length === 0;

    return {
      isValid,
      errors,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      fps: meta.fps,
      hasAudio: meta.hasAudio,
      meanVolumeDb,
      maxVolumeDb,
      isBlackScreen,
      isSilentAudio,
      fileSizeBytes,
    };
  },

  // 7. Black frame detector: detects unrendered, empty black screens while allowing standard cinematic cuts
  checkBlackFrames(videoPath: string, totalDuration?: number): boolean {
    const res = spawnSync(
      FFMPEG,
      ['-i', videoPath, '-vf', 'blackdetect=d=1.0:pix_th=0.10', '-f', 'null', '-'],
      { encoding: 'utf8' }
    );
    const stderr = res.stderr || '';
    const matches = [...stderr.matchAll(/black_duration:([0-9.]+)/g)];
    if (matches.length === 0) return false;

    const durations = matches.map((m) => parseFloat(m[1]));
    const totalBlack = durations.reduce((sum, d) => sum + d, 0);
    const longestBlack = Math.max(...durations);

    // If total video duration is provided:
    // Video is only considered black if uninterrupted black duration is >= 50% of the video
    // or total black spans >= 70% of the video duration.
    if (totalDuration && totalDuration > 0) {
      if (totalBlack >= totalDuration * 0.70) return true;
      if (longestBlack >= Math.min(10.0, totalDuration * 0.50)) return true;
      return false;
    }

    // Default: only considered black screen if an uninterrupted black segment is >= 10 seconds,
    // or total black exceeds 15 seconds
    return longestBlack >= 10.0 || totalBlack >= 15.0;
  },

  // 8. Audio clipping check
  checkAudioClipping(videoPath: string): boolean {
    const res = spawnSync(
      FFMPEG,
      ['-i', videoPath, '-af', 'astats=metadata=1:reset=1', '-f', 'null', '-'],
      { encoding: 'utf8' }
    );
    const peakMatch = (res.stderr || '').match(/Peak level dB:\s*(-?[0-9.]+)/);
    if (peakMatch) {
      const peakDb = parseFloat(peakMatch[1]);
      return peakDb >= 0.0;
    }
    return false;
  },
};
