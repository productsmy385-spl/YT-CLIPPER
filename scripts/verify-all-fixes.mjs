import path from 'node:path';
import fs from 'node:fs';
import { dbRepo } from '../src/db/repository.ts';
import { rawDb } from '../src/db/index.ts';
import { MasterAgentOrchestrator } from '../src/agents/orchestrator.ts';
import { videoIngestionEngine } from '../src/lib/video-ingestion.ts';
import { fullVideoAnalyzer } from '../src/lib/full-video-analyzer.ts';
import { ffmpegCore } from '../src/lib/ffmpeg-core.ts';
import { ClipExtractionAgent } from '../src/agents/03-clip-extractor.ts';
import { VideoEditingAgent } from '../src/agents/07-video-editor.ts';

const SAMPLES_VIDEO = path.resolve('gta6-shorts-ai/public/samples/gta6_authorized_gameplay_sample.mp4');

async function runAllTests() {
  console.log('\n=============================================================');
  console.log('🧪 RUNNING CRITICAL VERIFICATION TEST SUITE');
  console.log('=============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
    }
  }

  // -----------------------------------------------------------------
  // TEST 1: Stage 1 Validation & Fast-fail on Invalid URL
  // -----------------------------------------------------------------
  console.log('--- Test 1: Stage 1 Ingestion Validation & Fast-Fail ---');
  const invalidUrl = 'https://not-youtube.com/something_random';
  const invalidResult = await videoIngestionEngine.inspectAndIngest({ url: invalidUrl });
  assert(!invalidResult.canProcess, 'Invalid URL rejected correctly');
  assert(invalidResult.errorState === 'INVALID_YOUTUBE_URL', 'Correct error state INVALID_YOUTUBE_URL returned');
  assert(invalidResult.errorMessage.length > 0, 'Clear actionable error message provided');

  // Test Valid YouTube URL parsing
  const validUrl = 'https://www.youtube.com/watch?v=ViN62GuDF2A';
  const validParsed = videoIngestionEngine.parseYouTubeUrl(validUrl);
  assert(validParsed.isValid && validParsed.videoId === 'ViN62GuDF2A', 'Valid YouTube video ID parsed cleanly');

  // -----------------------------------------------------------------
  // TEST 2: Unique Highlight Detection & Overlap Merging
  // -----------------------------------------------------------------
  console.log('\n--- Test 2: Unique Highlight Detection & Overlap Merging ---');
  const meta = ffmpegCore.probe(SAMPLES_VIDEO);
  const mockAnalysis = {
    duration: meta.duration,
    segments: [
      {
        segmentIndex: 1,
        startTime: 0,
        endTime: meta.duration,
        duration: meta.duration,
        sceneCuts: [10, 25, 40],
        audioPeaks: [
          { timestamp: 12, volumeRms: 0.85, energyLevel: 'high' },
          { timestamp: 28, volumeRms: 0.95, energyLevel: 'peak' },
        ],
        detectedEvents: [
          { timestamp: 12, visualEvent: 'High-speed drift', audioEvent: 'Screeching tires', motionScore: 0.9, audioEnergy: 0.85 },
          { timestamp: 14, visualEvent: 'Police roadblock collision', audioEvent: 'Siren crash', motionScore: 0.95, audioEnergy: 0.9 },
          { timestamp: 35, visualEvent: 'Helicopter chase shootout', audioEvent: 'Gunfire and rotor', motionScore: 0.88, audioEnergy: 0.86 },
        ],
      },
    ],
    allAudioPeaks: [],
    allSceneCuts: [10, 25, 40],
  };

  const testProjA = `proj_test_a_${Date.now()}`;
  const highlightsRun1 = fullVideoAnalyzer.detectBestHighlights(testProjA, meta.duration, mockAnalysis, '60-90s');
  const highlightsRun2 = fullVideoAnalyzer.detectBestHighlights(testProjA, meta.duration, mockAnalysis, '60-90s');

  assert(highlightsRun1.length > 0, `Generated ${highlightsRun1.length} highlights`);
  assert(
    highlightsRun1[0].id === highlightsRun2[0].id,
    'Highlight IDs are deterministic across multiple runs (no random Date.now)'
  );

  // Verify timestamps are normalized (1 decimal place)
  const allNormalized = highlightsRun1.every(
    (h) => h.startTime === Number(h.startTime.toFixed(1)) && h.endTime === Number(h.endTime.toFixed(1))
  );
  assert(allNormalized, 'Highlight start and end timestamps normalized cleanly');

  // Verify no two highlights overlap > 40% (they should have been merged)
  let foundExcessOverlap = false;
  for (let i = 0; i < highlightsRun1.length; i++) {
    for (let j = i + 1; j < highlightsRun1.length; j++) {
      const h1 = highlightsRun1[i];
      const h2 = highlightsRun1[j];
      const overlapStart = Math.max(h1.startTime, h2.startTime);
      const overlapEnd = Math.min(h1.endTime, h2.endTime);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      const minDur = Math.min(h1.duration, h2.duration);
      if (minDur > 0 && overlap / minDur > 0.40) {
        foundExcessOverlap = true;
      }
    }
  }
  assert(!foundExcessOverlap, 'No duplicate or heavily overlapping highlights generated (overlap threshold enforced)');

  // -----------------------------------------------------------------
  // TEST 3: Idempotent Clip Extraction (Reuse Existing Clips)
  // -----------------------------------------------------------------
  console.log('\n--- Test 3: Idempotent Clip Extraction (Zero Duplicates) ---');
  dbRepo.createProject({
    id: testProjA,
    userId: 'usr_creator_01',
    title: 'Test Project A - Idempotency',
    sourceFile: SAMPLES_VIDEO,
  });

  const extractor = new ClipExtractionAgent();

  // First extraction run
  const extracted1 = await extractor.execute(testProjA, {
    sourceVideoPath: SAMPLES_VIDEO,
    highlights: highlightsRun1.slice(0, 2),
    sourceVideoId: `sv_${testProjA}`,
    extractionVersion: 1,
  });

  assert(extracted1.length === 2, 'Initial extraction produced 2 clips');
  const initialClipsInDb = dbRepo.getClipsByProject(testProjA);
  assert(initialClipsInDb.length === 2, 'Exactly 2 records saved in database');

  // Second extraction run (Simulating user clicking Start Automation again or retrying)
  const extracted2 = await extractor.execute(testProjA, {
    sourceVideoPath: SAMPLES_VIDEO,
    highlights: highlightsRun1.slice(0, 2),
    sourceVideoId: `sv_${testProjA}`,
    extractionVersion: 1,
  });

  assert(extracted2.length === 2, 'Second extraction returned 2 clips');
  assert(extracted2[0].reused === true && extracted2[1].reused === true, 'Both clips were REUSED (not re-extracted)');

  const clipsInDbAfterRetry = dbRepo.getClipsByProject(testProjA);
  assert(
    clipsInDbAfterRetry.length === 2,
    `Database row count unchanged (expected: 2, actual: ${clipsInDbAfterRetry.length}) - ZERO DUPLICATES!`
  );

  // -----------------------------------------------------------------
  // TEST 4: Idempotent Editing Agent (Reuse Rendered Outputs)
  // -----------------------------------------------------------------
  console.log('\n--- Test 4: Idempotent Editing Agent ---');
  const editor = new VideoEditingAgent();
  const testClip = extracted1[0];

  const editRun1 = await editor.execute(testProjA, {
    clipId: testClip.clipId,
    rawClipPath: testClip.rawClipPath,
    duration: testClip.duration,
    editingVersion: 1,
  });

  assert(editRun1.isValid === true, 'First edit rendered valid 9:16 vertical video');
  assert(fs.existsSync(editRun1.finalVideoPath), 'Rendered output file exists on disk');

  // Second edit run with same version
  const editRun2 = await editor.execute(testProjA, {
    clipId: testClip.clipId,
    rawClipPath: testClip.rawClipPath,
    duration: testClip.duration,
    editingVersion: 1,
  });

  assert(editRun2.reused === true, 'Second edit run REUSED existing rendered video (zero re-render)');
  assert(editRun1.finalVideoPath === editRun2.finalVideoPath, 'Same file path preserved without duplication');

  // -----------------------------------------------------------------
  // TEST 5: Project Isolation (Project A vs Project B)
  // -----------------------------------------------------------------
  console.log('\n--- Test 5: Project Isolation ---');
  const testProjB = `proj_test_b_${Date.now()}`;
  dbRepo.createProject({
    id: testProjB,
    userId: 'usr_creator_01',
    title: 'Test Project B - Isolated',
    sourceFile: SAMPLES_VIDEO,
  });

  const clipsB = dbRepo.getClipsByProject(testProjB);
  assert(clipsB.length === 0, 'Project B starts with 0 clips');

  const clipsA = dbRepo.getClipsByProject(testProjA);
  assert(clipsA.length === 2, 'Project A retains its 2 clips');
  assert(
    clipsA.every((c) => c.project_id === testProjA),
    'All clips in Project A strictly belong to Project A'
  );

  // -----------------------------------------------------------------
  // TEST 6: Atomic Project Locking (Prevent Concurrent Workers)
  // -----------------------------------------------------------------
  console.log('\n--- Test 6: Atomic Project Locking ---');
  const lockAcquired1 = dbRepo.claimProjectLock(testProjA, 'worker_111');
  assert(lockAcquired1, 'Worker 1 acquired lock on Project A');

  const lockAcquired2 = dbRepo.claimProjectLock(testProjA, 'worker_222');
  assert(!lockAcquired2, 'Worker 2 REJECTED from acquiring lock on Project A simultaneously');

  dbRepo.releaseProjectLock(testProjA, 'worker_111');
  const lockAcquired3 = dbRepo.claimProjectLock(testProjA, 'worker_222');
  assert(lockAcquired3, 'Worker 2 acquired lock after Worker 1 released');
  dbRepo.releaseProjectLock(testProjA, 'worker_222');

  // -----------------------------------------------------------------
  // TEST 7: 10-Stage Transitions and Progress Calculation
  // -----------------------------------------------------------------
  console.log('\n--- Test 7: 10-Stage Progress Tracking & Persistence ---');
  const testProjC = `proj_test_c_${Date.now()}`;
  dbRepo.createProject({
    id: testProjC,
    userId: 'usr_creator_01',
    title: 'Test Project C - 10 Stages',
    sourceFile: SAMPLES_VIDEO,
  });

  // Verify all 10 stages can be saved and retrieved
  const STAGE_KEYS = [
    'validating', 'retrieving', 'source_processing', 'analyzing',
    'highlights', 'extracting', 'editing', 'subtitles', 'qa', 'export'
  ];

  STAGE_KEYS.forEach((key, idx) => {
    dbRepo.savePipelineStage({
      projectId: testProjC,
      stageNumber: idx + 1,
      stageKey: key,
      stageName: `Stage ${idx + 1} Name`,
      status: idx === 0 ? 'ACTIVE' : 'PENDING',
      progressPercent: (idx + 1) * 10,
    });
  });

  const savedStages = dbRepo.getPipelineStages(testProjC);
  assert(savedStages.length === 10, `Saved and retrieved exactly 10 pipeline stages (actual: ${savedStages.length})`);
  assert(savedStages[0].status === 'ACTIVE', 'Stage 1 is ACTIVE');
  assert(savedStages[1].status === 'PENDING', 'Stage 2 is PENDING');

  // -----------------------------------------------------------------
  // TEST 8: Stalled Job Detection & Recovery
  // -----------------------------------------------------------------
  console.log('\n--- Test 8: Stalled Job Auto-Detection ---');
  const testProjD = `proj_test_d_${Date.now()}`;
  dbRepo.createProject({
    id: testProjD,
    userId: 'usr_creator_01',
    title: 'Test Project D - Stalled Job Simulation',
    sourceFile: SAMPLES_VIDEO,
  });

  // Set project as in_progress with an old heartbeat timestamp (> 300s ago)
  const oldTimestamp = new Date(Date.now() - 360000).toISOString();
  rawDb.prepare(`
    UPDATE projects 
    SET status = 'in_progress', current_stage = 'Validating source link', stage_id = '1',
        heartbeat_at = ?, updated_at = ?
    WHERE id = ?
  `).run(oldTimestamp, oldTimestamp, testProjD);

  const recoveredCount = dbRepo.checkAndRecoverStalledJobs(180);
  assert(recoveredCount >= 1, `Stalled job detector caught timed-out job (count: ${recoveredCount})`);

  const updatedD = dbRepo.getProject(testProjD);
  assert(updatedD.status === 'error', 'Stalled project automatically marked as error');
  assert(updatedD.error_message.includes('heartbeat timed out'), 'Actionable stalled error message attached');

  // -----------------------------------------------------------------
  // SUMMARY
  // -----------------------------------------------------------------
  console.log('\n=============================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================================\n');

  // Clean up test projects
  [testProjA, testProjB, testProjC, testProjD].forEach((id) => {
    try {
      rawDb.prepare(`DELETE FROM generated_clips WHERE project_id = ?`).run(id);
      rawDb.prepare(`DELETE FROM detected_highlights WHERE project_id = ?`).run(id);
      rawDb.prepare(`DELETE FROM project_pipeline_stages WHERE project_id = ?`).run(id);
      rawDb.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
    } catch {}
  });

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
