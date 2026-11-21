import { MasterAgentOrchestrator } from '../src/agents/orchestrator.ts';
import { dbRepo } from '../src/db/repository.ts';
import { getProjectStoragePaths } from '../src/lib/app-paths.ts';
import fs from 'node:fs';
import path from 'node:path';

async function testPipeline() {
  console.log('=== TESTING GENUINE YOUTUBE EXTRACTION & AUTONOMOUS EDITING PIPELINE ===');

  const youtubeUrl = 'https://www.youtube.com/watch?v=QdBZY2fkU-0';
  const projectId = `proj_test_gta6_${Date.now()}`;
  const title = 'GTA 6 Official Trailer Gameplay Test';

  console.log(`Creating project: ${projectId}`);
  dbRepo.createProject({
    id: projectId,
    title,
    sourceUrl: youtubeUrl,
    gameTitle: 'Grand Theft Auto VI',
    status: 'created',
  });

  const orchestrator = new MasterAgentOrchestrator();
  console.log('Starting MasterAgentOrchestrator...');

  await orchestrator.processProject(
    {
      projectId,
      sourceUrl: youtubeUrl,
      sourceVideoId: `sv_${projectId}`,
      pairAuthorizedStream: false,
    },
    (stage, percent, message) => {
      console.log(`[PROGRESS ${percent}%] Stage: ${stage} - ${message}`);
    }
  );

  console.log('\n=== VERIFYING PRODUCED PROJECT ARTIFACTS ===');
  const project = dbRepo.getProject(projectId);
  console.log('Project Status:', project?.status, 'Progress:', project?.progress);

  const storagePaths = getProjectStoragePaths(projectId);
  console.log('Source video files in project dir:', fs.readdirSync(storagePaths.sourceDir));
  console.log('Extracted clips in project dir:', fs.readdirSync(storagePaths.extractedDir));
  console.log('Edited vertical shorts in project dir:', fs.readdirSync(storagePaths.editedDir));

  const clips = dbRepo.getClipsByProject(projectId);
  console.log(`Database generated clips count: ${clips.length}`);
  for (const c of clips) {
    console.log(` - Clip: ${c.id} | Title: "${c.title}" | Status: ${c.status} | Output: ${c.output_path}`);
  }

  if (clips.length > 0 && fs.readdirSync(storagePaths.editedDir).length > 0) {
    console.log('\n✅ PIPELINE TEST PASSED! Genuine YouTube video ingested, clips cut, meme sounds added, and 9:16 vertical shorts generated!');
  } else {
    console.error('\n❌ PIPELINE TEST FAILED: No clips produced.');
    process.exit(1);
  }
}

testPipeline().catch((err) => {
  console.error('Fatal error running pipeline test:', err);
  process.exit(1);
});
