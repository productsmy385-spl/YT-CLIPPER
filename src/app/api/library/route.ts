export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { dbRepo } from '@/db/repository';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.max(1, Math.min(96, parseInt(searchParams.get('pageSize') || '24', 10)));
    const type = searchParams.get('type') || 'all';
    const search = searchParams.get('search') || undefined;
    const status = searchParams.get('status') || undefined;
    const category = searchParams.get('category') || undefined;
    const platform = searchParams.get('platform') || undefined;
    const duration = searchParams.get('duration') || undefined;
    const date = searchParams.get('date') || undefined;
    const sort = searchParams.get('sort') || undefined;

    const result = dbRepo.getPaginatedMediaLibrary({
      page,
      pageSize,
      type,
      search,
      status,
      category,
      platform,
      duration,
      date,
      sort,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API Library] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let id = searchParams.get('id');
    let type = searchParams.get('type') || undefined;

    if (!id) {
      try {
        const body = await req.json();
        id = body.id;
        type = body.type;
      } catch {}
    }

    if (!id) {
      return NextResponse.json({ error: 'Video ID is required for deletion' }, { status: 400 });
    }

    const res = dbRepo.deleteVideoItem(id, type);
    const updatedCounts = dbRepo.getMediaLibraryCounts();

    return NextResponse.json({
      success: true,
      message: 'Video deleted successfully',
      id,
      counts: updatedCounts,
    });
  } catch (error: any) {
    console.error('[API Library] Delete Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
