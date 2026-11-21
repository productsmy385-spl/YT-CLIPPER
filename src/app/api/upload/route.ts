export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { ffmpegCore } from '@/lib/ffmpeg-core';
import { STORAGE_UPLOADS_DIR } from '@/lib/app-paths';
import { computeFileChecksum } from '@/lib/video-ingestion';
import { dbRepo } from '@/db/repository';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('video') as File | null;
    const targetVideoId = formData.get('videoId') as string | null;
    const confirmReuse = formData.get('confirmReuse') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No video file provided' }, { status: 400 });
    }

    // Validate container format
    const lowerName = file.name.toLowerCase();
    const isValidExt = lowerName.endsWith('.mp4') || lowerName.endsWith('.mov') || lowerName.endsWith('.webm') || lowerName.endsWith('.mkv');
    if (!isValidExt) {
      return NextResponse.json(
        { error: 'Unsupported file format. Please upload an authorized .mp4, .mov, or .webm video file.' },
        { status: 400 }
      );
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

    // Probe video using FFprobe to verify video stream & duration
    let meta: any;
    try {
      meta = ffmpegCore.probe(targetFilePath);
      if (!meta || meta.duration <= 0 || meta.width <= 0 || meta.height <= 0) {
        throw new Error('Video stream contains 0 seconds duration or corrupted frames.');
      }
    } catch (probeErr: any) {
      try { fs.unlinkSync(targetFilePath); } catch {}
      return NextResponse.json(
        { error: `FFprobe failed to inspect video: ${probeErr.message}` },
        { status: 422 }
      );
    }

    // Compute cryptographic SHA-256 checksum
    const checksum = computeFileChecksum(targetFilePath);

    console.log(`[UploadAPI] Received video: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);
    console.log(`[UploadAPI] Resolution: ${meta.width}x${meta.height} | Duration: ${meta.duration.toFixed(1)}s | SHA-256: ${checksum}`);

    // Check if this recording is already assigned to another project
    const existingProject = dbRepo.getProjectBySourceChecksum(checksum);
    if (existingProject && confirmReuse !== 'true') {
      console.log(`[UploadAPI] Recording already attached to project ${existingProject.id} (${existingProject.title}). Requesting user confirmation.`);
      return NextResponse.json({
        success: false,
        requiresConfirmation: true,
        warning: 'DUPLICATE_SOURCE_DETECTED',
        message: `This recording was previously processed in project "${existingProject.title}". Do you want to attach it anyway for a new independent project?`,
        existingProject: {
          id: existingProject.id,
          title: existingProject.title,
          status: existingProject.status,
          createdAt: existingProject.created_at,
        },
        filePath: targetFilePath,
        checksum,
        fileName: file.name,
        fileSize: file.size,
        duration: meta.duration,
        width: meta.width,
        height: meta.height,
        fps: meta.fps,
        hasAudio: meta.hasAudio,
        audioChannels: meta.audioChannels,
        audioCodec: meta.audioCodec,
        videoId: targetVideoId || undefined,
      });
    }

    return NextResponse.json({
      success: true,
      filePath: targetFilePath,
      checksum,
      fileName: file.name,
      fileSize: file.size,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      fps: meta.fps,
      hasAudio: meta.hasAudio,
      audioChannels: meta.audioChannels,
      audioCodec: meta.audioCodec,
      videoId: targetVideoId || undefined,
    });
  } catch (error: any) {
    console.error('[UploadAPI] Error saving uploaded video:', error);
    return NextResponse.json({ error: error.message || 'Failed to process uploaded video' }, { status: 500 });
  }
}
