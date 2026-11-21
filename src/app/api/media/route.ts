import { NextRequest, NextResponse } from 'next/server';
import { mediaManager } from '@/lib/media-manager';
import type { MediaTab } from '@/lib/media-manager';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tab = (searchParams.get('tab') as MediaTab) || 'all';
    const search = searchParams.get('search') || '';
    const sort = searchParams.get('sort') || 'newest';
    const category = searchParams.get('category') || undefined;
    const platform = searchParams.get('platform') || undefined;
    const minDurStr = searchParams.get('minDuration');
    const maxDurStr = searchParams.get('maxDuration');

    const result = await mediaManager.listMedia({
      tab,
      search,
      sort,
      category,
      platform,
      minDuration: minDurStr ? parseFloat(minDurStr) : undefined,
      maxDuration: maxDurStr ? parseFloat(maxDurStr) : undefined,
    });

    const storageStats = await mediaManager.getStorageStats();

    return NextResponse.json({
      success: true,
      ...result,
      storageStats,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, type = 'clip', permanent = false, deleteClips = false } = body;

    if (!id) {
      return NextResponse.json({ error: 'Media ID is required' }, { status: 400 });
    }

    if (type === 'source') {
      const res = await mediaManager.deleteSourceVideo(id, { permanent, deleteClips });
      return NextResponse.json(res);
    }

    if (type === 'post' || type === 'published' || type === 'scheduled') {
      const res = await mediaManager.deletePost(id, { permanent });
      return NextResponse.json(res);
    }

    if (type === 'project') {
      const res = await mediaManager.deleteProject(id, { permanent, deleteClips, deleteSource: Boolean(body.deleteSource) });
      return NextResponse.json(res);
    }

    const res = await mediaManager.deleteClip(id, { permanent });
    return NextResponse.json(res);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
