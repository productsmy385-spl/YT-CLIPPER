export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { rightsEngine } from '@/lib/rights-engine';
import { videoIngestionEngine } from '@/lib/video-ingestion';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, videoId, channelId, creatorName } = body;

    let targetVideoId = videoId;
    let targetUrl = url;

    if (url) {
      const parsed = videoIngestionEngine.parseYouTubeUrl(url);
      if (parsed.isValid && parsed.videoId) {
        targetVideoId = parsed.videoId;
        targetUrl = parsed.cleanUrl;
      }
    }

    if (!targetVideoId) {
      return NextResponse.json({ error: 'Please provide either a valid YouTube URL or videoId.' }, { status: 400 });
    }

    const checkResult = await rightsEngine.checkSourceRights({
      videoId: targetVideoId,
      channelId,
      sourceUrl: targetUrl,
      creatorName,
    });

    return NextResponse.json({
      success: true,
      result: checkResult,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
