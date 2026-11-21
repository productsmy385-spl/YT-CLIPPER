import { NextRequest, NextResponse } from 'next/server';
import { dbRepo } from '@/db/repository';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month') || undefined; // format 'YYYY-MM'

    const events = dbRepo.getCalendarScheduleEvents(month);
    const counts = dbRepo.getMediaLibraryCounts();

    return NextResponse.json({
      success: true,
      month: month || new Date().toISOString().substring(0, 7),
      events,
      counts,
    });
  } catch (error: any) {
    console.error('[API Calendar] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
