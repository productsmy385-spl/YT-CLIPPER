export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { inspectYouTubeVideo } from '@/lib/youtube/media-source';

/**
 * Inspect a YouTube URL. Returns metadata AND an honest answer to "can the server get the actual video?".
 * Metadata alone never counts as acquisition.
 */
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    const result = await inspectYouTubeVideo(String(url || ''));
    if ('error' in result) return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
    return NextResponse.json({ ok: true, video: result });
  } catch (err: any) {
    console.error('[IngestAPI] Inspection failed:', err.message);
    return NextResponse.json({ ok: false, error: 'Could not inspect this link right now. Try again in a moment.' }, { status: 502 });
  }
}
