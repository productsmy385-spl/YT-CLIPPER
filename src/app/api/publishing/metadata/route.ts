import { NextRequest, NextResponse } from 'next/server';
import { aiMetadataAgent } from '@/agents/12-metadata-agent';
import { dbRepo } from '@/db/repository';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clipId, category, eventDescription, peakMoment, hookDescription, projectId } = body;

    let sourceUrl = 'https://www.youtube.com/watch?v=ViN62GuDF2A';
    let creatorName = 'GTA 6 Gameplay Channel';
    let isAuthorized = true;

    if (projectId) {
      try {
        const project = dbRepo.getProject(projectId) as any;
        const sourceVideo = dbRepo.getSourceVideoByProject(projectId) as any;
        if (project?.source_url) sourceUrl = project.source_url;
        if (project?.title) creatorName = project.title;
        if (sourceVideo) {
          isAuthorized = sourceVideo.copyright_declared === 1 || sourceVideo.origin_source?.includes('authorized');
        }
      } catch {
        // Fallback to defaults
      }
    }

    const metadata = await aiMetadataAgent.execute(projectId || 'proj_default', {
      clipId: clipId || 'clip_default',
      category: category || 'epic_stunts',
      eventDescription: eventDescription || 'Supercar high-speed stunt across Vice City',
      peakMoment: peakMoment || 'Peak stunt impact',
      hookDescription: hookDescription || 'Instant hook in first 5s',
      creatorName,
      sourceUrl,
      sourceAuthorized: isAuthorized,
    });

    return NextResponse.json({ success: true, metadata });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
