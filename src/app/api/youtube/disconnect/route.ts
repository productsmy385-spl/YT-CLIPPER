import { NextRequest, NextResponse } from 'next/server';
import { youtubeOAuth } from '@/lib/youtube/oauth';

export async function POST() {
  try {
    const res = await youtubeOAuth.disconnect();
    return NextResponse.json({
      success: res.success,
      message: 'YouTube channel disconnected and stored tokens revoked.',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
