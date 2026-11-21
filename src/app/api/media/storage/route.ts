import { NextResponse } from 'next/server';
import { mediaManager } from '@/lib/media-manager';

export async function GET() {
  try {
    const stats = await mediaManager.getStorageStats();
    return NextResponse.json({ success: true, stats });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
