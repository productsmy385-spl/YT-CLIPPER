import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');

// Import application modules
const { dbRepo } = await import('../src/db/repository.ts');
const { videoIngestionEngine } = await import('../src/lib/video-ingestion.ts');
const { ffmpegCore } = await import('../src/lib/ffmpeg-core.ts');
const { MasterAgentOrchestrator } = await import('../src/agents/orchestrator.ts');

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

console.log('================================================================');
console.log('  GTA 6 AI SHORTS CREATOR - 3-PROJECT ACCEPTANCE TEST SUITE');
console.log('================================================================\n');

// 1. Locate 3 Distinct Source Files
const sourceA = path.resolve(appRoot, 'storage', 'authorized_sources', 'ViN62GuDF2A.mp4');
const sourceB = path.resolve(appRoot, 'storage', 'authorized_sources', 'dQw4w9WgXcQ.mp4');
const sourceC = path.resolve(appRoot, 'storage', 'uploads', '1795241970678_Screen_Recording_2026-05-18_184952.mp4');

console.log('Checking source files:');
[sourceA, sourceB, sourceC].forEach((src, idx) => {
  if (!fs.existsSync(src)) {
    throw new Error(`Required source file ${idx + 1} not found at: ${src}`);
  }
  const sizeMb = (fs.statSync(src).size / (1024 * 1024)).toFixed(1);
  console.log(`  Source ${String.fromCharCode(65 + idx)}: ${path.basename(src)} (${sizeMb} MB)`);
});

const hashA = sha256File(sourceA);
const hashB = sha256File(sourceB);
const hashC = sha256File(sourceC);

console.log('\nSHA256 Checksums:');
console.log(`  Source A: ${hashA}`);
console.log(`  Source B: ${hashB}`);
console.log(`  Source C: ${hashC}`);

if (hashA === hashB || hashB === hashC || hashA === hashC) {
  throw new Error('FATAL: Sources A, B, and C must have distinct checksums!');
}
console.log('✓ All 3 sources have completely distinct SHA256 checksums.');

// 2. Test Case 1: Silent Sample Substitution Prevention Test
console.log('\n--- TEST CASE 1: Unavailable Video Acquisition Halt (No Silent Fallback) ---');
const unavailableUrl = 'https://www.youtube.com/watch?v=NON_EXISTENT_99999';
const probeResult = await videoIngestionEngine.inspectAndIngest({
  url: unavailableUrl,
  useAuthorizedFallback: true,
});

console.log(`  Query URL: ${unavailableUrl}`);
console.log(`  canProcess: ${probeResult.canProcess}`);
console.log(`  errorState: ${probeResult.errorState}`);
console.log(`  errorMessage: ${probeResult.errorMessage}`);

if (probeResult.canProcess === true) {
  throw new Error('FAIL: Unavailable URL should NOT be processable!');
}
if (probeResult.filePath && probeResult.filePath.includes('gta6_authorized_gameplay_sample')) {
  throw new Error('FAIL: Silent sample substitution detected! gta6_authorized_gameplay_sample was assigned.');
}
console.log('✓ TEST CASE 1 PASSED: Pipeline halted with explicit error; NO silent sample substituted.\n');

