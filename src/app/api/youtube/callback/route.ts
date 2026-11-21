export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { youtubeOAuth } from '@/lib/youtube/oauth';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  const redirectUri = `${proto}://${host}/api/youtube/callback`;
  const returnBase = `${proto}://${host}/publishing?tab=accounts`;

  if (error) {
    console.warn('[YouTubeCallbackAPI] OAuth cancelled or error returned from Google:', error);
    return NextResponse.redirect(`${returnBase}&error=${encodeURIComponent(`Google authorization error: ${error}`)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${returnBase}&error=${encodeURIComponent('No authorization code received from Google.')}`);
  }

  try {
    // 1. Exchange authorization code securely on the backend
    const tokenData = await youtubeOAuth.exchangeCode(code, redirectUri);

    // 2. Query YouTube channel details with the fresh access token
    const channel = await youtubeOAuth.fetchChannel(tokenData.accessToken);

    // 3. Encrypt and store credentials in the database
    youtubeOAuth.saveConnection(channel, tokenData);

    console.log(`[YouTubeCallbackAPI] ✓ Connected YouTube channel: "${channel.title}" (ID: ${channel.id})`);

    return NextResponse.redirect(
      `${returnBase}&connected=youtube&channel=${encodeURIComponent(channel.title)}&channelId=${encodeURIComponent(channel.id)}`
    );
  } catch (err: any) {
    console.error('[YouTubeCallbackAPI] OAuth callback processing failed:', err);
    return NextResponse.redirect(
      `${returnBase}&error=${encodeURIComponent(err.message || 'Failed to complete YouTube channel connection.')}`
    );
  }
}
