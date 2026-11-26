export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/lib/studio/store';
import { activeJobFor, enqueueJob } from '@/lib/jobs/queue';

/** Queue a backend FFmpeg render of the short's saved edit document. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const short = store.getShort(id);
  if (!short) return NextResponse.json({ error: 'Short not found' }, { status: 404 });
  const existing = activeJobFor(short.projectId, undefined, id);
  if (existing) return NextResponse.json({ jobId: existing.id, alreadyQueued: true });
  const job = enqueueJob({ type: 'render_short', projectId: short.projectId, shortId: id, maxAttempts: 2 });
  store.updateShort(id, { status: 'rendering' });
  return NextResponse.json({ jobId: job.id });
}
