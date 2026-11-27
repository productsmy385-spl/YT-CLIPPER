export const dynamic = 'force-dynamic';
export const maxDuration = 3600;
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { STORAGE_DIR } from '@/lib/app-paths';
import { rejectUnlessSyncAuthorized, receiveBodyToFile } from '@/lib/sync/receive';
import { isValidProjectId, safeRelative } from '@/lib/sync/sync-core';

/** "Send to production", step 1: files of one project, kept under storage/projects/<id>/. */

function projectRoot(id: string) {
  return path.join(STORAGE_DIR, 'projects', id);
}

function walk(dir: string, base: string, out: Record<string, number>) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else if (e.isFile() && !e.name.includes('.incoming-')) out[path.relative(base, p).split(path.sep).join('/')] = fs.statSync(p).size;
  }
}

/** Sizes of the files production already has for this project, so the sender skips them. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = rejectUnlessSyncAuthorized(req);
  if (denied) return denied;
  const { id } = await params;
  if (!isValidProjectId(id)) return NextResponse.json({ error: 'Invalid project id.' }, { status: 400 });
  const files: Record<string, number> = {};
  walk(projectRoot(id), STORAGE_DIR, files);
  return NextResponse.json({ files });
}

/** Upload one file. `?path=` is storage-relative and must lie inside projects/<id>/. Body = raw bytes. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = rejectUnlessSyncAuthorized(req);
  if (denied) return denied;
  const { id } = await params;
  if (!isValidProjectId(id)) return NextResponse.json({ error: 'Invalid project id.' }, { status: 400 });
  const rel = safeRelative(req.nextUrl.searchParams.get('path') || '');
  if (!rel || !rel.startsWith(`projects/${id}/`)) return NextResponse.json({ error: 'File path must be inside this project.' }, { status: 400 });
  try {
    const bytes = await receiveBodyToFile(req, path.join(STORAGE_DIR, ...rel.split('/')));
    return NextResponse.json({ success: true, bytes });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'The upload was interrupted.' }, { status: 400 });
  }
}
