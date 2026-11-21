import { NextRequest, NextResponse } from 'next/server';
import { MasterAgentOrchestrator } from '@/agents/orchestrator';
import { dbRepo } from '@/db/repository';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = dbRepo.getProject(id);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Trigger persistent cancellation
    MasterAgentOrchestrator.cancelProject(id);

    return NextResponse.json({
      success: true,
      message: 'Processing cancelled.',
      projectId: id,
      status: 'cancelled',
    });
  } catch (error: any) {
    console.error('[CancelAPI] Error cancelling project:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
