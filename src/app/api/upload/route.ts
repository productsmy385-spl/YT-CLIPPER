export const dynamic = 'force-dynamic';
export const maxDuration = 3600;
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { STORAGE_UPLOADS_DIR } from '@/lib/app-paths';
import { probe } from '@/lib/media/ff';
import { isAuthorized, UNAUTHORIZED_HEADERS } from '@/lib/auth-gate';

const ALLOWED = new Set(['.mp4', '.mov', '.webm', '.mkv', '.m4v']);
const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 8 * 1024 ** 3);

/**
 * Streaming upload. The browser sends the raw file body (Content-Type: application/octet-stream) with the
 * original name in `x-file-name`. The body is piped straight to disk (no in-memory buffering), so multi-GB
 * recordings work. The file is then validated with FFprobe; invalid files are deleted immediately.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers: UNAUTHORIZED_HEADERS });
  }
  const rawName = decodeURIComponent(req.headers.get('x-file-name') || '');
  const ext = path.extname(rawName).toLowerCase();
  if (!rawName || !ALLOWED.has(ext)) {
    return NextResponse.json({ error: 'Unsupported file type. Upload an MP4, MOV, WebM or MKV video.' }, { status: 415 });
  }
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) {
    return NextResponse.json({ error: `The file is larger than the ${(MAX_BYTES / 1024 ** 3).toFixed(0)} GB limit.` }, { status: 413 });
  }
  if (!req.body) return NextResponse.json({ error: 'No file received.' }, { status: 400 });

  const safe = path.basename(rawName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const name = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safe}`;
  const dest = path.join(STORAGE_UPLOADS_DIR, name);
  fs.mkdirSync(STORAGE_UPLOADS_DIR, { recursive: true });

  let received = 0;
  try {
    const source = Readable.fromWeb(req.body as any);
    source.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > MAX_BYTES) source.destroy(new Error('File exceeds the upload limit.'));
    });
    await pipeline(source, fs.createWriteStream(dest));
  } catch (err: any) {
    fs.rmSync(dest, { force: true });
    console.error(`[UploadAPI] Upload of ${safe} failed after ${received} bytes: ${err.message}`);
    return NextResponse.json({ error: received > MAX_BYTES ? 'The file is too large.' : 'The upload was interrupted. Please try again.' }, { status: 400 });
  }

  try {
    const info = await probe(dest);
    if (!info.hasVideo || info.duration <= 0.5) throw new Error('No playable video stream was found in this file.');
    return NextResponse.json({
      uploadId: name,
      fileName: rawName,
      size: received,
      duration: info.duration,
      width: info.width,
      height: info.height,
      fps: info.fps,
      videoCodec: info.videoCodec,
      hasAudio: info.hasAudio,
      audioCodec: info.audioCodec,
    });
  } catch (err: any) {
    fs.rmSync(dest, { force: true });
    return NextResponse.json({ error: `This file can't be used: ${err.message.replace(/^FFprobe could not read the file: /, '')}` }, { status: 422 });
  }
}
