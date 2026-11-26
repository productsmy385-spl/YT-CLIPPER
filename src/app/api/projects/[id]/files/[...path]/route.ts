export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { dbRepo } from '@/db/repository';
import { STORAGE_PROJECTS_DIR } from '@/lib/app-paths';

const TYPES: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};

/**
 * Serves files from one project's storage folder only (path traversal is rejected), with HTTP Range support
 * so the editor can seek in large videos. `?download=1` sets a friendly attachment filename.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path: parts } = await params;
  const project = dbRepo.getProject(id) as any;
  if (!project || !/^[\w-]+$/.test(id)) return new NextResponse('Not found', { status: 404 });

  const base = path.resolve(STORAGE_PROJECTS_DIR, id);
  const file = path.resolve(base, ...parts.map((p) => decodeURIComponent(p)));
  if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return new NextResponse('Not found', { status: 404 });
  }

  const size = fs.statSync(file).size;
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const headers: Record<string, string> = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=60' };
  if (req.nextUrl.searchParams.get('download')) {
    const nice = `${String(project.title || 'short').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'short'}${path.extname(file)}`;
    headers['Content-Disposition'] = `attachment; filename="${nice}"`;
  }

  const range = req.headers.get('range');
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m) {
    let start = m[1] ? Number(m[1]) : NaN;
    let end = m[2] ? Number(m[2]) : NaN;
    if (Number.isNaN(start)) { start = Math.max(0, size - (Number.isNaN(end) ? 0 : end)); end = size - 1; } // suffix range
    if (Number.isNaN(end) || end >= size) end = size - 1;
    if (start > end || start >= size) return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    return new NextResponse(Readable.toWeb(fs.createReadStream(file, { start, end })) as any, {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
    });
  }
  return new NextResponse(Readable.toWeb(fs.createReadStream(file)) as any, { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
}
