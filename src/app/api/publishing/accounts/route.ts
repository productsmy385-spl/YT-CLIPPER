import { NextRequest, NextResponse } from 'next/server';
import { youtubeOAuth } from '@/lib/youtube/oauth';
import { instagramClient } from '@/lib/publishing/instagram-client';

export async function GET() {
  try {
    const [ytReport, igStatus] = await Promise.all([
      youtubeOAuth.getStatusReport(),
      instagramClient.getStatus(),
    ]);

    const accounts: any[] = [];

    // 1. Real YouTube Account Record
    accounts.push({
      platform: 'youtube',
      platformLabel: 'YouTube Shorts (Data API v3)',
      accountName: ytReport.channel?.title || 'YouTube Channel',
      accountId: ytReport.channel?.id || null,
      customUrl: ytReport.channel?.customUrl || null,
      profileImageUrl: ytReport.channel?.thumbnailUrl || null,
      subscribers: ytReport.channel?.subscribers || null,
      videos: ytReport.channel?.videos || null,
      accountEmail: ytReport.channel?.email || null,
      status: ytReport.state, // NOT_CONNECTED, CONNECTED, TOKEN_EXPIRED, etc.
      connected: ytReport.connected,
      needsReconnect: ytReport.state === 'TOKEN_EXPIRED' || ytReport.state === 'REAUTH_REQUIRED',
      scopes: ytReport.scopes,
      expiresAt: ytReport.channel?.tokenExpiresAt || null,
      error: ytReport.error || null,
      canUpload: ytReport.canUpload,
      canSchedule: ytReport.canSchedule,
      lastChecked: ytReport.lastChecked,
    });

    // 2. Instagram Account Record
    if (igStatus.connected && igStatus.account) {
      accounts.push({
        platform: 'instagram',
        platformLabel: 'Instagram Reels (Meta Graph API)',
        accountName: igStatus.account.username,
        accountId: igStatus.account.id,
        profileImageUrl: igStatus.account.profilePictureUrl || null,
        accountType: igStatus.account.accountType,
        followers: igStatus.account.followersCount || null,
        status: 'CONNECTED',
        connected: true,
        needsReconnect: false,
      });
    } else {
      accounts.push({
        platform: 'instagram',
        platformLabel: 'Instagram Reels (Meta Graph API)',
        accountName: 'Meta Professional Account',
        accountId: null,
        profileImageUrl: null,
        status: 'NOT_CONNECTED',
        connected: false,
        needsReconnect: true,
        error: igStatus.error || 'Instagram account not connected.',
      });
    }

    return NextResponse.json({
      success: true,
      accounts,
      youtube: ytReport,
      instagram: igStatus,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'disconnect_youtube') {
      const res = await youtubeOAuth.disconnect();
      return NextResponse.json(res);
    }

    if (action === 'refresh_youtube') {
      const report = await youtubeOAuth.getStatusReport();
      return NextResponse.json({ success: true, report });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
