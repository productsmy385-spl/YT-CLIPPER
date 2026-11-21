import { NextRequest, NextResponse } from 'next/server';
import { dbRepo } from '@/db/repository';
import { youtubeClient } from '@/lib/publishing/youtube-client';
import { instagramClient } from '@/lib/publishing/instagram-client';

export async function GET() {
  try {
    const [ytStatus, igStatus] = await Promise.all([
      youtubeClient.getStatus(),
      instagramClient.getStatus(),
    ]);

    const accounts: any[] = [];

    // 1. YouTube Account Record
    if (ytStatus.channel || ytStatus.connected || ytStatus.status === 'expired') {
      accounts.push({
        platform: 'youtube',
        platformLabel: 'YouTube Shorts (Data API v3)',
        accountName: ytStatus.channel?.title || 'YouTube Channel',
        accountId: ytStatus.channel?.id || 'yt_connected_channel',
        customUrl: ytStatus.channel?.customUrl || null,
        profileImageUrl: ytStatus.channel?.thumbnailUrl || null,
        subscribers: ytStatus.channel?.subscribers || null,
        videos: ytStatus.channel?.videos || null,
        status: ytStatus.status, // 'connected' | 'expired' | 'disconnected'
        needsReconnect: ytStatus.needsReconnect,
        scopes: ytStatus.scopes,
        projectId: ytStatus.projectId,
        expiresAt: ytStatus.tokenExpiresAt,
        error: ytStatus.error || null,
      });
    }

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
        status: 'connected',
        needsReconnect: false,
      });
    } else {
      accounts.push({
        platform: 'instagram',
        platformLabel: 'Instagram Reels (Meta Graph API)',
        accountName: 'Meta Professional Account',
        accountId: null,
        profileImageUrl: null,
        status: 'disconnected',
        needsReconnect: true,
        error: igStatus.error || 'Instagram account not connected.',
      });
    }

    return NextResponse.json({
      success: true,
      accounts,
      youtube: ytStatus,
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

    if (action === 'reconnect_youtube') {
      const res = await youtubeClient.reconnect();
      return NextResponse.json(res);
    }

    if (action === 'disconnect_youtube') {
      const res = await youtubeClient.disconnect();
      return NextResponse.json(res);
    }

    if (action === 'refresh_youtube') {
      const status = await youtubeClient.getStatus();
      return NextResponse.json({ success: true, status });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
