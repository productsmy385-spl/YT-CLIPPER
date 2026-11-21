import { BaseAgent } from './base-agent.ts';
import { dbRepo } from '../db/repository.ts';
import path from 'node:path';
import fs from 'node:fs';
import { PUBLIC_DIR } from '../lib/app-paths.ts';
import type { MemeAsset } from '../types/index.ts';

export interface MemeSelectionResult {
  clipId: string;
  selectedMeme: MemeAsset;
  placementTimestamp: number;
  duration: number;
  position: 'top_right' | 'bottom_right' | 'center' | 'pip';
}

export class MemeResearchAgent extends BaseAgent<{ clipId: string; mood: string; clipDuration: number }, MemeSelectionResult> {
  readonly id = 'agent_04_meme';
  readonly name = 'Meme Research Agent';
  readonly role = 'Contextual Meme & Reaction Asset Matching';

  protected async run(
    projectId: string,
    input: { clipId: string; mood: string; clipDuration: number }
  ): Promise<MemeSelectionResult> {
    const allMemes = dbRepo.getMemeAssets();
    const fallbackMeme = {
      id: 'meme_fallback',
      name: 'Shock Reaction',
      emotion: 'shock' as const,
      filePath: '/assets/memes/meme_shock_eyes.png',
      duration: 2.0,
      overlayType: 'pip_corner' as const,
      licenseStatus: 'verified_cc0' as const,
    };
    // Find meme matching emotion or fallback
    const matched = (allMemes && allMemes.length > 0)
      ? (allMemes.find((m) => m.emotion === input.mood) || allMemes[0])
      : fallbackMeme;

    const safeMeme = matched || fallbackMeme;
    const rawPath = safeMeme?.filePath || fallbackMeme.filePath;

    // Place meme right at peak comedic/action event (around 60% through clip)
    const placementTimestamp = Math.min(input.clipDuration - 3.0, Math.max(2.0, input.clipDuration * 0.55));

    // Resolve absolute path to meme asset
    const absPath = path.resolve(PUBLIC_DIR, rawPath.replace(/^\//, ''));

    return {
      clipId: input.clipId,
      selectedMeme: {
        ...safeMeme,
        filePath: absPath,
      },
      placementTimestamp: Number(placementTimestamp.toFixed(2)),
      duration: Math.min(2.5, safeMeme?.duration || 2.0),
      position: 'top_right',
    };
  }
}
