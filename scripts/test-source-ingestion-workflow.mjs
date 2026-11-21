import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const BASE_URL = 'http://localhost:3000';
const STORAGE_DIR = path.resolve('storage');

function computeSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('================================================================');
  console.log('SOURCE INGESTION WORKFLOW & DUAL-SOURCE VERIFICATION TEST');
  console.log('================================================================\n');

  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }

  // STEP 1: Generate 2 Distinct Authorized Test Recordings
  console.log('--- STEP 1: GENERATING 2 DISTINCT AUTHORIZED RECORDINGS ---');
  const runSeed = Date.now();
  const freq1 = 510 + (runSeed % 70);
  const freq2 = 730 + (runSeed % 70);
  const rec1Path = path.resolve(STORAGE_DIR, `test_authorized_rec_1_${runSeed}.mp4`);
  const rec2Path = path.resolve(STORAGE_DIR, `test_authorized_rec_2_${runSeed}.mp4`);

  // Video 1: 15 seconds, orange (#FF7700), unique freq tone
  console.log(`Generating Video 1 (15s, orange, ${freq1}Hz)...`);
  spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f', 'lavfi', '-i', 'color=c=0xFF7700:s=1280x720:d=15:r=25',
      '-f', 'lavfi', '-i', `sine=frequency=${freq1}:duration=15`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      rec1Path,
    ],
    { stdio: 'ignore' }
  );

  // Video 2: 22 seconds, purple (#7700FF), unique freq tone
  console.log(`Generating Video 2 (22s, purple, ${freq2}Hz)...`);
  spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f', 'lavfi', '-i', 'color=c=0x7700FF:s=1280x720:d=22:r=25',
      '-f', 'lavfi', '-i', `sine=frequency=${freq2}:duration=22`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      rec2Path,
    ],
    { stdio: 'ignore' }
  );

  const checksum1 = computeSha256(rec1Path);
  const checksum2 = computeSha256(rec2Path);

  console.log(`✓ Recording 1 generated: ${rec1Path} (15s) | SHA-256: ${checksum1}`);
  console.log(`✓ Recording 2 generated: ${rec2Path} (22s) | SHA-256: ${checksum2}`);

  if (checksum1 === checksum2) {
    throw new Error('Cryptographic failure: Checksum 1 and 2 must be different!');
  }
  console.log('✓ Cryptographic uniqueness verified.\n');

  // STEP 2: Test YouTube URL Inspection with Ingest Endpoint
  console.log('--- STEP 2: TEST YOUTUBE URL INSPECTION & COMPLIANCE ---');
  const ytUrl1 = 'https://www.youtube.com/watch?v=k1Bwg9m9S9A'; // Kai Cenat
  const ingestRes = await fetch(`${BASE_URL}/api/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: ytUrl1 }),
  });

  const ingestData = await ingestRes.json();
  console.log(`YouTube Ingest Status: ${ingestRes.status}`);
  console.log(`Verified Title: "${ingestData.sourceInfo?.title}"`);
  console.log(`Video ID: "${ingestData.sourceInfo?.videoId}"`);
  console.log(`Metadata Retrieved: ${ingestData.sourceInfo?.metadataRetrieved}`);
  console.log(`Can Process Standalone: ${ingestData.sourceInfo?.canProcess} (Must be false without recording upload)`);

  if (ingestData.sourceInfo?.canProcess !== false) {
    throw new Error('Compliance failure: Standalone YouTube URL must not be auto-processed without authorized recording.');
  }
  console.log('✓ PASS: YouTube metadata inspected cleanly, authorized recording required.\n');

  // Helper to upload a file via multipart form-data
  async function uploadRecording(filePath, videoId, confirmReuse = false) {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const blob = new Blob([fileBuffer], { type: 'video/mp4' });

    const formData = new FormData();
    formData.append('video', blob, fileName);
    if (videoId) formData.append('videoId', videoId);
    if (confirmReuse) formData.append('confirmReuse', 'true');

    const res = await fetch(`${BASE_URL}/api/upload`, {
      method: 'POST',
      body: formData,
    });
    return { status: res.status, data: await res.json() };
  }

  // STEP 3: Upload Recording 1 & Monitor Project 1
  console.log('--- STEP 3: UPLOAD RECORDING 1 & EXECUTE PROJECT 1 ---');
  const upload1 = await uploadRecording(rec1Path, 'k1Bwg9m9S9A');
  console.log('Upload 1 response status:', upload1.status);
  console.log('Upload 1 data:', upload1.data);

  if (!upload1.data.success || !upload1.data.filePath) {
    throw new Error(`Upload 1 failed: ${upload1.data.error}`);
  }
  console.log(`✓ Recording 1 uploaded successfully: ${upload1.data.filePath}`);
  console.log(`  Probed Duration: ${upload1.data.duration}s | Resolution: ${upload1.data.width}x${upload1.data.height}`);

  // Create Project 1
  console.log('\nCreating Project 1 (Kai Cenat GTA 6 + Recording 1)...');
  const proj1Res = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Project 1 - Kai Cenat 15s',
      sourceUrl: ytUrl1,
      sourceFile: upload1.data.filePath,
      preset: { durationPreset: '15s', memeIntensity: 'balanced' },
    }),
  });

  const proj1Init = await proj1Res.json();
  if (!proj1Init.projectId) {
    throw new Error(`Project 1 creation failed: ${JSON.stringify(proj1Init)}`);
  }
  const proj1Id = proj1Init.projectId;
  console.log(`✓ Project 1 initialized: ${proj1Id}`);

  // Monitor Project 1
  const proj1Completed = await monitorProject(proj1Id);
  console.log(`✓ Project 1 completed with status: ${proj1Completed.project.status}!`);

  // STEP 4: Test Duplicate Recording Detection Gate
  console.log('\n--- STEP 4: TEST DUPLICATE RECORDING DETECTION GATE ---');
  console.log('Attempting to upload Recording 1 again without confirmation...');
  const duplicateCheck = await uploadRecording(rec1Path, 'different_yt_id', false);
  console.log('Duplicate check response:', duplicateCheck.data);

  if (duplicateCheck.data.requiresConfirmation && duplicateCheck.data.warning === 'DUPLICATE_SOURCE_DETECTED') {
    console.log(`✓ PASS: Duplicate source detected! Flagged prior use in "${duplicateCheck.data.existingProject.title}".`);
  } else {
    throw new Error('Duplicate prevention failure: Prior recording was not flagged for confirmation!');
  }

  // STEP 5: Upload Recording 2 & Monitor Project 2
  console.log('\n--- STEP 5: UPLOAD RECORDING 2 & EXECUTE PROJECT 2 ---');
  const ytUrl2 = 'https://www.youtube.com/watch?v=QdBZY2fkU-0'; // GTA 6 Trailer
  const upload2 = await uploadRecording(rec2Path, 'QdBZY2fkU-0');
  console.log('Upload 2 response status:', upload2.status);
  console.log('Upload 2 data:', upload2.data);

  if (!upload2.data.success || !upload2.data.filePath) {
    throw new Error(`Upload 2 failed: ${upload2.data.error}`);
  }
  console.log(`✓ Recording 2 uploaded successfully: ${upload2.data.filePath}`);
  console.log(`  Probed Duration: ${upload2.data.duration}s | Resolution: ${upload2.data.width}x${upload2.data.height}`);

  // Create Project 2
  console.log('\nCreating Project 2 (GTA 6 Trailer + Recording 2)...');
  const proj2Res = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Project 2 - Vice City Trailer 22s',
      sourceUrl: ytUrl2,
      sourceFile: upload2.data.filePath,
      preset: { durationPreset: '30s', memeIntensity: 'high' },
    }),
  });

  const proj2Init = await proj2Res.json();
  if (!proj2Init.projectId) {
    throw new Error(`Project 2 creation failed: ${JSON.stringify(proj2Init)}`);
  }
  const proj2Id = proj2Init.projectId;
  console.log(`✓ Project 2 initialized: ${proj2Id}`);

  // Monitor Project 2
  const proj2Completed = await monitorProject(proj2Id);
  console.log(`✓ Project 2 completed with status: ${proj2Completed.project.status}!`);

  // STEP 6: Strict Cross-Project Isolation & Output Verification
  console.log('\n--- STEP 6: STRICT ISOLATION & OUTPUT AUDIT ---');

  const p1 = proj1Completed.project;
  const p2 = proj2Completed.project;
  const clips1 = proj1Completed.clips || [];
  const clips2 = proj2Completed.clips || [];

  console.log('\nPROJECT 1 AUDIT:');
  console.log('  ID:              ', p1.id);
  console.log('  Title:           ', p1.title);
  console.log('  Source Checksum: ', p1.source_checksum);
  console.log('  Clips Count:     ', clips1.length);
  clips1.forEach((c) => {
    console.log(`    Clip ID: ${c.id} | Duration: ${c.duration}s | Checksum: ${c.source_checksum}`);
    console.log(`    Output Path: ${c.output_path || c.edited_clip_path}`);
    const exists = fs.existsSync(c.output_path || c.edited_clip_path);
    console.log(`    File Exists on Disk: ${exists ? '✓ YES' : '❌ NO'}`);
    if (!exists) throw new Error(`Output file missing on disk: ${c.output_path}`);
  });

  console.log('\nPROJECT 2 AUDIT:');
  console.log('  ID:              ', p2.id);
  console.log('  Title:           ', p2.title);
  console.log('  Source Checksum: ', p2.source_checksum);
  console.log('  Clips Count:     ', clips2.length);
  clips2.forEach((c) => {
    console.log(`    Clip ID: ${c.id} | Duration: ${c.duration}s | Checksum: ${c.source_checksum}`);
    console.log(`    Output Path: ${c.output_path || c.edited_clip_path}`);
    const exists = fs.existsSync(c.output_path || c.edited_clip_path);
    console.log(`    File Exists on Disk: ${exists ? '✓ YES' : '❌ NO'}`);
    if (!exists) throw new Error(`Output file missing on disk: ${c.output_path}`);
  });

  // Cross-project assertions
  console.log('\n--- FINAL ACCEPTANCE ASSERTIONS ---');

  // Assertion 1: Checksums match their own recordings
  const p1Matches = p1.source_checksum === checksum1;
  const p2Matches = p2.source_checksum === checksum2;
  console.log('1. Project 1 source checksum matches Recording 1:', p1Matches ? '✓ PASS' : '❌ FAIL');
  console.log('   Project 2 source checksum matches Recording 2:', p2Matches ? '✓ PASS' : '❌ FAIL');
  if (!p1Matches || !p2Matches) throw new Error('Source checksum mismatch!');

  // Assertion 2: Project 1 and Project 2 checksums are different
  const distinctSources = p1.source_checksum !== p2.source_checksum;
  console.log('2. Distinct Source Checksums across Projects:', distinctSources ? '✓ PASS' : '❌ FAIL');
  if (!distinctSources) throw new Error('Projects shared the same source checksum!');

  // Assertion 3: Clips belong strictly to their parent sources
  const clips1Valid = clips1.every((c) => c.source_checksum === checksum1 && c.duration <= 15);
  const clips2Valid = clips2.every((c) => c.source_checksum === checksum2 && c.duration <= 22);
  console.log('3. Project 1 clips bound to Recording 1 (<= 15s):', clips1Valid ? '✓ PASS' : '❌ FAIL');
  console.log('   Project 2 clips bound to Recording 2 (<= 22s):', clips2Valid ? '✓ PASS' : '❌ FAIL');
  if (!clips1Valid || !clips2Valid) throw new Error('Clips failed duration or checksum bounds!');

  // Assertion 4: Zero clip ID or path overlap
  const clip1Ids = clips1.map((c) => c.id);
  const clip2Ids = clips2.map((c) => c.id);
  const idOverlap = clip1Ids.filter((id) => clip2Ids.includes(id));
  console.log('4. Zero Clip ID overlap across projects:', idOverlap.length === 0 ? '✓ PASS' : '❌ FAIL');
  if (idOverlap.length > 0) throw new Error(`Clip ID overlap detected: ${idOverlap.join(', ')}`);

  const path1 = clips1.map((c) => c.output_path || c.edited_clip_path);
  const path2 = clips2.map((c) => c.output_path || c.edited_clip_path);
  const pathOverlap = path1.filter((p) => path2.includes(p));
  console.log('5. Zero File Path overlap across projects:', pathOverlap.length === 0 ? '✓ PASS' : '❌ FAIL');
  if (pathOverlap.length > 0) throw new Error(`Path overlap detected: ${pathOverlap.join(', ')}`);

  console.log('\n================================================================');
  console.log('ALL SOURCE INGESTION WORKFLOW ACCEPTANCE GATES PASSED (100%)!');
  console.log('================================================================');
}

async function monitorProject(projectId) {
  const startTime = Date.now();
  while (Date.now() - startTime < 300000) { // 5 min max
    await sleep(2500);
    try {
      const res = await fetch(`${BASE_URL}/api/projects/${projectId}`);
      if (!res.ok) continue;
      const data = await res.json();
      const p = data.project;
      process.stdout.write(`  [${projectId}] Progress: ${p.progress || 0}% | Stage: ${p.current_stage || ''}\r`);

      if (p.status === 'ready' || p.status === 'completed') {
        console.log(`\n✓ Project ${projectId} reached '${p.status}'!`);
        return data;
      }
      if (p.status === 'error') {
        console.log(`\n❌ Project ${projectId} failed: ${p.error_message}`);
        throw new Error(`Project ${projectId} failed: ${p.error_message}`);
      }
    } catch (e) {
      if (e.message?.includes('failed:')) throw e;
    }
  }
  throw new Error(`Project ${projectId} timed out after 300s`);
}

main().catch((err) => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
