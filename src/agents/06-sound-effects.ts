import { BaseAgent } from './base-agent.ts';
import { soundLibrary } from '../lib/sound-library.ts';

export interface SfxPlacementResult {
  clipId: string;
  sfxEvents: Array<{
    sfxId: string;
    sfxPath: string;
    name: string;
    timestamp: number;
    volume: number;
    category: string;
  }>;
}

export class SoundEffectsAgent extends BaseAgent<
  {
    clipId: string;
    duration: number;
    peakEventTime: number;
    category?: string;
    description?: string;
  },
  SfxPlacementResult
> {
  readonly id = 'agent_06_sfx';
  readonly name = 'Sound Effects Agent';
  readonly role = 'Existing Meme Sound Library Selection & Precision Placement';

  protected async run(
    projectId: string,
    input: {
      clipId: string;
      duration: number;
      peakEventTime: number;
      category?: string;
      description?: string;
    }
  ): Promise<SfxPlacementResult> {
    console.log(`[SoundEffectsAgent] Selecting matching meme sounds from existing library for ${input.clipId}...`);

    // Intelligent recommendation using existing sound asset library
    const sfxEvents = soundLibrary.recommendSounds({
      category: input.category || 'crazy_gameplay',
      description: input.description || 'High-octane stunt and action moment',
      peakMoment: `Climax at ${input.peakEventTime.toFixed(1)}s`,
      clipDuration: input.duration,
    });

    console.log(`[SoundEffectsAgent] ✓ Selected ${sfxEvents.length} existing meme sounds:`);
    sfxEvents.forEach((s) => {
      console.log(`   - [${s.category}] "${s.name}" at ${s.timestamp}s (vol: ${s.volume}) -> ${s.sfxPath}`);
    });

    return {
      clipId: input.clipId,
      sfxEvents,
    };
  }
}
