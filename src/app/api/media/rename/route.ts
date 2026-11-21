import { NextRequest, NextResponse } from 'next/server';
import { mediaManager } from '@/lib/media-manager';

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, type = 'clip', title } = body;

    if (!id || !title) {
      return NextResponse.json({ error: 'ID and new title are required' }, { status: 400 });
    }

    const updated = await mediaManager.renameMedia(id, type, title);
    return NextResponse.json({ success: true, updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
