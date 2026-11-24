export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { videoIngestionEngine } from '@/lib/video-ingestion';
import { rightsEngine } from '@/lib/rights-engine';
import { sourceAcquisitionEngine } from '@/lib/source-acquisition';

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

    let rights: any = null;
    let acquisition: any = null;

    if (sourceInfo.videoId) {
      rights = await rightsEngine.checkSourceRights({
        videoId: sourceInfo.videoId,
        sourceUrl: sourceInfo.url || url,
        creatorName: sourceInfo.authorName,
      });

      acquisition = await sourceAcquisitionEngine.checkAcquisitionAvailability({
        videoId: sourceInfo.videoId,
        sourceUrl: sourceInfo.url || url,
        creatorName: sourceInfo.authorName,
        rights,
      });

      // If metadata was retrieved successfully, the user is eligible to initiate extraction.
      // The backend media acquisition pipeline will resolve the media upon starting extraction.
      if (sourceInfo.metadataRetrieved && !sourceInfo.errorState) {
        sourceInfo.canProcess = true;
      }
    }

    return NextResponse.json({
      success: true,
      sourceInfo,
      rights,
      acquisition,
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
