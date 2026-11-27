export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { rawDb } from '@/db/index';
import { rejectUnlessSyncAuthorized } from '@/lib/sync/receive';
import { AWAITING_MEDIA_STATUS } from '@/pipeline/stages';

/** PC fetch helper: YouTube projects this server could not download and that are waiting for the helper. */
export async function GET(req: NextRequest) {
  const denied = rejectUnlessSyncAuthorized(req);
  if (denied) return denied;
  const rows = rawDb
    .prepare(
      `SELECT id, title, source_url, updated_at FROM projects
       WHERE status = ? AND source_url IS NOT NULL AND (is_deleted = 0 OR is_deleted IS NULL)
       ORDER BY updated_at ASC LIMIT 20`
    )
    .all(AWAITING_MEDIA_STATUS) as any[];
  return NextResponse.json({
    projects: rows.map((r) => ({ projectId: r.id, title: r.title, url: r.source_url, waitingSince: r.updated_at })),
  });
}
