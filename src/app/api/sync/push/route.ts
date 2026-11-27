export const dynamic = 'force-dynamic';
export const maxDuration = 3600;
import { NextRequest, NextResponse } from 'next/server';
import { pushTarget, pushProjectToProduction } from '@/lib/sync/push';
import { autoSyncEnabled, syncStatus } from '@/lib/sync/auto-push';

/**
 * Runs on the PC (local server). GET says whether "Send to production" is set up (and, with ?projectId=, that
 * project's last sync); POST { projectId } sends one project now. Protected by the normal site gate (middleware),
 * not by SYNC_TOKEN: the token is only sent outward.
 */
export async function GET(req: NextRequest) {
  const t = pushTarget();
  const projectId = req.nextUrl.searchParams.get('projectId');
  return NextResponse.json({
    configured: Boolean(t),
    target: t ? new URL(t.url).host : null,
    auto: autoSyncEnabled(),
    status: t && projectId ? syncStatus(projectId) : null,
  });
}

export async function POST(req: NextRequest) {
  const { projectId } = await req.json().catch(() => ({}));
  try {
    const result = await pushProjectToProduction(String(projectId || ''), (m) => console.log(`[SyncPush] ${projectId}: ${m}`));
    console.log(`[SyncPush] ${projectId}: sent ${result.filesSent} file(s), ${(result.bytesSent / 1048576).toFixed(1)} MB`);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error(`[SyncPush] ${projectId}: ${err.message}`);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