// 3. Test Function for a Project Run
async function runProjectAcceptance(label, sourceFile, sourceHash) {
  console.log(`--- TEST CASE: Processing Project ${label} ---`);
  const timestamp = Date.now();
  const projectId = `proj_test_${label.toLowerCase()}_${timestamp}`;
  const sourceVideoId = `sv_${projectId}`;
  const title = `Project ${label} Gameplay Test (${path.basename(sourceFile)})`;

  console.log(`  Project ID: ${projectId}`);
  console.log(`  Source Video ID: ${sourceVideoId}`);
  console.log(`  Source Path: ${sourceFile}`);
  console.log(`  Source SHA256: ${sourceHash}`);

  // Create Project in DB
  dbRepo.createProject({
    id: projectId,
    userId: 'usr_acceptance_tester',
    title,
    sourceFile,
    sourceVideoId,
  });

  // Initialize stages
  const stages = [
    { num: 1, key: 'validating', name: 'Validating source link' },
    { num: 2, key: 'retrieving', name: 'Retrieving video information' },
    { num: 3, key: 'source_processing', name: 'Processing authorized source video' },
    { num: 4, key: 'analyzing', name: 'Analyzing video' },
    { num: 5, key: 'highlights', name: 'Detecting highlights' },
    { num: 6, key: 'extracting', name: 'Extracting clips' },
    { num: 7, key: 'editing', name: 'Editing clips' },
  ];
  stages.forEach(stg => {
    dbRepo.savePipelineStage({
      projectId,
      stageNumber: stg.num,
      stageKey: stg.key,
      stageName: stg.name,
      status: 'PENDING',
      progressPercent: 0,
    });
  });

  // Run MasterAgentOrchestrator with 15-30s short duration preset for rapid test execution
  const orchestrator = new MasterAgentOrchestrator();
  const result = await orchestrator.processProject({
    projectId,
    sourceVideoId,
    sourceFilePath: sourceFile,
    jobId: `job_${projectId}`,
    durationPreset: '15-30s',
  });

  // Verify Project Status
  const projectInDb = dbRepo.getProject(projectId);
  console.log(`  Project DB Status: ${projectInDb.status} (Progress: ${projectInDb.progress}%)`);

  // Verify Source Video Record in DB
  const sourceRecord = dbRepo.getSourceVideoById(sourceVideoId);
  if (!sourceRecord) {
    throw new Error(`FAIL: Source video record ${sourceVideoId} not found in DB!`);
  }
  console.log(`  DB Source Record: ID=${sourceRecord.id}, File=${sourceRecord.file_name}, Duration=${sourceRecord.duration.toFixed(1)}s`);

  // Verify Isolated Source File in Project Storage
  const projectStorageSource = path.resolve(appRoot, 'storage', 'projects', projectId, 'source', `${projectId}_${sourceVideoId}_source.mp4`);
  if (!fs.existsSync(projectStorageSource)) {
    throw new Error(`FAIL: Isolated project source file not found at: ${projectStorageSource}`);
  }
  const isolatedHash = sha256File(projectStorageSource);
  if (isolatedHash !== sourceHash) {
    throw new Error(`FAIL: Isolated source checksum does not match original source! Orig=${sourceHash}, Iso=${isolatedHash}`);
  }
  console.log(`  ✓ Isolated Source Verified: ${path.basename(projectStorageSource)} (SHA256 matches)`);

  // Verify Highlights Scoped to Project & SourceVideoId
  const highlights = dbRepo.getHighlightsByProject(projectId);
  console.log(`  Detected Highlights: ${highlights.length}`);
  if (highlights.length === 0) {
    throw new Error(`FAIL: 0 highlights detected for Project ${label}`);
  }
  highlights.forEach((hl, i) => {
    if (hl.projectId !== projectId) {
      throw new Error(`FAIL: Highlight ${hl.id} has incorrect projectId: ${hl.projectId} !== ${projectId}`);
    }
    if (hl.source_video_id && hl.source_video_id !== sourceVideoId) {
      throw new Error(`FAIL: Highlight ${hl.id} has mismatched source_video_id!`);
    }
  });

  // Verify Extracted & Edited Clips Scoped to Project
  const clips = dbRepo.getClipsByProject(projectId);
  console.log(`  Generated Clips in DB: ${clips.length}`);
  if (clips.length === 0) {
    throw new Error(`FAIL: 0 clips generated for Project ${label}`);
  }

  clips.forEach((c) => {
    if (c.project_id !== projectId) {
      throw new Error(`FAIL: Clip ${c.id} has incorrect project_id: ${c.project_id} !== ${projectId}`);
    }
    if (c.source_video_id !== sourceVideoId) {
      throw new Error(`FAIL: Clip ${c.id} has incorrect source_video_id: ${c.source_video_id} !== ${sourceVideoId}`);
    }
    // Verify file exists on disk
    const rawPath = c.raw_clip_path || c.output_path;
    if (!rawPath || !fs.existsSync(rawPath) || fs.statSync(rawPath).size < 1000) {
      throw new Error(`FAIL: Raw clip file missing or empty for clip ${c.id}: ${rawPath}`);
    }
    console.log(`    Clip: ${c.id} | Status: ${c.status} | SourceID: ${c.source_video_id} | Path: ${path.basename(rawPath)}`);
  });

  console.log(`✓ Project ${label} processed and verified successfully!\n`);
  return { projectId, sourceVideoId, sourceHash, clipsCount: clips.length, clips };
}

// Execute for Project A, B, and C
const resA = await runProjectAcceptance('A', sourceA, hashA);
const resB = await runProjectAcceptance('B', sourceB, hashB);
const resC = await runProjectAcceptance('C', sourceC, hashC);

// 4. Strict Isolation Cross-Check
console.log('--- TEST CASE: Relational & Query Isolation Cross-Check ---');

const clipsA = dbRepo.getPaginatedClips({ projectId: resA.projectId, pageSize: 100 }).items;
const clipsB = dbRepo.getPaginatedClips({ projectId: resB.projectId, pageSize: 100 }).items;
const clipsC = dbRepo.getPaginatedClips({ projectId: resC.projectId, pageSize: 100 }).items;

console.log(`  Query for Project A clips: ${clipsA.length} clips returned`);
console.log(`  Query for Project B clips: ${clipsB.length} clips returned`);
console.log(`  Query for Project C clips: ${clipsC.length} clips returned`);

// Verify NO cross-contamination
const idsA = new Set(clipsA.map(c => c.id));
const idsB = new Set(clipsB.map(c => c.id));
const idsC = new Set(clipsC.map(c => c.id));

for (const id of idsA) {
  if (idsB.has(id)) throw new Error(`CROSS-CONTAMINATION: Clip ${id} from Project A found in Project B!`);
  if (idsC.has(id)) throw new Error(`CROSS-CONTAMINATION: Clip ${id} from Project A found in Project C!`);
}
for (const id of idsB) {
  if (idsA.has(id)) throw new Error(`CROSS-CONTAMINATION: Clip ${id} from Project B found in Project A!`);
  if (idsC.has(id)) throw new Error(`CROSS-CONTAMINATION: Clip ${id} from Project B found in Project C!`);
}

console.log('✓ Relational isolation confirmed: Zero cross-contamination between Projects A, B, and C.');

console.log('\n================================================================');
console.log('  ALL ACCEPTANCE TESTS PASSED (100% VERIFIED)');
console.log('================================================================');
