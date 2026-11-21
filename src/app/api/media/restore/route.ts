import { NextRequest, NextResponse } from 'next/server';
import { mediaManager } from '@/lib/media-manager';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ids, id } = body;

    const targetIds = ids && Array.isArray(ids) ? ids : id ? [id] : [];
    if (targetIds.length === 0) {
      return NextResponse.json({ error: 'ID or array of IDs required for restore' }, { status: 400 });
    }

    const result = await mediaManager.bulkRestore(targetIds);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
