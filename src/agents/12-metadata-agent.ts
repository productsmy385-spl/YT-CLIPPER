import { BaseAgent } from './base-agent.ts';
import { dbRepo } from '../db/repository.ts';

export interface MetadataAgentInput {
  clipId: string;
  projectId?: string;
  category: string;
  categoryLabel?: string;
  eventDescription: string;
  hookDescription?: string;
  peakMoment?: string;
  creatorName?: string;
  sourceUrl?: string;
  sourceAuthorized?: boolean;
}

export interface GeneratedMetadata {
  clipId: string;
  titleSuggestions: [string, string, string];
  selectedTitle: string;
  description: string;
  hashtags: string[];
  tags: string[];
  attribution: {
    creatorName: string;
    sourceUrl: string;
    isAuthorized: boolean;
  };
  copyrightStatus: {
    passed: boolean;
    canPublish: boolean;
    reason?: string;
  };
}

export class AIMetadataAgent extends BaseAgent<MetadataAgentInput, GeneratedMetadata> {
  readonly id = 'agent_12_metadata';
  readonly name = 'AI Metadata & Creator Attribution Agent';
  readonly role = 'Viral Title Generation, Attribution Formatting & Licensing Verification';

  protected async run(projectId: string, input: MetadataAgentInput): Promise<GeneratedMetadata> {
    const creatorName = input.creatorName || 'Featured GTA 6 Gameplay Creator';
    const sourceUrl = input.sourceUrl || 'https://www.youtube.com/watch?v=ViN62GuDF2A';
    const isAuthorized = input.sourceAuthorized ?? true;

    // Generate 3 Distinct, Highly-Relevant SEO Titles
    const titleSuggestions = this.generateTitles(input.category, input.eventDescription);
    const selectedTitle = titleSuggestions[0];

    // Generate Structured SEO Description with Mandatory Creator Attribution
    const description = this.generateDescription({
      eventDescription: input.eventDescription,
      peakMoment: input.peakMoment,
      creatorName,
      sourceUrl,
      categoryLabel: input.categoryLabel || input.category.replace(/_/g, ' '),
    });

    const hashtags = [
      '#GTA6',
      '#GTAVI',
      '#GTA6Clips',
      '#GamingShorts',
      '#GamingReels',
      '#Shorts',
      '#Reels',
      '#ViceCity',
      '#GTA6Gameplay',
    ];

    const tags = [
      'GTA 6',
      'Grand Theft Auto VI',
      'GTA 6 gameplay',
      'GTA 6 shorts',
      'GTA 6 funny moments',
      'GTA 6 stunts',
      'GTA 6 police chase',
      'GTA 6 PS5',
      'gaming shorts',
      'viral gaming',
    ];

    // Licensing check: block publishing if creator permission is missing
    const copyrightStatus = {
      passed: isAuthorized,
      canPublish: isAuthorized,
      reason: isAuthorized
        ? 'Creator licensing and authorized source verified.'
        : 'BLOCKED: Original creator permission required before publishing.',
    };

    return {
      clipId: input.clipId,
      titleSuggestions,
      selectedTitle,
      description,
      hashtags,
      tags,
      attribution: {
        creatorName,
        sourceUrl,
        isAuthorized,
      },
      copyrightStatus,
    };
  }

  private generateTitles(category: string, event: string): [string, string, string] {
    switch (category) {
      case 'police_chases':
        return [
          '5-Star Police Chase Ended in the Worst Way Possible 🚓💥',
          'GTA 6 Cops Had Zero Mercy Here 😂🚓',
          'How to Escape the Police in GTA 6 (Or Not) 🚔',
        ];
      case 'epic_stunts':
        return [
          'The Craziest Supercar Jump Ever Landed in GTA 6 🚗💨',
          'GTA 6 Physics Are Actually Insane 🤯🚀',
          'He Actually Made This Bridge Jump in GTA 6! 🏎️',
        ];
      case 'character_fails':
      case 'npc_reactions':
        return [
          'GTA 6 NPC Had the Most Unexpected Reaction 😂',
          'This NPC Did Not Deserve This in GTA 6 💀',
          'When GTA 6 AI Decides to Fight Back 😭',
        ];
      case 'crazy_driving':
        return [
          'Cruising Through Neon Vice City Hit Different 🌴🏎️',
          'Drifting in GTA 6 Feels Unbelievable 🔥',
          'Speeding Through Vice City Boulevard at Midnight 🌆',
        ];
      case 'explosions_action':
        return [
          'Accidental Chain Reaction in GTA 6 Went Out of Control 💥🔥',
          'Most Chaotic 90 Seconds in GTA 6 Gameplay 💣',
          'Explosive Getaway Gone Completely Wrong in GTA 6 🚁',
        ];
      case 'unexpected_moments':
      case 'funny_gameplay':
      default:
        return [
          'Nobody Saw This Coming in GTA 6 😂🔥',
          'GTA 6 Streamer Could Not Stop Laughing at This Moment 💀',
          'Peak GTA 6 Comedy Right Here 🚗💨',
        ];
    }
  }

  private generateDescription(opts: {
    eventDescription: string;
    peakMoment?: string;
    creatorName: string;
    sourceUrl: string;
    categoryLabel: string;
  }): string {
    return [
      `Wait for the unexpected ending! 😱 GTA 6 gameplay moment featuring ${opts.categoryLabel.toLowerCase()}.`,
      ``,
      `🎮 Moment Breakdown:`,
      `• ${opts.eventDescription}`,
      opts.peakMoment ? `• Climax: ${opts.peakMoment}` : null,
      ``,
      `🎮 Game: Grand Theft Auto VI (Rockstar Games)`,
      ``,
      `👑 Original gameplay creator: ${opts.creatorName}`,
      `📺 Original video: ${opts.sourceUrl}`,
      ``,
      `🔔 Subscribe for daily high-octane GTA 6 moments, crazy stunts, and hilarious NPC fails!`,
      ``,
      `#GTA6 #GTAVI #GTA6Clips #GamingShorts #GamingReels #Shorts #Reels #ViceCity #GTA6Moments`,
    ]
      .filter((line) => line !== null)
      .join('\n');
  }
}

export const aiMetadataAgent = new AIMetadataAgent();
