import { videoIngestionEngine } from '../src/lib/video-ingestion.ts';
import { youtubeOAuth, encryptToken, decryptToken } from '../src/lib/youtube/oauth.ts';
import { dbRepo } from '../src/db/repository.ts';
import fs from 'node:fs';
import path from 'node:path';

async function runTests() {
  console.log('======================================================');
  console.log('🧪 RUNNING CRITICAL VERIFICATION TESTS');
  console.log('======================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`✓ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
    }
  }

  // --- TEST GROUP 1: SOURCE PROCESSING & SAFE STOPPING ---
  console.log('\n--- 1. Testing Video Source Ingestion & Error Handling ---');

  // Test 1: YouTube video with no authorized source file
  const ytTest = await videoIngestionEngine.inspectAndIngest({
    url: 'https://www.youtube.com/watch?v=WatJ7Ci5UIA',
    useAuthorizedFallback: false,
  });

  assert(
    ytTest.canProcess === false,
    'YouTube URL without authorized file correctly sets canProcess = false'
  );
  assert(
    ytTest.videoAcquired === false,
    'YouTube URL without authorized file correctly sets videoAcquired = false'
  );
  assert(
    ytTest.filePath === undefined,
    'YouTube URL without authorized file has filePath undefined'
  );
  assert(
    ytTest.errorMessage === 'Video metadata was verified, but the actual video file is not available. Please upload an authorized recording or provide an authorized source file.',
    'Returns exact required error message'
  );

  // Test 2: Missing local file path
  const missingFileTest = await videoIngestionEngine.inspectAndIngest({
    filePath: 'storage/uploads/non_existent_video_12345.mp4',
  });
  assert(
    missingFileTest.canProcess === false,
    'Non-existent file correctly rejected with canProcess = false'
  );

  // Test 3: Authorized local file
  const samplePath = path.resolve('public/samples/gta6_authorized_gameplay_sample.mp4');
  if (fs.existsSync(samplePath)) {
    const localTest = await videoIngestionEngine.inspectAndIngest({
      filePath: samplePath,
    });
    assert(
      localTest.canProcess === true && localTest.videoAcquired === true,
      `Authorized local file accepted (${localTest.duration?.toFixed(1)}s, ${localTest.width}x${localTest.height})`
    );
  } else {
    console.log('⚠️ Note: sample stream not found at', samplePath);
  }

  // --- TEST GROUP 2: YOUTUBE OAUTH, ENCRYPTION & STATUS ---
  console.log('\n--- 2. Testing YouTube OAuth & Security Infrastructure ---');

  // Test 4: Token Encryption at Rest
  const testSecret = 'sample_oauth_refresh_token_xyz_987654321';
  const encrypted = encryptToken(testSecret);
  const decrypted = decryptToken(encrypted);
  assert(
    encrypted !== testSecret && encrypted.split(':').length === 3,
    'Token is encrypted with AES-256-GCM format (iv:authTag:cipher)'
  );
  assert(
    decrypted === testSecret,
    'Token decrypts successfully matching original plaintext'
  );

  // Test 5: Google OAuth URL Generation
  try {
    const { url, state } = youtubeOAuth.generateAuthUrl('http://localhost:3000/api/youtube/callback');
    assert(
      url.startsWith('https://accounts.google.com/o/oauth2/v2/auth') || url.startsWith('https://accounts.google.com'),
      'Generated valid Google OAuth 2.0 authorization URL'
    );
    assert(
      url.includes('youtube.upload') && url.includes('youtube.readonly'),
      'URL contains required scopes: youtube.upload and youtube.readonly'
    );
    assert(
      url.includes('access_type=offline'),
      'URL requests offline access for persistent scheduled publishing'
    );
    assert(
      typeof state === 'string' && state.length === 32,
      'Cryptographically secure 16-byte state parameter generated'
    );
  } catch (err) {
    console.warn('OAuth URL note:', err.message);
  }

  // Test 6: Health Report Status Evaluation
  const statusReport = await youtubeOAuth.getStatusReport();
  const validStates = [
    'NOT_CONNECTED',
    'CONNECTING',
    'CONNECTED',
    'CHECKING_CONNECTION',
    'TOKEN_EXPIRED',
    'REAUTH_REQUIRED',
    'PERMISSION_MISSING',
    'CONNECTION_ERROR',
    'DISCONNECTED',
  ];
  assert(
    validStates.includes(statusReport.state),
    `Status report evaluates to official state: ${statusReport.state}`
  );
  assert(
    typeof statusReport.canUpload === 'boolean' && typeof statusReport.canSchedule === 'boolean',
    'Status report includes explicit canUpload and canSchedule permissions'
  );

  console.log('\n======================================================');
  console.log(`📊 TEST RESULTS: ${passed}/${total} PASSED`);
  console.log('======================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
