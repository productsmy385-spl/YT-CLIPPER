import { BaseAgent } from './base-agent.ts';
import { dbRepo } from '../db/repository.ts';
import path from 'node:path';
import fs from 'node:fs';
import { getProjectStoragePaths } from '../lib/app-paths.ts';

export interface ExportResult {
  clipId: string;
  exports: Array<{
    platform: 'youtube_shorts' | 'instagram_reels' | 'tiktok';
    filePath: string;
    fileSize: number;
    title: string;
    description: string;
    tags: string;
    downloadUrl: string;
  }>;
}

export class ExportAgent extends BaseAgent<{ clipId: string; videoPath: string; title: string }, ExportResult> {
  readonly id = 'agent_11_export';
  readonly name = 'Export Agent';
  readonly role = 'Multi-Platform Packaging & Metadata Generation';

  protected async run(
    projectId: string,
    input: { clipId: string; videoPath: string; title: string }
  ): Promise<ExportResult> {
    const { exportsDir } = getProjectStoragePaths(projectId);

    const platforms: Array<'youtube_shorts' | 'instagram_reels' | 'tiktok'> = [
      'youtube_shorts',
      'instagram_reels',
      'tiktok',
    ];

    const exports: ExportResult['exports'] = [];
    const stat = fs.statSync(input.videoPath);

    for (const p of platforms) {
      const fileName = `${input.clipId}_${p}.mp4`;
      const exportPath = path.join(exportsDir, fileName);

      // Copy finalized vertical video for this platform preset
      fs.copyFileSync(input.videoPath, exportPath);

      const title =
        p === 'youtube_shorts'
          ? `${input.title} 🚗💥 #shorts #gta6`
          : p === 'instagram_reels'
          ? `${input.title} 🔥 Vice City Moments`
          : `${input.title} 🏎️💨 #fyp #gta6`;

      const description = `The most insane moments from GTA 6 Vice City! Edited automatically with AI Multi-Agent Studio. Subscribe for more crazy gameplay clips!\n\n#GTA6 #GrandTheftAuto #GamingShorts #ViceCity #GTAClips`;
      const tags = 'gta6, gta 6, vice city, gaming shorts, gta clips, shorts, reels, funny gaming';

      const exportJobId = `exp_${Date.now()}_${p}`;
      dbRepo.saveExportFile({
        id: `file_${Date.now()}_${p}`,
        exportJobId,
        platform: p,
        filePath: exportPath,
        fileSize: stat.size,
        title,
        description,
        tags,
        downloadUrl: `/api/downloads/${fileName}`,
      });

      exports.push({
        platform: p,
        filePath: exportPath,
        fileSize: stat.size,
        title,
        description,
        tags,
        downloadUrl: `/api/downloads/${fileName}`,
      });
    }

    return {
      clipId: input.clipId,
      exports,
    };
  }
}
