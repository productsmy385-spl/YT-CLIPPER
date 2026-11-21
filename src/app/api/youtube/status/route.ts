export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { youtubeOAuth } from '@/lib/youtube/oauth';

export async function GET() {
  try {
    const report = await youtubeOAuth.getStatusReport();
    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error: any) {
    console.error('[YouTubeStatusAPI] Error checking status:', error);
    return NextResponse.json(
      {
        success: false,
        report: {
          state: 'CONNECTION_ERROR',
          connected: false,
          channel: null,
          scopes: [],
          lastChecked: new Date().toISOString(),
          error: error.message || 'Failed to inspect YouTube connection.',
          canUpload: false,
          canSchedule: false,
        },
      },
      { status: 500 }
    );
  }
}
