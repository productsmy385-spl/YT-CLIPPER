export const dynamic = 'force-dynamic';
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

    const res = wantsJson
      ? NextResponse.json({ success: true, authUrl: url, redirectUri: dynamicRedirectUri })
      : NextResponse.redirect(url);
    // CSRF protection: the callback only accepts the state value issued to this browser.
    res.cookies.set('yt_oauth_state', state, {
      httpOnly: true,
      secure: proto === 'https',
      sameSite: 'lax',
      path: '/api/youtube/callback',
      maxAge: 600,
    });
    // Where to send the user afterwards (same-site relative paths only).
    const returnTo = req.nextUrl.searchParams.get('return') || '';
    if (/^\/[a-zA-Z0-9/_?=&.-]*$/.test(returnTo) && !returnTo.startsWith('//')) {
      res.cookies.set('yt_oauth_return', returnTo, { httpOnly: true, secure: proto === 'https', sameSite: 'lax', path: '/api/youtube/callback', maxAge: 600 });
    }
    return res;
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
