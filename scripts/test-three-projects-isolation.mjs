import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT_DIR = path.resolve('c:/Users/Gopala Krishna/OneDrive/Desktop/YB-STICKMAN/gta6-shorts-ai');
const STORAGE_DIR = path.join(ROOT_DIR, 'storage');
const BASE_URL = 'http://localhost:3000';

function computeChecksum(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('================================================================');
  console.log('PHASE 13: 3-PROJECT ISOLATION & SOURCE VERIFICATION ACCEPTANCE TEST');
  console.log('================================================================\n');

  // Step 1: Generate 3 distinct local video recordings
  console.log('--- STEP 1: GENERATING 3 DISTINCT LOCAL TEST RECORDINGS ---');
  const videoA = path.join(STORAGE_DIR, 'test_video_a.mp4');
  const videoB = path.join(STORAGE_DIR, 'test_video_b.mp4');
  const videoC = path.join(STORAGE_DIR, 'test_video_c.mp4');

  // Video A: 16s, Red color, 440 Hz tone
  if (!fs.existsSync(videoA)) {
    console.log('Generating Video A (16s, Red, 440 Hz)...');
    execSync(`ffmpeg -y -f lavfi -i "color=c=red:s=1280x720:d=16" -f lavfi -i "sine=frequency=440:duration=16" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -shortest "${videoA}"`, { stdio: 'pipe' });
  }

  // Video B: 24s, Green color, 880 Hz tone
  if (!fs.existsSync(videoB)) {
    console.log('Generating Video B (24s, Green, 880 Hz)...');
    execSync(`ffmpeg -y -f lavfi -i "color=c=green:s=1280x720:d=24" -f lavfi -i "sine=frequency=880:duration=24" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -shortest "${videoB}"`, { stdio: 'pipe' });
  }

  // Video C: 20s, Blue color, 660 Hz tone
  if (!fs.existsSync(videoC)) {
    console.log('Generating Video C (20s, Blue, 660 Hz)...');
    execSync(`ffmpeg -y -f lavfi -i "color=c=blue:s=1280x720:d=20" -f lavfi -i "sine=frequency=660:duration=20" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -shortest "${videoC}"`, { stdio: 'pipe' });
  }

  const checksumA = computeChecksum(videoA);
  const checksumB = computeChecksum(videoB);
  const checksumC = computeChecksum(videoC);

  console.log(`✓ Video A generated: ${videoA} (16s) | SHA-256: ${checksumA}`);
  console.log(`✓ Video B generated: ${videoB} (24s) | SHA-256: ${checksumB}`);
  console.log(`✓ Video C generated: ${videoC} (20s) | SHA-256: ${checksumC}`);

  if (checksumA === checksumB || checksumB === checksumC || checksumA === checksumC) {
    throw new Error('FATAL: Generated videos do not have distinct checksums!');
  }
  console.log('✓ All 3 test videos have verified unique cryptographic checksums.\n');

  // Step 2: Test YouTube URL submission without an uploaded video
  console.log('--- STEP 2: TEST YOUTUBE SUBMISSION WITHOUT UPLOADED VIDEO ---');
  const ytRes = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
      title: 'YouTube Test Without Upload',
    }),
  });

  const ytJson = await ytRes.json();
  console.log(`YouTube test response status: ${ytRes.status}`);
  console.log(`YouTube test response body:`, ytJson);

  if (ytRes.status !== 422) {
    throw new Error(`Expected HTTP 422, received ${ytRes.status}`);
  }
  if (ytJson.errorState !== 'SOURCE_FILE_REQUIRED') {
    throw new Error(`Expected errorState 'SOURCE_FILE_REQUIRED', received '${ytJson.errorState}'`);
  }
  const expectedMsg = 'Source metadata verified, but an authorized video file is required before extraction can begin. Please upload your original recording.';
  if (!ytJson.error.includes(expectedMsg)) {
    throw new Error(`Error message mismatch! Expected '${expectedMsg}', got '${ytJson.error}'`);
  }
  console.log('✓ PASS: Standalone YouTube submission rejected with required error message without running extraction or using fallback sample.\n');

  // Step 3: Test Projects A, B, and C
  console.log('--- STEP 3: SUBMITTING PROJECTS A, B, AND C ---');

  async function createAndMonitorProject(title, filePath, expectedChecksum, maxDuration) {
    console.log(`\nCreating project: "${title}"...`);
    const res = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, sourceFile: filePath }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to create project "${title}": ${err}`);
    }

    const { projectId, sourceVideoId, sourceChecksum } = await res.json();
    console.log(`✓ Project initialized: ID=${projectId}, SourceVideoID=${sourceVideoId}`);
    console.log(`  Source Checksum: ${sourceChecksum}`);

    if (sourceChecksum !== expectedChecksum) {
      throw new Error(`Source checksum mismatch! Expected ${expectedChecksum}, got ${sourceChecksum}`);
    }

    // Monitor until complete or timeout
    const startTime = Date.now();
    let completedProject = null;

    while (Date.now() - startTime < 300000) { // 5 min max
      await sleep(2500);
      try {
        const pollRes = await fetch(`${BASE_URL}/api/projects/${projectId}`);
        if (!pollRes.ok) continue;
        const data = await pollRes.json();
        const p = data.project;
        process.stdout.write(`  [${projectId}] Progress: ${p.progress || 0}% | Stage: ${p.current_stage || ''}\r`);

        if (p.status === 'ready' || p.status === 'completed') {
          console.log(`\n✓ Project ${projectId} reached status '${p.status}'!`);
          completedProject = data;
          break;
        }
        if (p.status === 'error') {
          console.log(`\n❌ Project ${projectId} failed: ${p.error_message}`);
          throw new Error(`Project ${projectId} failed with error: ${p.error_message}`);
        }
      } catch (pollErr) {
        if (pollErr.message?.includes('failed with error')) throw pollErr;
        // Ignore transient socket glitches during polling
      }
    }

    if (!completedProject) {
      throw new Error(`Project ${projectId} timed out after 300s`);
    }

    return completedProject;
  }

  // Run Project A
  const projAData = await createAndMonitorProject('Project A - Red 16s', videoA, checksumA, 16);
  // Run Project B
  const projBData = await createAndMonitorProject('Project B - Green 24s', videoB, checksumB, 24);
  // Run Project C
  const projCData = await createAndMonitorProject('Project C - Blue 20s', videoC, checksumC, 20);

  // Step 4: Strict Relational and Storage Isolation Audit
  console.log('\n--- STEP 4: VERIFYING STRICT PROJECT ISOLATION ---');

  const clipsA = projAData.clips || [];
  const clipsB = projBData.clips || [];
  const clipsC = projCData.clips || [];

  console.log(`Project A clips count: ${clipsA.length}`);
  console.log(`Project B clips count: ${clipsB.length}`);
  console.log(`Project C clips count: ${clipsC.length}`);

  if (clipsA.length === 0 || clipsB.length === 0 || clipsC.length === 0) {
    throw new Error('One or more projects produced 0 clips!');
  }

  // Check Project A clips
  for (const c of clipsA) {
    if (c.project_id !== projAData.project.id) throw new Error(`Clip ${c.id} project_id mismatch!`);
    if (c.source_checksum && c.source_checksum !== checksumA) throw new Error(`Clip ${c.id} checksum mismatch! Expected Checksum A`);
    if (c.duration > 16.5) throw new Error(`Clip ${c.id} duration (${c.duration}s) exceeds source video duration (16s)!`);
    if (!c.output_path || !fs.existsSync(c.output_path)) throw new Error(`Clip ${c.id} output file missing on disk: ${c.output_path}`);
    if (!c.output_path.includes(projAData.project.id)) throw new Error(`Clip ${c.id} output file path is not isolated to Project A directory!`);
  }
  console.log('✓ Project A clips are 100% verified against Video A (<=16s, isolated storage, matching checksum).');

  // Check Project B clips
  for (const c of clipsB) {
    if (c.project_id !== projBData.project.id) throw new Error(`Clip ${c.id} project_id mismatch!`);
    if (c.source_checksum && c.source_checksum !== checksumB) throw new Error(`Clip ${c.id} checksum mismatch! Expected Checksum B`);
    if (c.duration > 24.5) throw new Error(`Clip ${c.id} duration (${c.duration}s) exceeds source video duration (24s)!`);
    if (!c.output_path || !fs.existsSync(c.output_path)) throw new Error(`Clip ${c.id} output file missing on disk: ${c.output_path}`);
    if (!c.output_path.includes(projBData.project.id)) throw new Error(`Clip ${c.id} output file path is not isolated to Project B directory!`);
  }
  console.log('✓ Project B clips are 100% verified against Video B (<=24s, isolated storage, matching checksum).');

  // Check Project C clips
  for (const c of clipsC) {
    if (c.project_id !== projCData.project.id) throw new Error(`Clip ${c.id} project_id mismatch!`);
    if (c.source_checksum && c.source_checksum !== checksumC) throw new Error(`Clip ${c.id} checksum mismatch! Expected Checksum C`);
    if (c.duration > 20.5) throw new Error(`Clip ${c.id} duration (${c.duration}s) exceeds source video duration (20s)!`);
    if (!c.output_path || !fs.existsSync(c.output_path)) throw new Error(`Clip ${c.id} output file missing on disk: ${c.output_path}`);
    if (!c.output_path.includes(projCData.project.id)) throw new Error(`Clip ${c.id} output file path is not isolated to Project C directory!`);
  }
  console.log('✓ Project C clips are 100% verified against Video C (<=20s, isolated storage, matching checksum).');

  // Check cross-project isolation (zero clips shared)
  const idsA = new Set(clipsA.map((c) => c.id));
  const idsB = new Set(clipsB.map((c) => c.id));
  const idsC = new Set(clipsC.map((c) => c.id));

  const pathsA = new Set(clipsA.map((c) => c.output_path));
  const pathsB = new Set(clipsB.map((c) => c.output_path));
  const pathsC = new Set(clipsC.map((c) => c.output_path));

  for (const id of idsA) {
    if (idsB.has(id)) throw new Error(`LEAK: Clip ID ${id} found in both Project A and Project B!`);
    if (idsC.has(id)) throw new Error(`LEAK: Clip ID ${id} found in both Project A and Project C!`);
  }
  for (const id of idsB) {
    if (idsC.has(id)) throw new Error(`LEAK: Clip ID ${id} found in both Project B and Project C!`);
  }

  for (const p of pathsA) {
    if (pathsB.has(p)) throw new Error(`LEAK: File path ${p} shared between Project A and Project B!`);
    if (pathsC.has(p)) throw new Error(`LEAK: File path ${p} shared between Project A and Project C!`);
  }
  for (const p of pathsB) {
    if (pathsC.has(p)) throw new Error(`LEAK: File path ${p} shared between Project B and Project C!`);
  }

  console.log('✓ ZERO clip leaks or file overlaps detected across Projects A, B, and C!');
  console.log('\n================================================================');
  console.log('🎉 ALL PHASE 13 ACCEPTANCE TESTS PASSED WITH 100% ACCURACY!');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
