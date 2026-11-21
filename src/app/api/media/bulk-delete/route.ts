export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { mediaManager } from '@/lib/media-manager';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ids, type = 'clip', permanent = false } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Array of media IDs required' }, { status: 400 });
    }

    const result = await mediaManager.bulkDelete(ids, { type, permanent });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
