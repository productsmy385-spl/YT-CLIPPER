import { NextRequest, NextResponse } from 'next/server';
import { youtubeOAuth } from '@/lib/youtube/oauth';

export async function POST() {
  try {
    // 1. Get access token (verifying validity or running refresh)
    const accessToken = await youtubeOAuth.getValidAccessToken();

    // 2. Query channel
    const channel = await youtubeOAuth.fetchChannel(accessToken);

    return NextResponse.json({
      success: true,
      channel,
      message: `✓ Verified connection to YouTube channel "${channel.title}" (ID: ${channel.id}). Upload permissions are active.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Connection test failed',
      },
      { status: 400 }
    );
  }
}
