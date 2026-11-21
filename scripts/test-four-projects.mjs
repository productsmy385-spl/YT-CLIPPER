import { MasterAgentOrchestrator } from '../src/agents/orchestrator.ts';
import { dbRepo } from '../src/db/repository.ts';
import { rawDb } from '../src/db/index.ts';
import { computeFileChecksum } from '../src/lib/video-ingestion.ts';
import fs from 'node:fs';
import path from 'node:path';

async function runFourProjectsTest() {
  console.log('================================================================');
  console.log('🚀 EXECUTING 4-PROJECT INDEPENDENT WORKFLOW VERIFICATION TEST');
  console.log('================================================================\n');

  const orchestrator = new MasterAgentOrchestrator();

  const testDefinitions = [
    {
      code: 'A',
      title: 'Project A - GTA 6 Official Trailer',
      sourceUrl: 'https://www.youtube.com/watch?v=QdBZY2fkU-0',
      sourceFilePath: path.resolve('storage/authorized_sources/QdBZY2fkU-0.mp4'),
    },
    {
      code: 'B',
      title: 'Project B - Vice City Gameplay Walkthrough',
      sourceUrl: 'https://www.youtube.com/watch?v=ViN62GuDF2A',
      sourceFilePath: path.resolve('storage/authorized_sources/ViN62GuDF2A.mp4'),
    },
    {
      code: 'C',
      title: 'Project C - High-Energy Stream Audio/Video',
      sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      sourceFilePath: path.resolve('storage/authorized_sources/dQw4w9WgXcQ.mp4'),
    },
    {
      code: 'D',
      title: 'Project D - Creator Uploaded Gameplay Screen Recording',
      sourceUrl: undefined,
      sourceFilePath: path.resolve('storage/uploads/1795241970678_Screen_Recording_2026-05-18_184952.mp4'),
    },
  ];

  const results = [];

  for (const def of testDefinitions) {
    console.log(`\n----------------------------------------------------------------`);
    console.log(`▶ Starting [PROJECT ${def.code}]: "${def.title}"`);
    console.log(`Source: ${def.sourceFilePath}`);
    console.log(`----------------------------------------------------------------`);

    if (!fs.existsSync(def.sourceFilePath)) {
      throw new Error(`Test source file missing: ${def.sourceFilePath}`);
    }

    const timestamp = Date.now();
    const projectId = `proj_test_${def.code.toLowerCase()}_${timestamp}`;
    const sourceVideoId = `sv_${projectId}`;

    // Verify initial file checksum
    const initialChecksum = computeFileChecksum(def.sourceFilePath);

    // Create Project
    dbRepo.createProject({
      id: projectId,
      userId: 'usr_creator_01',
      title: def.title,
      sourceUrl: def.sourceUrl || null,
      sourceFile: def.sourceFilePath,
      sourceVideoId,
      sourceChecksum: initialChecksum,
    });

    // Run full 10-stage pipeline
    const pipelineResult = await orchestrator.processProject({
      projectId,
      sourceUrl: def.sourceUrl,
      sourceFilePath: def.sourceFilePath,
      sourceVideoId,
      sourceChecksum: initialChecksum,
      durationPreset: '30-60s',
      jobId: `job_${projectId}`,
    });

    console.log(`[PROJECT ${def.code}] Result:`, pipelineResult);

    // Collect verification data from DB and disk
    const projectRecord = dbRepo.getProject(projectId);
    const sourceVideos = rawDb.prepare('SELECT * FROM source_videos WHERE project_id = ?').all(projectId);
    const highlights = rawDb.prepare('SELECT * FROM detected_highlights WHERE project_id = ?').all(projectId);
    const clips = rawDb.prepare('SELECT * FROM generated_clips WHERE project_id = ?').all(projectId);
    const exports = rawDb.prepare('SELECT * FROM export_files WHERE file_path LIKE ?').all(`%${projectId}%`);

    // Verify disk files
    const projectSourceDir = path.resolve(`storage/projects/${projectId}/source`);
    const projectExtractedDir = path.resolve(`storage/projects/${projectId}/extracted`);
    const projectEditedDir = path.resolve(`storage/projects/${projectId}/edited`);
    const projectExportsDir = path.resolve(`storage/projects/${projectId}/exports`);

    const sourceFilesOnDisk = fs.existsSync(projectSourceDir) ? fs.readdirSync(projectSourceDir) : [];
    const extractedFilesOnDisk = fs.existsSync(projectExtractedDir) ? fs.readdirSync(projectExtractedDir) : [];
    const editedFilesOnDisk = fs.existsSync(projectEditedDir) ? fs.readdirSync(projectEditedDir) : [];
    const exportFilesOnDisk = fs.existsSync(projectExportsDir) ? fs.readdirSync(projectExportsDir) : [];

    results.push({
      code: def.code,
      projectId,
      title: def.title,
      status: projectRecord?.status,
      sourceUrl: def.sourceUrl,
      sourceVideoId,
      initialChecksum,
      sourceVideosCount: sourceVideos.length,
      sourceFilesOnDisk,
      highlightsCount: highlights.length,
      clipsCount: clips.length,
      extractedFilesOnDisk,
      editedFilesOnDisk,
      exportFilesOnDisk,
      renderedClips: clips.filter(c => c.status === 'rendered').map(c => ({
        id: c.id,
        duration: c.duration,
        outputPath: c.output_path,
        exists: fs.existsSync(c.output_path),
        sizeBytes: fs.existsSync(c.output_path) ? fs.statSync(c.output_path).size : 0,
      })),
    });
  }

  console.log('\n================================================================');
  console.log('📊 FINAL 4-PROJECT ISOLATION & VERIFICATION AUDIT');
  console.log('================================================================\n');

  for (const r of results) {
    console.log(`[PROJECT ${r.code}] (${r.projectId})`);
    console.log(`  Title:            ${r.title}`);
    console.log(`  Status:           ${r.status}`);
    console.log(`  Source Video ID:  ${r.sourceVideoId}`);
    console.log(`  SHA256 Checksum:  ${r.initialChecksum}`);
    console.log(`  Source Isolated:  ${r.sourceFilesOnDisk.join(', ')}`);
    console.log(`  Highlights Count: ${r.highlightsCount}`);
    console.log(`  Clips Extracted:  ${r.extractedFilesOnDisk.length} files (${r.clipsCount} DB rows)`);
    console.log(`  Vertical Shorts:  ${r.editedFilesOnDisk.length} files`);
    console.log(`  Export Packages:  ${r.exportFilesOnDisk.length} files`);
    console.log(`  Rendered Shorts:`);
    r.renderedClips.forEach(c => {
      console.log(`    * [${c.id}] ${c.duration}s | ${(c.sizeBytes / 1024 / 1024).toFixed(2)} MB | Exists: ${c.exists}`);
    });
    console.log('');
  }

  // Check unique checksums
  const checksums = new Set(results.map(r => r.initialChecksum));
  console.log(`Distinct Source Checksums: ${checksums.size}/4 (Must be 4)`);

  // Check unique project directories
  const projectDirs = results.map(r => r.projectId);
  console.log(`Distinct Project Directories: ${new Set(projectDirs).size}/4`);

  // Cross-project contamination check
  let contaminationDetected = false;
  for (let i = 0; i < results.length; i++) {
    for (let j = 0; j < results.length; j++) {
      if (i === j) continue;
      const projA = results[i];
      const projB = results[j];
      const crossClips = rawDb.prepare(
        'SELECT * FROM generated_clips WHERE project_id = ? AND (output_path LIKE ? OR raw_clip_path LIKE ?)'
      ).all(projA.projectId, `%${projB.projectId}%`, `%${projB.projectId}%`);
      if (crossClips.length > 0) {
        console.error(`❌ CONTAMINATION DETECTED between ${projA.projectId} and ${projB.projectId}!`);
        contaminationDetected = true;
      }
    }
  }

  if (!contaminationDetected) {
    console.log('✅ ZERO CROSS-PROJECT CONTAMINATION DETECTED! Every project is 100% strictly isolated.');
  }

  console.log('\n================================================================');
  console.log('✅ 4-PROJECT WORKFLOW AUDIT COMPLETE');
  console.log('================================================================');
}

runFourProjectsTest().catch((err) => {
  console.error('❌ 4-Project test failed:', err);
  process.exit(1);
});
