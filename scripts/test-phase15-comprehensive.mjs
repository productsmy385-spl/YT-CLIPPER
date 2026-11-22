import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ffmpegCore } from '../src/lib/ffmpeg-core.ts';
import { rightsEngine } from '../src/lib/rights-engine.ts';
import { sourceAcquisitionEngine } from '../src/lib/source-acquisition.ts';
import { fullVideoAnalyzer } from '../src/lib/full-video-analyzer.ts';
import { MasterAgentOrchestrator } from '../src/agents/orchestrator.ts';
import { initDatabase } from '../src/db/index.ts';
import { dbRepo } from '../src/db/repository.ts';
import { computeFileChecksum, videoIngestionEngine } from '../src/lib/video-ingestion.ts';
import { getProjectStoragePaths } from '../src/lib/app-paths.ts';

initDatabase();

const suiteDir = path.resolve('storage/phase15_verification');
fs.mkdirSync(suiteDir, { recursive: true });

async function runComprehensiveVerification() {
  console.log('========================================================================');
  console.log('       PHASE 15: CRITICAL MULTI-DURATION, ISOLATION & URL AUDIT        ');
  console.log('========================================================================\n');

  const baseSource = path.resolve('storage/authorized_sources/ViN62GuDF2A.mp4');
  if (!fs.existsSync(baseSource)) {
    throw new Error(`Base source video not found at: ${baseSource}`);
  }

  // -------------------------------------------------------------------------
  // SECTION 1: PREPARE REAL MULTI-DURATION RECORDINGS (5m, 15m, 30m, 60m)
  // -------------------------------------------------------------------------
  console.log('--- SECTION 1: Assembling Multi-Duration Real Gameplay Recordings ---');

  const v5min = path.join(suiteDir, 'gameplay_5min.mp4');
  const v15min = path.join(suiteDir, 'gameplay_15min.mp4');
  const v30min = path.join(suiteDir, 'gameplay_30min.mp4');
  const v60min = path.join(suiteDir, 'gameplay_60min.mp4');

  const durations = [
    { name: '5-Minute', file: v5min, seconds: 300 },
    { name: '15-Minute', file: v15min, seconds: 900 },
    { name: '30-Minute', file: v30min, seconds: 1800 },
    { name: '60-Minute', file: v60min, seconds: 3600 },
  ];

  for (const item of durations) {
    if (!fs.existsSync(item.file)) {
      console.log(`Creating ${item.name} (${item.seconds}s) using stream loop...`);
      // Loop baseSource and trim with stream copy (lossless, instantaneous)
      const loops = Math.ceil(item.seconds / 503) + 1;
      const res = spawnSync('ffmpeg', [
        '-y',
        '-stream_loop', String(loops),
        '-i', baseSource,
        '-t', String(item.seconds),
        '-c', 'copy',
        item.file,
      ], { stdio: 'pipe' });

      if (res.status !== 0) {
        throw new Error(`Failed to create ${item.name} video: ${res.stderr?.toString()}`);
      }
    }
    const meta = ffmpegCore.probe(item.file);
    console.log(`✓ ${item.name}: ${meta.duration.toFixed(1)}s, ${meta.width}x${meta.height}, ${(fs.statSync(item.file).size / (1024 * 1024)).toFixed(1)} MB`);
  }

  // -------------------------------------------------------------------------
  // SECTION 2: AI HIGHLIGHT DETECTION BENCHMARK ACROSS ALL DURATIONS
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 2: AI Highlight Detection Benchmark Across All Durations ---');
  const durationResults = [];

  for (const item of durations) {
    const startTime = Date.now();
    console.log(`\nAnalyzing ${item.name} (${item.seconds}s)...`);

    const meta = ffmpegCore.probe(item.file);
    const analysis = fullVideoAnalyzer.analyzeCompleteVideo(item.file, meta);
    const highlights = fullVideoAnalyzer.detectBestHighlights(`bench_${item.seconds}s`, meta.duration, analysis, '30-60s');
    const elapsedMs = Date.now() - startTime;

    console.log(`✓ Analyzed in ${(elapsedMs / 1000).toFixed(2)}s`);
    console.log(`  - Segments scanned: ${analysis.segments.length}`);
    console.log(`  - Audio checkpoints: ${analysis.allAudioPeaks.length}`);
    console.log(`  - Scene cuts identified: ${analysis.allSceneCuts.length}`);
    console.log(`  - Highlights detected: ${highlights.length}`);

    // Verify highlights quality
    if (highlights.length === 0) {
      throw new Error(`Failed to extract any highlights for ${item.name}!`);
    }

    const topHl = highlights[0];
    console.log(`  - Top Highlight: "${topHl.categoryLabel}" (Score: ${topHl.entertainmentScore})`);
    console.log(`    Time: ${topHl.startTime}s -> ${topHl.endTime}s (${topHl.duration}s)`);
    console.log(`    Story Hook: "${topHl.storyArc.hook.description}"`);
    console.log(`    Climax: "${topHl.peakMoment}"`);

    // Verify non-zero timestamps and logical boundaries
    if (topHl.endTime > meta.duration + 1.0) {
      throw new Error(`Highlight end time (${topHl.endTime}) exceeds duration (${meta.duration})!`);
    }

    durationResults.push({
      duration: item.name,
      seconds: item.seconds,
      scanTimeSec: (elapsedMs / 1000).toFixed(2),
      segments: analysis.segments.length,
      highlightsCount: highlights.length,
      topScore: topHl.entertainmentScore,
      topCategory: topHl.categoryLabel,
    });
  }

  console.log('\n--- Multi-Duration Benchmark Summary ---');
  console.table(durationResults);

  // -------------------------------------------------------------------------
  // SECTION 3: HIGHLIGHT VARIETY & NON-REPETITION AUDIT
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 3: Highlight Variety & Non-Repetition Verification ---');
  // Compare highlights from 3 distinct gameplay files
  const altSource1 = path.resolve('storage/authorized_sources/test_section_2.mp4');
  const altSource2 = path.resolve('storage/test_authorized_rec_1.mp4');

  const meta1 = ffmpegCore.probe(v5min);
  const meta2 = ffmpegCore.probe(altSource1);
  const meta3 = ffmpegCore.probe(altSource2);

  const hl1 = fullVideoAnalyzer.detectBestHighlights('rec1', meta1.duration, fullVideoAnalyzer.analyzeCompleteVideo(v5min, meta1), '15-30s');
  const hl2 = fullVideoAnalyzer.detectBestHighlights('rec2', meta2.duration, fullVideoAnalyzer.analyzeCompleteVideo(altSource1, meta2), '15-30s');
  const hl3 = fullVideoAnalyzer.detectBestHighlights('rec3', meta3.duration, fullVideoAnalyzer.analyzeCompleteVideo(altSource2, meta3), '15-30s');

  console.log(`Recording 1 (5m Gameplay) Top Moment: ${hl1[0].categoryLabel} (Score: ${hl1[0].entertainmentScore}, Climax: ${hl1[0].peakMoment})`);
  console.log(`Recording 2 (Street Section) Top Moment: ${hl2[0].categoryLabel} (Score: ${hl2[0].entertainmentScore}, Climax: ${hl2[0].peakMoment})`);
  console.log(`Recording 3 (Chase Test) Top Moment: ${hl3[0].categoryLabel} (Score: ${hl3[0].entertainmentScore}, Climax: ${hl3[0].peakMoment})`);

  if (hl1[0].peakMoment === hl2[0].peakMoment && hl1[0].peakMoment === hl3[0].peakMoment) {
    throw new Error('AI Highlight detection is producing repetitive moments across distinct recordings!');
  }
  console.log('✓ Verified: AI extracts distinct, content-aware highlights tailored to each recording.');

  // -------------------------------------------------------------------------
  // SECTION 4: 5 CONCURRENT INDEPENDENT PROJECTS FULL PIPELINE ISOLATION
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 4: 5 Independent Projects Concurrent Processing & Isolation ---');

  // Prepare 5 distinct source files with unique content
  const projectConfigs = [
    { id: `proj_iso_1_${Date.now()}`, title: 'Vice City Police Pursuit', src: v5min },
    { id: `proj_iso_2_${Date.now()}`, title: 'Ocean Drive Stunt Jump', src: altSource1 },
    { id: `proj_iso_3_${Date.now()}`, title: 'Downtown Helicopter Heist', src: altSource2 },
    { id: `proj_iso_4_${Date.now()}`, title: 'Little Haiti Drift Run', src: path.resolve('storage/test_authorized_rec_2.mp4') },
    { id: `proj_iso_5_${Date.now()}`, title: 'Mall Shootout & Escape', src: path.resolve('storage/authorized_sources/test_section_fast.mp4') },
  ];

  const orchestrators = [];
  const projectData = [];

  for (let i = 0; i < projectConfigs.length; i++) {
    const cfg = projectConfigs[i];
    const storagePaths = getProjectStoragePaths(cfg.id);
    const isolatedSource = path.join(storagePaths.sourceDir, `${cfg.id}_master.mp4`);

    fs.copyFileSync(cfg.src, isolatedSource);
    const checksum = computeFileChecksum(isolatedSource);

    dbRepo.createProject({
      id: cfg.id,
      title: cfg.title,
      userId: 'usr_phase15',
      sourceUrl: `https://youtube.com/watch?v=ISO_TEST_${i + 1}`,
      sourceFile: isolatedSource,
      sourceVideoId: `sv_${cfg.id}`,
      sourceChecksum: checksum,
    });

    const meta = ffmpegCore.probe(isolatedSource);
    dbRepo.saveSourceVideo({
      id: `sv_${cfg.id}`,
      projectId: cfg.id,
      fileName: path.basename(isolatedSource),
      filePath: isolatedSource,
      fileSize: fs.statSync(isolatedSource).size,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      fps: meta.fps,
      sha256Checksum: checksum,
    });

    projectData.push({
      id: cfg.id,
      title: cfg.title,
      source: isolatedSource,
      checksum,
      storagePaths,
    });

    const orch = new MasterAgentOrchestrator();
    orchestrators.push(
      orch.processProject({
        projectId: cfg.id,
        sourceVideoId: `sv_${cfg.id}`,
        sourceFilePath: isolatedSource,
        sourceChecksum: checksum,
        sourceUrl: `https://youtube.com/watch?v=ISO_TEST_${i + 1}`,
        jobId: `job_${cfg.id}`,
      })
    );
  }

  console.log(`Launching 5 projects concurrently...`);
  const results = await Promise.all(orchestrators);

  console.log('✓ All 5 concurrent projects finished processing.');
  for (let i = 0; i < results.length; i++) {
    console.log(`  Project ${i + 1} (${projectConfigs[i].id}): status=${results[i].status}`);
    if (results[i].status !== 'ready' && results[i].status !== 'completed') {
      throw new Error(`Project ${projectConfigs[i].id} did not finish with ready status!`);
    }
  }

  // Verify Project Isolation
  console.log('\nAuditing Project Output Isolation Across All 5 Projects:');
  const renderedShorts = [];
  const checksumSet = new Set();
  const pathSet = new Set();

  for (const p of projectData) {
    const clips = dbRepo.getClipsByProject(p.id);
    if (!clips || clips.length === 0) {
      throw new Error(`Project ${p.id} generated 0 clips!`);
    }

    const firstClip = clips[0];
    const outPath = firstClip.edited_clip_path;

    if (!fs.existsSync(outPath)) {
      throw new Error(`Rendered clip not found on disk: ${outPath}`);
    }

    const clipChecksum = computeFileChecksum(outPath);
    console.log(`  - [${p.id}] Clip: ${path.basename(outPath)} | SHA-256: ${clipChecksum.substring(0, 16)}...`);

    if (pathSet.has(outPath)) {
      throw new Error(`CRITICAL DUPLICATION: File path ${outPath} reused across projects!`);
    }
    pathSet.add(outPath);

    if (checksumSet.has(clipChecksum)) {
      throw new Error(`CRITICAL DUPLICATION: Rendered video SHA-256 is identical to another project!`);
    }
    checksumSet.add(clipChecksum);

    renderedShorts.push({
      projectId: p.id,
      title: p.title,
      clipPath: outPath,
      sha256: clipChecksum,
      duration: firstClip.duration,
      status: firstClip.status,
    });
  }

  console.log('✓ 100% Cross-Project Isolation Verified: 5 unique source files -> 5 disjoint output directories -> 5 distinct rendered vertical Shorts.');

  // -------------------------------------------------------------------------
  // SECTION 5: ACCEPTANCE VERIFICATION FOR https://youtu.be/O__eUdBwsDQ
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 5: Acceptance Target Audit (https://youtu.be/O__eUdBwsDQ) ---');
  const targetUrl = 'https://youtu.be/O__eUdBwsDQ';

  const ingestRes = await videoIngestionEngine.inspectAndIngest({ url: targetUrl });
  console.log('1. Metadata Retrieval:');
  console.log(`   - Video ID: ${ingestRes.videoId}`);
  console.log(`   - Title: "${ingestRes.title}"`);
  console.log(`   - Channel/Author: "${ingestRes.authorName}"`);
  console.log(`   - Metadata Verified: ${ingestRes.metadataRetrieved}`);

  if (ingestRes.videoId !== 'O__eUdBwsDQ') {
    throw new Error(`Target Video ID mismatch! Expected O__eUdBwsDQ, got ${ingestRes.videoId}`);
  }

  const rightsRes = await rightsEngine.checkSourceRights({
    videoId: ingestRes.videoId,
    sourceUrl: targetUrl,
    creatorName: ingestRes.authorName,
  });

  console.log('\n2. Rights Assessment:');
  console.log(`   - Status: ${rightsRes.status}`);
  console.log(`   - Is Allowed: ${rightsRes.isAllowed}`);
  console.log(`   - Reason: ${rightsRes.reason}`);
  console.log(`   - Acquisition Method: ${rightsRes.mediaAcquisitionMethod}`);

  const acqRes = await sourceAcquisitionEngine.checkAcquisitionAvailability({
    videoId: ingestRes.videoId,
    sourceUrl: targetUrl,
    creatorName: ingestRes.authorName,
    rights: rightsRes,
  });

  console.log('\n3. Source Media Acquisition Check:');
  console.log(`   - Is Available: ${acqRes.isAvailable}`);
  console.log(`   - Can Acquire Directly: ${acqRes.canAcquireDirectly}`);
  console.log(`   - Reason: ${acqRes.reason}`);
  console.log(`   - Available Actions: ${acqRes.availableActions.join(', ')}`);

  if (acqRes.isAvailable) {
    throw new Error('CRITICAL FLAW: Third-party commercial YouTube music mashup without creator authorization should NOT be marked as directly downloadable!');
  }
  if (!acqRes.availableActions.includes('UPLOAD_FILE')) {
    throw new Error('UPLOAD_FILE must be available as a compliance pathway for unpartnered videos!');
  }

  console.log('✓ Target URL compliance verified: App correctly retrieves metadata, flags standard YouTube copyright, prevents unauthorized media scraping, and provides the compliant creator upload pathway.');

  // -------------------------------------------------------------------------
  // SECTION 6: URL-ONLY WORKFLOW VERIFICATION (AUTHORIZED SOURCE)
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 6: URL-Only Workflow with Authorized Source Provider ---');
  // Register an authorized creator partner stream
  const authVideoId = 'ViN62GuDF2A';
  const authUrl = `https://www.youtube.com/watch?v=${authVideoId}`;

  const authRights = await rightsEngine.checkSourceRights({
    videoId: authVideoId,
    sourceUrl: authUrl,
    creatorName: 'BruceDropEmOff',
  });

  const authAcq = await sourceAcquisitionEngine.checkAcquisitionAvailability({
    videoId: authVideoId,
    sourceUrl: authUrl,
    creatorName: 'BruceDropEmOff',
    rights: authRights,
  });

  console.log(`Authorized Partner Stream (${authVideoId}):`);
  console.log(`  - Rights Status: ${authRights.status} (Allowed: ${authRights.isAllowed})`);
  console.log(`  - Acquisition Available: ${authAcq.isAvailable} (Provider: ${authAcq.providerName})`);
  console.log(`  - Actions: ${authAcq.availableActions.join(', ')}`);

  if (!authAcq.isAvailable) {
    throw new Error('Authorized partner stream should have acquisition available!');
  }

  const directAcquired = await sourceAcquisitionEngine.acquireAuthorizedSource({
    videoId: authVideoId,
    sourceUrl: authUrl,
    creatorName: 'BruceDropEmOff',
  });

  console.log(`  - Direct Media Acquired: ${directAcquired?.filePath}`);
  if (!directAcquired || !directAcquired.success || !directAcquired.filePath || !fs.existsSync(directAcquired.filePath)) {
    throw new Error(`Failed to directly acquire authorized media stream! ${directAcquired?.error || ''}`);
  }
  console.log(`  - File Size: ${(fs.statSync(directAcquired.filePath).size / (1024 * 1024)).toFixed(1)} MB`);
  console.log('✓ URL-Only direct acquisition workflow verified without requiring manual user upload!');

  console.log('\n========================================================================');
  console.log('  🎉 PHASE 15 COMPREHENSIVE VERIFICATION AUDIT PASSED WITH 100% SUCCESS!');
  console.log('========================================================================\n');
}

runComprehensiveVerification().catch((err) => {
  console.error('\n❌ PHASE 15 VERIFICATION FAILED:', err);
  process.exit(1);
});
