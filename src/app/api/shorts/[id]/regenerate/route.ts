export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/lib/studio/store';
import { activeJobFor, enqueueJob } from '@/lib/jobs/queue';

/** Re-pick this short's moment (optionally at a new duration), re-caption and re-render it. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const short = store.getShort(id);
  if (!short) return NextResponse.json({ error: 'Short not found' }, { status: 404 });
  if (activeJobFor(short.projectId, undefined, id)) return NextResponse.json({ error: 'This short is already being processed.' }, { status: 409 });
  let duration: number | undefined;
  try {
    const body = await req.json();
    if (body?.duration !== undefined) duration = Math.max(5, Math.min(180, Number(body.duration)));
  } catch {}
  const job = enqueueJob({ type: 'regenerate_short', projectId: short.projectId, shortId: id, payload: { duration }, maxAttempts: 2 });
  store.updateShort(id, { status: 'rendering' });
  return NextResponse.json({ jobId: job.id });
}
