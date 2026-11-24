import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { initDatabase } from '../src/db/index.ts';
import { dbRepo } from '../src/db/repository.ts';
import { mediaAcquisitionService } from '../src/lib/source-acquisition.ts';
import { videoIngestionEngine, computeFileChecksum } from '../src/lib/video-ingestion.ts';
import { ffmpegCore } from '../src/lib/ffmpeg-core.ts';
import { getProjectStoragePaths } from '../src/lib/app-paths.ts';
import { PIPELINE_STAGES } from '../src/agents/orchestrator.ts';

initDatabase();

async function runTestSuite() {
  console.log('========================================================================');
  console.log('    TEST SUITE: REDESIGNED YOUTUBE-FIRST WORKFLOW & MEDIA ACQUISITION    ');
  console.log('========================================================================\n');

  let passedTests = 0;
  const totalTests = 10;

  // ---------------------------------------------------------------------------
  // SCENARIO 1: Source Type Detection (Unified Detection)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Unified Source Type Detection ---');
  try {
    const ytType = mediaAcquisitionService.detectSourceType('https://www.youtube.com/watch?v=ViN62GuDF2A');
    const directType = mediaAcquisitionService.detectSourceType('https://example.com/assets/gameplay.mp4');
    const cloudType = mediaAcquisitionService.detectSourceType('s3://my-bucket/gameplay.mov');
    const uploadType = mediaAcquisitionService.detectSourceType('C:/storage/uploads/recording.mp4');

    if (ytType !== 'youtube') throw new Error(`Expected 'youtube', got '${ytType}'`);
    if (directType !== 'direct_url') throw new Error(`Expected 'direct_url', got '${directType}'`);
    if (cloudType !== 'cloud_storage') throw new Error(`Expected 'cloud_storage', got '${cloudType}'`);
    if (uploadType !== 'upload') throw new Error(`Expected 'upload', got '${uploadType}'`);

    console.log('✓ PASS: All 4 source types correctly identified.\n');
    passedTests++;
  } catch (err) {
    console.error('✗ FAIL Test 1:', err.message, '\n');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 2: Non-blocking YouTube Inspection (canProcess: true)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Non-Blocking YouTube URL Metadata Inspection ---');
  try {
    const testUrl = 'https://www.youtube.com/watch?v=ViN62GuDF2A';
    const inspected = await videoIngestionEngine.inspectAndIngest(testUrl);

    if (!inspected.canProcess) {
      throw new Error(`Expected canProcess: true, but got false. ErrorState: ${inspected.errorState}`);
    }
    if (!inspected.metadataRetrieved) {
      throw new Error(`Expected metadataRetrieved: true`);
    }
    if (!inspected.videoId || inspected.videoId !== 'ViN62GuDF2A') {
      throw new Error(`Expected videoId: 'ViN62GuDF2A', got '${inspected.videoId}'`);
    }

    console.log(`✓ PASS: YouTube metadata inspected cleanly (Title: "${inspected.title}", canProcess: ${inspected.canProcess}).\n`);
    passedTests++;
  } catch (err) {
    console.error('✗ FAIL Test 2:', err.message, '\n');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 3: Authorized YouTube Source Acquisition
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: Authorized YouTube Media Acquisition ---');
  const proj3Id = `test_proj_yt_auth_${Date.now()}`;
  try {
    const acquisition = await mediaAcquisitionService.acquireMedia({
      sourceUrl: 'https://www.youtube.com/watch?v=ViN62GuDF2A',
      projectId: proj3Id,
      creatorName: 'BruceDropEmOff',
    });

    if (acquisition.acquisitionStatus !== 'ready') {
      throw new Error(`Expected status 'ready', got '${acquisition.acquisitionStatus}': ${acquisition.error}`);
    }
    if (!acquisition.filePath || !fs.existsSync(acquisition.filePath)) {
      throw new Error(`Acquired file does not exist at: ${acquisition.filePath}`);
    }
    if (!acquisition.metadata || acquisition.metadata.duration <= 0) {
      throw new Error(`Invalid duration in metadata: ${acquisition.metadata?.duration}`);
    }

    console.log(`✓ PASS: Media acquired successfully via ${acquisition.provider} (${acquisition.metadata.duration}s, ${acquisition.metadata.width}x${acquisition.metadata.height}).\n`);
    passedTests++;
  } catch (err) {
    console.error('✗ FAIL Test 3:', err.message, '\n');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 4: Technical Error Reporting on Unacquired YouTube Videos
  // ---------------------------------------------------------------------------
  console.log('--- TEST 4: Transparent Technical Error on Unacquired YouTube Video ---');
  const proj4Id = `test_proj_yt_unauth_${Date.now()}`;
  try {
    const acquisition = await mediaAcquisitionService.acquireMedia({
      sourceUrl: 'https://www.youtube.com/watch?v=O__eUdBwsDQ',
      projectId: proj4Id,
    });

    if (acquisition.acquisitionStatus !== 'failed') {
      throw new Error(`Expected status 'failed', got '${acquisition.acquisitionStatus}'`);
    }
    if (!acquisition.error || !acquisition.error.includes('YouTube Data API provides video metadata only')) {
      throw new Error(`Expected YouTube Data API technical error message, got: ${acquisition.error}`);
    }
    if (acquisition.canRetry !== true) {
      throw new Error(`Expected canRetry: true`);
    }

    console.log(`✓ PASS: Returned transparent technical error without crashing or silent failure:\n  "${acquisition.error.substring(0, 100)}..."\n`);
    passedTests++;
  } catch (err) {
    console.error('✗ FAIL Test 4:', err.message, '\n');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 5: Direct Media File Acquisition Pathway
  // ---------------------------------------------------------------------------
  console.log('--- TEST 5: Direct Media Acquisition Pathway ---');
  const proj5Id = `test_proj_direct_${Date.now()}`;
  try {
    // We test using an existing local sample file as a verified master source
    const samplePath = path.resolve('storage/authorized_sources/ViN62GuDF2A.mp4');
    if (!fs.existsSync(samplePath)) throw new Error('Sample master file not found.');

    const acquisition = await mediaAcquisitionService.acquireMedia({
      sourceFile: samplePath,
      projectId: proj5Id,
    });

    if (acquisition.acquisitionStatus !== 'ready') {
      throw new Error(`Expected status 'ready', got '${acquisition.acquisitionStatus}'`);
    }
    if (!acquisition.filePath || !fs.existsSync(acquisition.filePath)) {
      throw new Error('Target isolated master file was not created.');
    }

    console.log(`✓ PASS: Direct media stream ingested and verified at: ${path.basename(acquisition.filePath)}.\n`);
    passedTests++;
  } catch (err) {
    console.error('✗ FAIL Test 5:', err.message, '\n');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 6: Local Upload Verification & Checksum Isolation
  // ---------------------------------------------------------------------------
  console.log('--- TEST 6: Local Upload Verification & SHA-256 Checksum ---');
  const proj6Id = `test_proj_upload_${Date.now()}`;
  try {
    const samplePath = path.resolve('storage/authorized_sources/ViN62GuDF2A.mp4');
    const acquisition = await mediaAcquisitionService.acquireMedia({
      sourceFile: samplePath,
      projectId: proj6Id,
    });

    if (!acquisition.metadata?.checksum || acquisition.metadata.checksum.length !== 64) {
      throw new Error(`Invalid SHA-256 checksum: ${acquisition.metadata?.checksum}`);
    }

    console.log(`✓ PASS: SHA-256 checksum calculated: ${acquisition.metadata.checksum.substring(0, 16)}...\n`);
    passedTests++;
  } catch (err) {
    console.error('✗ FAIL Test 6:', err.message, '\n');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 7: Invalid YouTube URL Validation
  // ---------------------------------------------------------------------------
  console.log('--- TEST 7: Invalid YouTube URL Format Validation ---');
  try {
    const invalidUrl = 'https://youtube.com/watch-nothing-valid';
    const parsed = videoIngestionEngine.parseYouTubeUrl(invalidUrl);

    if (parsed.isValid) {
      throw new Error('Expected isValid: false for malformed YouTube URL.');
    }

    console.log('✓ PASS: Malformed YouTube URL rejected correctly.\n');
    passedTests++;
  } catch (err) {
    console.error('✗ FAIL Test 7:', err.message, '\n');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 8: Corrupted File Rejection by FFprobe
  // ---------------------------------------------------------------------------
  console.log('--- TEST 8: Corrupted Video Container Rejection ---');
  const corruptFile = path.resolve('storage/temp_corrupt_test.mp4');
  try {
    fs.writeFileSync(corruptFile, 'NOT_A_VALID_MP4_HEADER_RANDOM_TEXT_DATA_CORRUPTION');

    let threwError = false;
    try {
      const meta = ffmpegCore.probe(corruptFile);
      if (meta.duration <= 0) threwError = true;
    } catch {
      threwError = true;
    }

    if (!threwError) {
      throw new Error('FFprobe failed to reject corrupted mock container.');
    }

    console.log('✓ PASS: Corrupted container safely detected and rejected by FFprobe.\n');
    passedTests++;
  } catch (err) {
    console.error('✗ FAIL Test 8:', err.message, '\n');
  } finally {
    if (fs.existsSync(corruptFile)) fs.unlinkSync(corruptFile);
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 9: Full 10-Stage Pipeline Status Database Initialization
  // ---------------------------------------------------------------------------
  console.log('--- TEST 9: 10 Pipeline Stages Matching MasterAgentOrchestrator ---');
  const proj9Id = `test_proj_stages_${Date.now()}`;
  try {
    dbRepo.createProject({
      id: proj9Id,
      userId: 'usr_creator_01',
      title: '10 Stage Pipeline Test',
    });

    const expectedKeys = [
      'inspecting',
      'metadata',
      'acquiring',
      'validating_media',
      'extracting_audio',
      'highlights',
      'extracting',
      'generating_shorts',
      'rendering_videos',
      'completed',
    ];

    PIPELINE_STAGES.forEach((stg) => {
      dbRepo.savePipelineStage({
        projectId: proj9Id,
        stageNumber: stg.number,
        stageKey: stg.key,
        stageName: stg.name,
        status: stg.number === 1 ? 'ACTIVE' : 'PENDING',
        progressPercent: stg.number === 1 ? 2 : 0,
      });
    });

    const stagesInDb = dbRepo.getPipelineStages(proj9Id);
    if (stagesInDb.length !== 10) {
      throw new Error(`Expected 10 stages in database, got ${stagesInDb.length}`);
    }

    for (let i = 0; i < 10; i++) {
      if (stagesInDb[i].stage_key !== expectedKeys[i]) {
        throw new Error(`Stage ${i + 1} key mismatch: expected '${expectedKeys[i]}', got '${stagesInDb[i].stage_key}'`);
      }
    }

    console.log(`✓ PASS: All 10 stages properly verified in DB (Stages 1..10: ${expectedKeys.join(' -> ')}).\n`);
    passedTests++;
  } catch (err) {
    console.error('✗ FAIL Test 9:', err.message, '\n');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 10: Multi-Project Isolation & Anti-Collision Verification
  // ---------------------------------------------------------------------------
  console.log('--- TEST 10: Project Isolation & Anti-Collision Verification ---');
  const projA_Id = `proj_iso_A_${Date.now()}`;
  const projB_Id = `proj_iso_B_${Date.now()}`;
  try {
    const sample = path.resolve('storage/authorized_sources/ViN62GuDF2A.mp4');

    const acqA = await mediaAcquisitionService.acquireMedia({
      sourceFile: sample,
      projectId: projA_Id,
    });

    const acqB = await mediaAcquisitionService.acquireMedia({
      sourceFile: sample,
      projectId: projB_Id,
    });

    if (acqA.filePath === acqB.filePath) {
      throw new Error(`Paths collided: Both projects point to ${acqA.filePath}`);
    }

    const pathsA = getProjectStoragePaths(projA_Id);
    const pathsB = getProjectStoragePaths(projB_Id);

    if (pathsA.sourceDir === pathsB.sourceDir) {
      throw new Error('Project storage directories collided.');
    }

    console.log(`✓ PASS: Projects are completely isolated:`);
    console.log(`  Project A Storage: ${path.basename(pathsA.base)}`);
    console.log(`  Project B Storage: ${path.basename(pathsB.base)}\n`);
    passedTests++;
  } catch (err) {
    console.error('✗ FAIL Test 10:', err.message, '\n');
  }

  // ---------------------------------------------------------------------------
  // FINAL SCORECARD
  // ---------------------------------------------------------------------------
  console.log('========================================================================');
  console.log(`TOTAL RESULT: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('========================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
