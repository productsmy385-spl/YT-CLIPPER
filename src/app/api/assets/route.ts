export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { dbRepo } from '@/db/repository';

export async function GET() {
  try {
    const memes = dbRepo.getMemeAssets();
    const music = dbRepo.getMusicAssets();
    const sfx = dbRepo.getSoundEffectAssets();

    return NextResponse.json({
      memes,
      music,
      sfx,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
