export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { ffmpegCore } from '@/lib/ffmpeg-core';
import { STORAGE_UPLOADS_DIR } from '@/lib/app-paths';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('video') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No video file provided' }, { status: 400 });
    }

    const uploadsDir = STORAGE_UPLOADS_DIR;
    fs.mkdirSync(uploadsDir, { recursive: true });

    // Sanitize file name and create timestamped destination
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetFileName = `${Date.now()}_${sanitizedName}`;
    const targetFilePath = path.join(uploadsDir, targetFileName);

    // Save uploaded file buffer to disk
    const arrayBuffer = await file.arrayBuffer();
    fs.writeFileSync(targetFilePath, Buffer.from(arrayBuffer));

    // Probe video using FFprobe to verify video frames & audio
    const meta = ffmpegCore.probe(targetFilePath);

    console.log(`[UploadAPI] Successfully received video: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);
    console.log(`[UploadAPI] Resolution: ${meta.width}x${meta.height} | Duration: ${meta.duration.toFixed(1)}s | Audio: ${meta.hasAudio}`);

    return NextResponse.json({
      success: true,
      filePath: targetFilePath,
      fileName: file.name,
      fileSize: file.size,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      fps: meta.fps,
      hasAudio: meta.hasAudio,
      audioChannels: meta.audioChannels,
      audioCodec: meta.audioCodec,
    });
  } catch (error: any) {
    console.error('[UploadAPI] Error saving uploaded video:', error);
    return NextResponse.json({ error: error.message || 'Failed to process uploaded video' }, { status: 500 });
  }
}
