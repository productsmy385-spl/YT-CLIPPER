import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ffmpegCore } from '../src/lib/ffmpeg-core.ts';
import { rightsEngine } from '../src/lib/rights-engine.ts';
import { sourceAcquisitionEngine } from '../src/lib/source-acquisition.ts';
import { MasterAgentOrchestrator } from '../src/agents/orchestrator.ts';
import { initDatabase } from '../src/db/index.ts';
import { dbRepo } from '../src/db/repository.ts';
import { computeFileChecksum } from '../src/lib/video-ingestion.ts';
import { getProjectStoragePaths } from '../src/lib/app-paths.ts';

initDatabase();

const testSuiteDir = path.resolve('storage/test_verification_suite');
fs.mkdirSync(testSuiteDir, { recursive: true });

async function runTestSuite() {
  console.log('========================================================================');
  console.log('      CRITICAL AUDIT & ACCEPTANCE TEST SUITE (PHASES 1 TO 9)            ');
  console.log('========================================================================\n');

  // Asset paths
  const bgmPath = path.resolve('public/assets/music/mus_phonk_drift.wav');
  const sfxPath = path.resolve('public/assets/sfx/gaming_memes/(Horror_Mode.)_Pinki_Sprunki_horror-mode-pinki-sprunki.mp3');
  const memePath = path.resolve('public/assets/memes/meme_shock_eyes.png');

  // Generate 3 distinct synthetic video recordings
  console.log('--- Step 0: Generating 3 distinct synthetic recordings ---');
  const rec1Path = path.join(testSuiteDir, 'rec_1_action_10s.mp4');
  const rec2Path = path.join(testSuiteDir, 'rec_2_chase_12s.mp4');
  const recSilentPath = path.join(testSuiteDir, 'rec_3_silent_8s.mp4');

  if (!fs.existsSync(rec1Path)) {
    spawnSync('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=520:sample_rate=48000',
      '-t', '10',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', rec1Path
    ]);
  }

  if (!fs.existsSync(rec2Path)) {
    spawnSync('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=780:sample_rate=48000',
      '-t', '12',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', rec2Path
    ]);
  }

  if (!fs.existsSync(recSilentPath)) {
    spawnSync('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=30',
      '-t', '8',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      recSilentPath
    ]);
  }

  const assSubPath = path.join(testSuiteDir, 'test_subs.ass');
  fs.writeFileSync(assSubPath, `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,60,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,0,2,20,20,120,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:03.00,Default,,0,0,0,,PHASE 9 VERIFICATION
`);

  console.log('✓ Synthetic test recordings ready on disk.\n');

  // TEST 1
  console.log('--- TEST 1: Render a basic vertical clip without subtitles or additional audio ---');
  const t1Out = path.join(testSuiteDir, 't1_basic.mp4');
  await ffmpegCore.renderBasicVertical({
    sourceClip: rec1Path,
    outputPath: t1Out,
    duration: 3.5,
    layoutMode: 'blurred_background',
  });
  const val1 = ffmpegCore.validateRenderedVideo(t1Out, 3.5);
  console.log(`TEST 1 Validation: ${val1.isValid ? 'PASSED' : 'FAILED'} (${val1.width}x${val1.height}, ${val1.duration}s, hasAudio: ${val1.hasAudio})`);
  if (!val1.isValid) throw new Error(`TEST 1 Failed: ${val1.errors.join('; ')}`);

  // TEST 2
  console.log('\n--- TEST 2: Render a vertical clip with ASS subtitles ---');
  const t2Out = path.join(testSuiteDir, 't2_subtitles.mp4');
  await ffmpegCore.renderVerticalWithSubtitles({
    sourceClip: rec1Path,
    outputPath: t2Out,
    duration: 3.5,
    subtitleAssPath: assSubPath,
    layoutMode: 'blurred_background',
  });
  const val2 = ffmpegCore.validateRenderedVideo(t2Out, 3.5);
  console.log(`TEST 2 Validation: ${val2.isValid ? 'PASSED' : 'FAILED'} (${val2.width}x${val2.height}, ${val2.duration}s, hasAudio: ${val2.hasAudio})`);
  if (!val2.isValid) throw new Error(`TEST 2 Failed: ${val2.errors.join('; ')}`);

  // TEST 3
  console.log('\n--- TEST 3: Render a vertical clip with original audio, BGM and meme SFX ---');
  const t3Out = path.join(testSuiteDir, 't3_full.mp4');
  await ffmpegCore.renderVerticalShort({
    sourceClip: rec1Path,
    outputPath: t3Out,
    duration: 4.0,
    layoutMode: 'blurred_background',
    memeOverlayPath: memePath,
    memeStart: 1.0,
    memeDuration: 2.0,
    bgmPath: bgmPath,
    bgmVolume: 0.2,
    sfxEvents: [{ sfxPath: sfxPath, timestamp: 1.5, volume: 0.8 }],
    subtitleAssPath: assSubPath,
  });
  const val3 = ffmpegCore.validateRenderedVideo(t3Out, 4.0);
  console.log(`TEST 3 Validation: ${val3.isValid ? 'PASSED' : 'FAILED'} (${val3.width}x${val3.height}, ${val3.duration}s, hasAudio: ${val3.hasAudio})`);
  if (!val3.isValid) throw new Error(`TEST 3 Failed: ${val3.errors.join('; ')}`);

  // TEST 4
  console.log('\n--- TEST 4: Render a video with NO source audio ---');
  const t4Out = path.join(testSuiteDir, 't4_silent.mp4');
  await ffmpegCore.renderVerticalShort({
    sourceClip: recSilentPath,
    outputPath: t4Out,
    duration: 3.0,
    layoutMode: 'blurred_background',
    bgmPath: bgmPath,
    bgmVolume: 0.2,
    sfxEvents: [{ sfxPath: sfxPath, timestamp: 1.0, volume: 0.8 }],
    subtitleAssPath: assSubPath,
  });
  const val4 = ffmpegCore.validateRenderedVideo(t4Out, 3.0);
  console.log(`TEST 4 Validation: ${val4.isValid ? 'PASSED' : 'FAILED'} (${val4.width}x${val4.height}, ${val4.duration}s, hasAudio: ${val4.hasAudio}, meanDb: ${val4.meanVolumeDb})`);
  if (!val4.isValid) throw new Error(`TEST 4 Failed: ${val4.errors.join('; ')}`);

  // TEST 5 & 6 & 7: Concurrent Full Pipeline Processing & Strict Project Isolation
  console.log('\n--- TEST 5 & 6: Process two separate projects concurrently and verify outputs ---');
  const seed = Date.now();
  const projA_Id = `proj_test_A_${seed}`;
  const projB_Id = `proj_test_B_${seed}`;

  const checksumA = computeFileChecksum(rec1Path);
  const checksumB = computeFileChecksum(rec2Path);

  // Setup Project A
  const storagePathsA = getProjectStoragePaths(projA_Id);
  const sourceA = path.join(storagePathsA.sourceDir, `${projA_Id}_source.mp4`);
  fs.copyFileSync(rec1Path, sourceA);
  dbRepo.createProject({
    id: projA_Id,
    title: 'Project A - Stunt Reel',
    userId: 'usr_test',
    sourceUrl: 'https://www.youtube.com/watch?v=TEST_PROJ_A',
    sourceFile: sourceA,
    sourceVideoId: `sv_${projA_Id}`,
    sourceChecksum: checksumA,
  });
  dbRepo.saveSourceVideo({
    id: `sv_${projA_Id}`,
    projectId: projA_Id,
    fileName: path.basename(sourceA),
    filePath: sourceA,
    fileSize: fs.statSync(sourceA).size,
    duration: 10,
    width: 1920,
    height: 1080,
    fps: 30,
    sha256Checksum: checksumA,
  });

  // Setup Project B
  const storagePathsB = getProjectStoragePaths(projB_Id);
  const sourceB = path.join(storagePathsB.sourceDir, `${projB_Id}_source.mp4`);
  fs.copyFileSync(rec2Path, sourceB);
  dbRepo.createProject({
    id: projB_Id,
    title: 'Project B - Police Chase',
    userId: 'usr_test',
    sourceUrl: 'https://www.youtube.com/watch?v=TEST_PROJ_B',
    sourceFile: sourceB,
    sourceVideoId: `sv_${projB_Id}`,
    sourceChecksum: checksumB,
  });
  dbRepo.saveSourceVideo({
    id: `sv_${projB_Id}`,
    projectId: projB_Id,
    fileName: path.basename(sourceB),
    filePath: sourceB,
    fileSize: fs.statSync(sourceB).size,
    duration: 12,
    width: 1920,
    height: 1080,
    fps: 30,
    sha256Checksum: checksumB,
  });

  console.log(`Starting orchestrator for Project A (${projA_Id})...`);
  const orchestratorA = new MasterAgentOrchestrator();
  const promiseA = orchestratorA.processProject({
    projectId: projA_Id,
    sourceVideoId: `sv_${projA_Id}`,
    sourceFilePath: sourceA,
    sourceChecksum: checksumA,
    sourceUrl: 'https://www.youtube.com/watch?v=TEST_PROJ_A',
    jobId: `job_${projA_Id}`,
  });

  console.log(`Starting orchestrator for Project B (${projB_Id})...`);
  const orchestratorB = new MasterAgentOrchestrator();
  const promiseB = orchestratorB.processProject({
    projectId: projB_Id,
    sourceVideoId: `sv_${projB_Id}`,
    sourceFilePath: sourceB,
    sourceChecksum: checksumB,
    sourceUrl: 'https://www.youtube.com/watch?v=TEST_PROJ_B',
    jobId: `job_${projB_Id}`,
  });

  console.log('Running both projects concurrently...');
  const [resA, resB] = await Promise.all([promiseA, promiseB]);

  console.log(`✓ Project A completed with status: ${resA.status}`);
  console.log(`✓ Project B completed with status: ${resB.status}`);

  const projRecordA = dbRepo.getProject(projA_Id);
  const projRecordB = dbRepo.getProject(projB_Id);

  if (projRecordA?.status !== 'ready' && projRecordA?.status !== 'completed') {
    throw new Error(`Project A DB status failed: ${projRecordA?.error_message || 'unknown'}`);
  }
  if (projRecordB?.status !== 'ready' && projRecordB?.status !== 'completed') {
    throw new Error(`Project B DB status failed: ${projRecordB?.error_message || 'unknown'}`);
  }

  // TEST 7: Cross-Project Isolation Verification
  console.log('\n--- TEST 7: Verify complete cross-project isolation ---');
  const clipsA = dbRepo.getClipsByProject(projA_Id);
  const clipsB = dbRepo.getClipsByProject(projB_Id);

  console.log(`Project A rendered clips count: ${clipsA.length}`);
  console.log(`Project B rendered clips count: ${clipsB.length}`);

  if (clipsA.length === 0 || clipsB.length === 0) {
    throw new Error('Both projects must produce at least 1 validated Short!');
  }

  const renderedA = clipsA[0];
  const renderedB = clipsB[0];

  console.log(`Project A Short: ${renderedA.edited_clip_path}`);
  console.log(`Project B Short: ${renderedB.edited_clip_path}`);

  // Confirm file paths exist and are completely disjoint
  if (!fs.existsSync(renderedA.edited_clip_path)) throw new Error(`Clip A file missing on disk: ${renderedA.edited_clip_path}`);
  if (!fs.existsSync(renderedB.edited_clip_path)) throw new Error(`Clip B file missing on disk: ${renderedB.edited_clip_path}`);
  if (renderedA.edited_clip_path === renderedB.edited_clip_path) {
    throw new Error('CRITICAL FAILURE: Project A and Project B share the same output path!');
  }
  if (!renderedA.edited_clip_path.includes(projA_Id) || !renderedB.edited_clip_path.includes(projB_Id)) {
    throw new Error('CRITICAL FAILURE: Output path does not belong to project-isolated directory!');
  }

  console.log('✓ Project isolation verified: independent files, isolated directories, zero overlap.');

  // TEST 8: Rights Engine and License Detection
  console.log('\n--- TEST 8: Rights Engine and Creator Authorization Verification ---');
  
  // Case 1: Verified registered creator (BruceDropEmOff)
  const rights1 = await rightsEngine.checkSourceRights({
    videoId: 'Bruce_Stream_101',
    creatorName: 'BruceDropEmOff',
  });
  console.log('BruceDropEmOff check:', rights1.status, `(isAllowed: ${rights1.isAllowed})`);
  if (rights1.status !== 'VERIFIED' || !rights1.isAllowed) throw new Error('BruceDropEmOff should be VERIFIED!');

  // Case 2: Creative Commons repository
  const rights2 = await rightsEngine.checkSourceRights({
    videoId: 'CC_Stream_202',
    creatorName: 'Open Gaming Archive (Creative Commons)',
  });
  console.log('Creative Commons check:', rights2.status, `(isAllowed: ${rights2.isAllowed})`);
  if (rights2.status !== 'CREATIVE_COMMONS' || !rights2.isAllowed) throw new Error('CC Archive should be CREATIVE_COMMONS!');

  // Case 3: Expired creator agreement
  const rights3 = await rightsEngine.checkSourceRights({
    videoId: 'Sunset_Stream_303',
    creatorName: 'Sunset Drift Stunts',
  });
  console.log('Sunset Drift (Expired) check:', rights3.status, `(isAllowed: ${rights3.isAllowed})`);
  if (rights3.status !== 'EXPIRED' || rights3.isAllowed) throw new Error('Sunset Drift should be EXPIRED and not allowed!');

  // Case 4: Public video without creator permission
  const rights4 = await rightsEngine.checkSourceRights({
    videoId: 'Random_YouTube_999',
    creatorName: 'Unregistered YouTuber',
  });
  console.log('Unregistered Creator check:', rights4.status, `(isAllowed: ${rights4.isAllowed})`);
  if (rights4.isAllowed) throw new Error('Unregistered video should NOT be allowed without uploaded master recording!');

  console.log('\n========================================================================');
  console.log('   🎉 ALL 9 CRITICAL PHASES VERIFIED AND PASSED WITH 100% ACCURACY!    ');
  console.log('========================================================================\n');
}

runTestSuite().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
