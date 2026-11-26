export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { dbRepo } from '@/db/repository';
import { MUSIC_DIR } from '@/lib/app-paths';
import * as store from '@/lib/studio/store';
import { assetView, shortView, renderView } from '@/lib/studio/views';
import { validateEditDoc, type EditDoc } from '@/lib/render/edit-doc';
import { activeJobFor, listJobs } from '@/lib/jobs/queue';

function musicTracks() {
  const fromDb = (dbRepo.getMusicAssets() as any[])
    .filter((m) => m.filePath && fs.existsSync(path.join(MUSIC_DIR, path.basename(m.filePath))))
    .map((m) => ({ id: m.id, title: m.title, genre: m.genre, url: `/api/media/music/${encodeURIComponent(path.basename(m.filePath))}` }));
  if (fromDb.length) return fromDb;
  return fs.existsSync(MUSIC_DIR)
    ? fs.readdirSync(MUSIC_DIR).filter((f) => /\.(mp3|wav|m4a)$/i.test(f)).map((f) => ({ id: f, title: f.replace(/^mus_|\.[^.]+$/g, '').replace(/_/g, ' '), genre: '', url: `/api/media/music/${encodeURIComponent(f)}` }))
    : [];
}

/** Everything the editor needs: the short, its edit document, the source (preview URL, waveform), render history. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const short = store.getShort(id);
  if (!short) return NextResponse.json({ error: 'Short not found' }, { status: 404 });
  const asset = store.getProjectAsset(short.projectId);
  const job = activeJobFor(short.projectId, undefined, id);
  const lastJob = listJobs(short.projectId).find((j) => j.short_id === id) || null;
  const project = dbRepo.getProject(short.projectId) as any;
  // Waveform slice around the short (10 values/second) so the timeline can draw the audio.
  const pad = 30;
  const from = Math.max(0, Math.floor(short.startTime - pad));
  const to = Math.ceil(short.endTime + pad);
  return NextResponse.json({
    short: shortView(short),
    edit: short.edit,
    project: { id: short.projectId, title: project?.title },
    source: assetView(asset),
    waveform: asset?.waveform ? { start: from, perSecond: 10, peaks: asset.waveform.slice(from * 10, to * 10) } : null,
    renders: store.listRenders(id).map(renderView),
    job: job ? { id: job.id, type: job.type, status: job.status, progress: job.progress, message: job.message } : null,
    lastJob: lastJob ? { id: lastJob.id, type: lastJob.type, status: lastJob.status, error: lastJob.error, message: lastJob.message } : null,
    music: musicTracks(),
  });
}

/** Save the edit document (and optionally the title). Validated against the real source duration. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const short = store.getShort(id);
  if (!short) return NextResponse.json({ error: 'Short not found' }, { status: 404 });
  const asset = store.getProjectAsset(short.projectId);
  const body = await req.json();
  const edit = body.edit as EditDoc;
  const problems = validateEditDoc(edit, asset?.probe?.duration ?? Infinity);
  if (problems.length) return NextResponse.json({ error: problems.join(' '), problems }, { status: 422 });
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 120) : undefined;
  const saved = store.saveShortEdit(id, edit, { title });
  return NextResponse.json({ short: shortView(saved!), edit: saved!.edit });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const short = store.getShort(id);
  if (!short) return NextResponse.json({ error: 'Short not found' }, { status: 404 });
  if (activeJobFor(short.projectId, undefined, id)) return NextResponse.json({ error: 'Wait for the current render to finish.' }, { status: 409 });
  for (const r of store.listRenders(id)) if (r.outputPath) fs.rmSync(r.outputPath, { force: true });
  if (short.thumbnailPath) fs.rmSync(short.thumbnailPath, { force: true });
  store.deleteShort(id);
  try { dbRepo.permanentDeleteClip(`clip_${id}`); } catch {}
  return NextResponse.json({ success: true });
}
