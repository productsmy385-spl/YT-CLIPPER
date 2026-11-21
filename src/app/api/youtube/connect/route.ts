import { NextRequest, NextResponse } from 'next/server';
import { youtubeOAuth } from '@/lib/youtube/oauth';

export async function GET(req: NextRequest) {
  try {
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
    const proto = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    const dynamicRedirectUri = `${proto}://${host}/api/youtube/callback`;

    const { url, state } = youtubeOAuth.generateAuthUrl(dynamicRedirectUri);

    // If request asks for JSON, return URL; otherwise redirect directly to Google consent screen
    const wantsJson = req.headers.get('accept')?.includes('application/json') || req.nextUrl.searchParams.get('format') === 'json';

    if (wantsJson) {
      return NextResponse.json({
        success: true,
        authUrl: url,
        state,
        redirectUri: dynamicRedirectUri,
      });
    }

    return NextResponse.redirect(url);
  } catch (error: any) {
    console.error('[YouTubeConnectAPI] Error generating auth URL:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to initialize Google OAuth connection.',
      },
      { status: 500 }
    );
  }
}
