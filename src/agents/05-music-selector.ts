import { BaseAgent } from './base-agent.ts';
import { dbRepo } from '../db/repository.ts';
import path from 'node:path';
import { PUBLIC_DIR } from '../lib/app-paths.ts';
import type { MusicAsset } from '../types/index.ts';

export interface MusicSelectionResult {
  clipId: string;
  selectedMusic: MusicAsset;
  duckingDb: number;
  volume: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
}

export class MusicSelectionAgent extends BaseAgent<{ clipId: string; preferredGenre: string; duration: number }, MusicSelectionResult> {
  readonly id = 'agent_05_music';
  readonly name = 'Music Selection Agent';
  readonly role = 'Dynamic Music Curation & Voice Ducking';

  protected async run(
    projectId: string,
    input: { clipId: string; preferredGenre: string; duration: number }
  ): Promise<MusicSelectionResult> {
    const allTracks = dbRepo.getMusicAssets();
    const matched = allTracks.find((m) => m.genre === input.preferredGenre) || allTracks[0];

    const absPath = path.resolve(PUBLIC_DIR, matched.filePath.replace(/^\//, ''));

    return {
      clipId: input.clipId,
      selectedMusic: {
        ...matched,
        filePath: absPath,
      },
      duckingDb: -16.0,
      volume: 0.18,
      fadeInSeconds: 1.0,
      fadeOutSeconds: 1.5,
    };
  }
}
