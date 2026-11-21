import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(import.meta.dirname, '..');
const DB_PATH = path.join(ROOT, 'storage', 'gta6_shorts.db');
const BASE_URL = 'http://localhost:3000';

async function runE2ETests() {
  console.log('\n=============================================================');
  console.log('🧪 RUNNING END-TO-END VERIFICATION TEST SUITE');
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

  const db = new DatabaseSync(DB_PATH);

  // -----------------------------------------------------------------
  // 1. DATABASE SCHEMA & CONSTRAINT VALIDATION
  // -----------------------------------------------------------------
  console.log('--- 1. Database Schema & Constraints ---');

  // Verify unique index on generated_clips
  const clipIndexes = db.prepare(`PRAGMA index_list('generated_clips')`).all();
  const hasClipUniqueIndex = clipIndexes.some((idx) => idx.name === 'idx_unique_clips_identity' && idx.unique === 1);
  assert(hasClipUniqueIndex, 'Unique index idx_unique_clips_identity exists on generated_clips(project_id, highlight_id, extraction_version)');

  // Verify unique index on project_pipeline_stages
  const stageIndexes = db.prepare(`PRAGMA index_list('project_pipeline_stages')`).all();
  const hasStageUniqueIndex = stageIndexes.some((idx) => idx.name === 'idx_unique_stage_proj_num' && idx.unique === 1);
  assert(hasStageUniqueIndex, 'Unique index idx_unique_stage_proj_num exists on project_pipeline_stages(project_id, stage_number)');

  // Test that attempting to insert a duplicate clip is rejected by SQLite
  const testProjId = `test_db_${Date.now()}`;
  db.prepare(`
    INSERT INTO projects (id, user_id, title, status, created_at, updated_at)
    VALUES (?, 'usr_creator_01', 'DB Test', 'created', datetime('now'), datetime('now'))
  `).run(testProjId);

  db.prepare(`
    INSERT INTO generated_clips (
      id, project_id, title, duration, resolution,
      processing_status, highlight_id, extraction_version, created_at, updated_at
    ) VALUES (
      'clip_test_1', ?, 'Clip 1', 30.0, '1080x1920',
      'completed', 'hl_test_1', 1, datetime('now'), datetime('now')
    )
  `).run(testProjId);

  let duplicateBlocked = false;
  try {
    db.prepare(`
      INSERT INTO generated_clips (
        id, project_id, title, duration, resolution,
        processing_status, highlight_id, extraction_version, created_at, updated_at
      ) VALUES (
        'clip_test_2_duplicate', ?, 'Clip Duplicate', 30.0, '1080x1920',
        'completed', 'hl_test_1', 1, datetime('now'), datetime('now')
      )
    `).run(testProjId);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      duplicateBlocked = true;
    }
  }
  assert(duplicateBlocked, 'SQLite UNIQUE constraint blocked inserting duplicate clip for same highlight and extraction_version');

  // Verify zero duplicates exist in current database
  const dupCheck = db.prepare(`
    SELECT project_id, highlight_id, extraction_version, COUNT(*) as count
    FROM generated_clips
    WHERE highlight_id IS NOT NULL
    GROUP BY project_id, highlight_id, extraction_version
    HAVING count > 1
  `).all();
  assert(dupCheck.length === 0, `Database reconciliation verified: 0 duplicate clip groups exist in database (found: ${dupCheck.length})`);

  // Clean up test DB project
  db.prepare(`DELETE FROM generated_clips WHERE project_id = ?`).run(testProjId);
  db.prepare(`DELETE FROM projects WHERE id = ?`).run(testProjId);

  // -----------------------------------------------------------------
  // 2. STAGE 1 FAST VALIDATION & NON-BLOCKING ERROR HANDLING
  // -----------------------------------------------------------------
  console.log('\n--- 2. Stage 1 Fast Validation & Fast-Fail ---');

  // Warm up route
  await fetch(`${BASE_URL}/api/projects`).catch(() => {});

  const startT1 = Date.now();
  const invalidRes = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://vimeo.com/not-a-youtube-url',
      title: 'Invalid URL Test',
    }),
  });
  const t1 = Date.now() - startT1;
  const invalidData = await invalidRes.json();

  assert(invalidRes.status === 422, `Invalid URL returned HTTP 422 Unprocessable Entity (got: ${invalidRes.status})`);
  assert(t1 < 1000, `Validation responded immediately without hanging (${t1}ms < 1000ms)`);
  assert(invalidData.errorState === 'INVALID_YOUTUBE_URL', 'Correct error code INVALID_YOUTUBE_URL returned');
  assert(invalidData.stageId === '1', 'Fast-fail correctly tagged with stageId = 1');
  assert(invalidData.message && invalidData.message.length > 10, `Actionable error message returned: "${invalidData.message.substring(0, 50)}..."`);

  // -----------------------------------------------------------------
  // 3. PIPELINE START (<100ms NON-BLOCKING RESPONSE) & 10 STAGES
  // -----------------------------------------------------------------
  console.log('\n--- 3. Pipeline Start & 10-Stage Initialization ---');

  // Clear any existing test projects with this URL so Test 3 starts fresh
  db.prepare(`DELETE FROM project_pipeline_stages WHERE project_id IN (SELECT id FROM projects WHERE source_url = 'https://www.youtube.com/watch?v=5-ddM1JHOWc' AND title LIKE '%Test%')`).run();
  db.prepare(`DELETE FROM generated_clips WHERE project_id IN (SELECT id FROM projects WHERE source_url = 'https://www.youtube.com/watch?v=5-ddM1JHOWc' AND title LIKE '%Test%')`).run();
  db.prepare(`DELETE FROM projects WHERE source_url = 'https://www.youtube.com/watch?v=5-ddM1JHOWc' AND title LIKE '%Test%'`).run();

  const startT2 = Date.now();
  const createRes = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceUrl: 'https://www.youtube.com/watch?v=5-ddM1JHOWc',
      title: 'GTA 6 Real E2E Pipeline Test',
      mode: 'curated',
      targetDuration: '60-90s',
    }),
  });
  const t2 = Date.now() - startT2;
  const createData = await createRes.json();

  assert(createRes.status === 201 || createRes.status === 200, `Project creation succeeded with HTTP ${createRes.status}`);
  assert(t2 < 1000, `API responded asynchronously without blocking (${t2}ms < 1000ms)`);
  assert(createData.success === true, 'Response body success is true');
  assert(createData.projectId && createData.projectId.startsWith('proj_'), `Valid project ID assigned: ${createData.projectId}`);
  assert(createData.status === 'in_progress', `Initial status is in_progress (got: ${createData.status})`);

  const createdProjId = createData.projectId;

  // Verify all 10 stages exist in project_pipeline_stages table
  const stagesInDb = db.prepare(`
    SELECT stage_number, stage_key, stage_name, status, progress_percent
    FROM project_pipeline_stages
    WHERE project_id = ?
    ORDER BY stage_number ASC
  `).all(createdProjId);

  assert(stagesInDb.length === 10, `Exactly 10 pipeline stages initialized in database (actual: ${stagesInDb.length})`);
  assert(stagesInDb[0].status === 'ACTIVE' || stagesInDb[0].status === 'COMPLETED', `Stage 1 status is ${stagesInDb[0].status}`);

  // -----------------------------------------------------------------
  // 4. DUPLICATE SUBMISSION / RETRY IDEMPOTENCY
  // -----------------------------------------------------------------
  console.log('\n--- 4. Duplicate Submission Idempotency ---');

  // Submit exact same URL again while project is active
  const dupRes = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceUrl: 'https://www.youtube.com/watch?v=5-ddM1JHOWc',
      title: 'GTA 6 Real E2E Pipeline Test (Duplicate Click)',
    }),
  });
  const dupData = await dupRes.json();

  assert(dupRes.status === 200, `Duplicate submission handled gracefully (HTTP 200)`);
  assert(dupData.projectId === createdProjId, `Returned existing project ID instead of spawning a new duplicate (ID: ${dupData.projectId})`);
  assert(dupData.duplicateDetected === true || dupData.resumed === true, 'Duplicate / resumed flag correctly set in response');

  // -----------------------------------------------------------------
  // 5. STAGE TRANSITIONS & POLLING PROGRESS
  // -----------------------------------------------------------------
  console.log('\n--- 5. Real Stage Transitions & Progress Polling ---');

  // Poll project until it advances past Stage 1 / 5%
  let pollData = null;
  let pollRes = null;
  for (let attempt = 1; attempt <= 10; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      pollRes = await fetch(`${BASE_URL}/api/projects/${createdProjId}`);
      if (pollRes.ok) {
        pollData = await pollRes.json();
        const stageNum = Number(pollData?.project?.stage_id || 1);
        const prog = Number(pollData?.project?.progress || 0);
        console.log(`  Poll ${attempt}/10: Stage ${stageNum} (${pollData?.project?.current_stage}), Progress: ${prog}%`);
        if (stageNum > 1 || prog > 5) break;
      }
    } catch {}
  }

  assert(pollRes && pollRes.status === 200, 'GET /api/projects/:id returned HTTP 200');
  assert(pollData && pollData.project && pollData.project.id === createdProjId, 'Fetched correct project');
  assert(pollData.stages && pollData.stages.length === 10, `Returned stages array with 10 stages (actual: ${pollData.stages?.length})`);
  
  const currentStageId = Number(pollData.project.stage_id);
  assert(currentStageId > 1 || pollData.project.progress > 5, `Pipeline progressed past Stage 1 / 5% (Stage: ${currentStageId}, Progress: ${pollData.project.progress}%)`);

  // Verify completed stages have timestamps
  const completedStages = pollData.stages.filter((s) => s.status === 'COMPLETED');
  console.log(`  Stages completed so far: ${completedStages.length}/10`);
  assert(completedStages.length >= 1, `At least 1 stage completed with timestamps`);
  if (completedStages.length > 0) {
    assert(completedStages[0].started_at !== null, 'Stage 1 has started_at timestamp');
    assert(completedStages[0].completed_at !== null, 'Stage 1 has completed_at timestamp');
  }

  // -----------------------------------------------------------------
  // 6. STALLED JOB AUTO-DETECTION & RECOVERY
  // -----------------------------------------------------------------
  console.log('\n--- 6. Stalled Job Auto-Detection & Recovery ---');

  const stalledProjId = `proj_stalled_sim_${Date.now()}`;
  const oldHeartbeat = new Date(Date.now() - 400000).toISOString();
  db.prepare(`
    INSERT INTO projects (
      id, user_id, title, status, current_stage, stage_id,
      heartbeat_at, created_at, updated_at
    ) VALUES (
      ?, 'usr_creator_01', 'Stalled Job Simulation', 'in_progress', 'Validating source link', '1',
      ?, ?, ?
    )
  `).run(stalledProjId, oldHeartbeat, oldHeartbeat, oldHeartbeat);

  // Calling GET /api/projects/:id triggers checkAndRecoverStalledJobs
  const checkStalledRes = await fetch(`${BASE_URL}/api/projects/${stalledProjId}`);
  const checkStalledData = await checkStalledRes.json();

  assert(checkStalledData.project.status === 'error', `Stalled job automatically transitioned to 'error' (got: ${checkStalledData.project.status})`);
  assert(
    checkStalledData.project.error_message.includes('heartbeat timed out'),
    `Informative timeout error attached: "${checkStalledData.project.error_message}"`
  );

  // Clean up simulation and test projects
  db.prepare(`DELETE FROM project_pipeline_stages WHERE project_id = ?`).run(stalledProjId);
  db.prepare(`DELETE FROM projects WHERE id = ?`).run(stalledProjId);

  try {
    db.prepare(`DELETE FROM generated_clips WHERE project_id = ?`).run(createdProjId);
    db.prepare(`DELETE FROM detected_highlights WHERE project_id = ?`).run(createdProjId);
    db.prepare(`DELETE FROM project_pipeline_stages WHERE project_id = ?`).run(createdProjId);
    db.prepare(`DELETE FROM projects WHERE id = ?`).run(createdProjId);
  } catch {}

  // -----------------------------------------------------------------
  // SUMMARY
  // -----------------------------------------------------------------
  console.log('\n=============================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runE2ETests().catch((err) => {
  console.error('E2E Test execution failed:', err);
  process.exit(1);
});
