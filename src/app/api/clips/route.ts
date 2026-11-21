export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { dbRepo } from '@/db/repository';
import path from 'node:path';
import fs from 'node:fs';
import { STORAGE_CLIPS_DIR } from '@/lib/app-paths';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const hasPagination = searchParams.has('page') || searchParams.has('pageSize') || searchParams.has('search') || searchParams.has('status') || searchParams.has('category');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.max(1, Math.min(96, parseInt(searchParams.get('pageSize') || '24', 10)));
    const search = searchParams.get('search') || undefined;
    const status = searchParams.get('status') || undefined;
    const category = searchParams.get('category') || undefined;
    const projectId = searchParams.get('projectId') || undefined;
    const sort = searchParams.get('sort') || undefined;

    // Use server-side paginated clips query
    const result = dbRepo.getPaginatedClips({
      page,
      pageSize: hasPagination ? pageSize : 1000,
      search,
      status,
      category,
      projectId,
      sort,
    });

    const exportFiles = dbRepo.getExportFiles() as any[];

    // Enrich clips with export files and previews
    const enrichedClips = result.items.map((clip: any) => {
      const exports = exportFiles.filter((exp: any) => {
        if (exp.clip_id && exp.clip_id === clip.id) return true;
        if (exp.file_path && exp.file_path.includes(clip.id)) return true;
        return false;
      });

      const qaReport = dbRepo.getQualityReportByClip(clip.id);

      const rawClipFileName = `${clip.id}_raw.mp4`;
      const verticalFileName = `${clip.id}_vertical_final.mp4`;

      const rawFilePath = clip.raw_clip_path || path.resolve(STORAGE_CLIPS_DIR, rawClipFileName);
      const rawExists = fs.existsSync(rawFilePath);

      const finalFilePath = clip.edited_clip_path || clip.output_path || path.resolve(STORAGE_CLIPS_DIR, verticalFileName);
      const finalExists = fs.existsSync(finalFilePath);

      return {
        ...clip,
        rawPreviewUrl: rawExists ? `/api/media/clips/${path.basename(rawFilePath)}#t=0.5` : null,
        finalPreviewUrl: finalExists ? `/api/media/clips/${path.basename(finalFilePath)}#t=0.5` : null,
        exports,
        qaReport,
      };
    });

    return NextResponse.json({
      clips: enrichedClips,
      pagination: result.pagination,
      counts: dbRepo.getMediaLibraryCounts(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { clipId, status } = body;

    if (!clipId || !status) {
      return NextResponse.json({ error: 'clipId and status are required' }, { status: 400 });
    }

    const updated = dbRepo.updateClipStatus(clipId, status);
    return NextResponse.json({ success: true, clip: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
