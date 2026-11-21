export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { videoIngestionEngine } from '@/lib/video-ingestion';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, filePath, title, useAuthorizedFallback } = body;

    const sourceInfo = await videoIngestionEngine.inspectAndIngest({
      url,
      filePath,
      title,
      useAuthorizedFallback,
    });

    return NextResponse.json({
      success: true,
      sourceInfo,
    });
  } catch (error: any) {
    console.error('[IngestAPI] Ingestion error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Ingestion engine failure',
      },
      { status: 500 }
    );
  }
}
