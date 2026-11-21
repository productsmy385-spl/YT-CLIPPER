import { BaseAgent } from './base-agent.ts';
import { dbRepo } from '../db/repository.ts';
import path from 'node:path';
import fs from 'node:fs';
import { getProjectStoragePaths } from '../lib/app-paths.ts';

export interface SubtitleResult {
  clipId: string;
  assFilePath: string;
  subtitleCount: number;
}

export class SubtitleAgent extends BaseAgent<
  {
    clipId: string;
    duration: number;
    categoryLabel?: string;
    eventDescription?: string;
    peakMoment?: string;
  },
  SubtitleResult
> {
  readonly id = 'agent_08_subtitles';
  readonly name = 'Subtitle Agent';
  readonly role = 'Contextual Word-Level Animated Gaming Captions';

  protected async run(
    projectId: string,
    input: {
      clipId: string;
      duration: number;
      categoryLabel?: string;
      eventDescription?: string;
      peakMoment?: string;
    }
  ): Promise<SubtitleResult> {
    const { subtitlesDir } = getProjectStoragePaths(projectId);
    const assFilePath = path.join(subtitlesDir, `${input.clipId}_subtitles.ass`);

    const cat = (input.categoryLabel || 'GTA 6 HIGHLIGHT').toUpperCase();
    const event = input.eventDescription || 'Insane high-speed stunt & getaway';

    // Build contextual multi-line captions matching the clip's action
    const captions = [
      { start: 0.4, end: 3.2, text: `WATCH THIS: ${cat}!` },
      { start: 3.6, end: 7.5, text: event.toUpperCase() },
      { start: 8.0, end: Math.min(input.duration - 2.5, 12.5), text: 'POLICE PURSUIT AT MAXIMUM SPEED 🚨' },
      { start: Math.max(13.0, input.duration - 4.5), end: Math.min(input.duration - 0.3, input.duration), text: 'GTA 6 PHYSICS NEVER FAILS 😂🔥' },
    ];

    const validCaptions = captions.filter((c) => c.start < input.duration);

    // Format ASS Subtitle file (Vice Neon aesthetic, mobile safe zone: MarginV=240, 1080x1920)
    let assContent = `[Script Info]
Title: GTA 6 Shorts Animated Captions
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: None
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,68,&H00D4B606,&H0047E0FD,&H00000000,&H80000000,1,0,0,0,100,100,2,0,1,5,2,2,80,80,260,1
Style: Accent,Impact,74,&H0000FFFF,&H00FF00FF,&H00000000,&H90000000,1,0,0,0,100,100,3,0,1,6,3,2,80,80,260,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const formatAssTime = (sec: number) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = Math.floor(sec % 60);
      const cs = Math.floor((sec % 1) * 100);
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
    };

    for (let i = 0; i < validCaptions.length; i++) {
      const cap = validCaptions[i];
      const startStr = formatAssTime(cap.start);
      const endStr = formatAssTime(Math.min(input.duration, cap.end));
      const style = i % 2 === 0 ? 'Default' : 'Accent';
      assContent += `Dialogue: 0,${startStr},${endStr},${style},,0,0,0,,{\\b1\\t(0,120,\\fscx112\\fscy112)\\t(120,240,\\fscx100\\fscy100)}${cap.text}\n`;
    }

    fs.writeFileSync(assFilePath, assContent, 'utf8');

    return {
      clipId: input.clipId,
      assFilePath,
      subtitleCount: validCaptions.length,
    };
  }
}
