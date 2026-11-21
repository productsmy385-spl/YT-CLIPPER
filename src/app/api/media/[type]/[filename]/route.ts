export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
  APP_ROOT,
  STORAGE_DIR,
  STORAGE_PROJECTS_DIR,
  STORAGE_CLIPS_DIR,
  STORAGE_EXPORTS_DIR,
  STORAGE_UPLOADS_DIR,
  STORAGE_AVATARS_DIR,
  SAMPLES_DIR,
  SFX_DIR,
  MUSIC_DIR,
  MEMES_DIR,
} from '@/lib/app-paths';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; filename: string }> }
) {
  const { type, filename } = await params;

  // Search candidate base directories safely
  let candidatePaths: string[] = [];
  const decodedFilename = decodeURIComponent(filename);
  const sanitizedFilename = path.basename(decodedFilename);

  if (type === 'clips') {
    candidatePaths.push(path.resolve(STORAGE_CLIPS_DIR, sanitizedFilename));
    if (fs.existsSync(STORAGE_PROJECTS_DIR)) {
      try {
        const projDirs = fs.readdirSync(STORAGE_PROJECTS_DIR);
        for (const pd of projDirs) {
          candidatePaths.push(
            path.resolve(STORAGE_PROJECTS_DIR, pd, 'extracted', sanitizedFilename),
            path.resolve(STORAGE_PROJECTS_DIR, pd, 'edited', sanitizedFilename)
          );
        }
      } catch {}
    }
  } else if (type === 'sources') {
    candidatePaths.push(
      path.resolve(APP_ROOT, 'storage', 'authorized_sources', sanitizedFilename),
      path.resolve(APP_ROOT, '..', 'storage', 'authorized_sources', sanitizedFilename),
      path.resolve(STORAGE_UPLOADS_DIR, sanitizedFilename),
      path.resolve(SAMPLES_DIR, sanitizedFilename)
    );
    if (fs.existsSync(STORAGE_PROJECTS_DIR)) {
      try {
        const projDirs = fs.readdirSync(STORAGE_PROJECTS_DIR);
        for (const pd of projDirs) {
          candidatePaths.push(path.resolve(STORAGE_PROJECTS_DIR, pd, 'source', sanitizedFilename));
        }
      } catch {}
    }
  } else if (type === 'exports') {
    candidatePaths.push(path.resolve(STORAGE_EXPORTS_DIR, sanitizedFilename));
    if (fs.existsSync(STORAGE_PROJECTS_DIR)) {
      try {
        const projDirs = fs.readdirSync(STORAGE_PROJECTS_DIR);
        for (const pd of projDirs) {
          candidatePaths.push(path.resolve(STORAGE_PROJECTS_DIR, pd, 'exports', sanitizedFilename));
        }
      } catch {}
    }
  } else if (type === 'uploads') {
    candidatePaths.push(path.resolve(STORAGE_UPLOADS_DIR, sanitizedFilename));
  } else if (type === 'avatars' || type === 'avatar') {
    candidatePaths.push(path.resolve(STORAGE_AVATARS_DIR, sanitizedFilename));
  } else if (type === 'samples') {
    candidatePaths.push(path.resolve(SAMPLES_DIR, sanitizedFilename));
  } else if (type === 'sfx') {
    candidatePaths.push(
      path.resolve(SFX_DIR, 'gaming_memes', sanitizedFilename),
      path.resolve(SFX_DIR, sanitizedFilename),
      path.resolve(APP_ROOT, '..', 'sounds', 'gaming_memes', sanitizedFilename),
      path.resolve(APP_ROOT, '..', 'sounds', 'trending_memes', sanitizedFilename),
      path.resolve(APP_ROOT, 'sounds', 'gaming_memes', sanitizedFilename),
      path.resolve(APP_ROOT, 'sounds', 'trending_memes', sanitizedFilename)
    );
  } else if (type === 'music') {
    candidatePaths.push(path.resolve(MUSIC_DIR, sanitizedFilename));
  } else if (type === 'memes') {
    candidatePaths.push(path.resolve(MEMES_DIR, sanitizedFilename));
  } else {
    return new NextResponse('Invalid media type', { status: 400 });
  }

  const filePath = candidatePaths.find((p) => fs.existsSync(p));

  if (!filePath || !fs.existsSync(filePath)) {
    return new NextResponse('Media file not found', { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.get('range');

  const contentType = sanitizedFilename.endsWith('.mp4')
    ? 'video/mp4'
    : sanitizedFilename.endsWith('.wav')
    ? 'audio/wav'
    : sanitizedFilename.endsWith('.mp3')
    ? 'audio/mpeg'
    : sanitizedFilename.endsWith('.png')
    ? 'image/png'
    : sanitizedFilename.endsWith('.webm')
    ? 'video/webm'
    : 'application/octet-stream';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;

    const fileStream = fs.createReadStream(filePath, { start, end });
    const webStream = Readable.toWeb(fileStream) as any;

    return new NextResponse(webStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize.toString(),
        'Content-Type': contentType,
      },
    });
  } else {
    const fileStream = fs.createReadStream(filePath);
    const webStream = Readable.toWeb(fileStream) as any;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Length': fileSize.toString(),
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      },
    });
  }
}
