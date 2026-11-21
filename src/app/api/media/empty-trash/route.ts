import { NextResponse } from 'next/server';
import { mediaManager } from '@/lib/media-manager';

export async function POST() {
  try {
    const result = await mediaManager.emptyTrash();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
