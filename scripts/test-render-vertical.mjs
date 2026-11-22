import { ffmpegCore } from '../src/lib/ffmpeg-core.ts';
import fs from 'fs';
import path from 'path';

async function runTests() {
  const testDir = path.resolve('storage/test_rendering');
  const videoWithAudio = path.join(testDir, 'source_with_audio.mp4');
  const videoWithoutAudio = path.join(testDir, 'source_no_audio.mp4');
  const testAss = path.join(testDir, 'test_subtitles.ass');
  const bgmPath = path.resolve('public/assets/music/mus_phonk_drift.wav');
  const sfxPath = path.resolve('public/assets/sfx/gaming_memes/(Horror_Mode.)_Pinki_Sprunki_horror-mode-pinki-sprunki.mp3');
  const memePath = path.resolve('public/assets/memes/meme_shock_eyes.png');

  console.log('=== TEST 1: Basic vertical clip without subtitles or additional audio ===');
  const out1 = path.join(testDir, 'test_1_basic.mp4');
  await ffmpegCore.renderBasicVertical({
    sourceClip: videoWithAudio,
    outputPath: out1,
    duration: 3.0,
    layoutMode: 'blurred_background',
  });
  const v1 = ffmpegCore.validateRenderedVideo(out1, 3.0);
  console.log('TEST 1 Result:', v1.isValid, `(${v1.width}x${v1.height}, ${v1.duration}s, hasAudio: ${v1.hasAudio})`);
  if (!v1.isValid) throw new Error(`TEST 1 Failed: ${v1.errors.join('; ')}`);

  console.log('=== TEST 2: Vertical clip with ASS subtitles ===');
  const out2 = path.join(testDir, 'test_2_subtitles.mp4');
  await ffmpegCore.renderVerticalWithSubtitles({
    sourceClip: videoWithAudio,
    outputPath: out2,
    duration: 3.0,
    subtitleAssPath: testAss,
    layoutMode: 'blurred_background',
  });
  const v2 = ffmpegCore.validateRenderedVideo(out2, 3.0);
  console.log('TEST 2 Result:', v2.isValid, `(${v2.width}x${v2.height}, ${v2.duration}s, hasAudio: ${v2.hasAudio})`);
  if (!v2.isValid) throw new Error(`TEST 2 Failed: ${v2.errors.join('; ')}`);

  console.log('=== TEST 3: Vertical clip with original audio, BGM, and meme SFX ===');
  const out3 = path.join(testDir, 'test_3_full_audio_meme.mp4');
  await ffmpegCore.renderVerticalShort({
    sourceClip: videoWithAudio,
    outputPath: out3,
    duration: 4.0,
    layoutMode: 'blurred_background',
    memeOverlayPath: memePath,
    memeStart: 1.0,
    memeDuration: 2.0,
    bgmPath: bgmPath,
    bgmVolume: 0.2,
    sfxEvents: [
      { sfxPath: sfxPath, timestamp: 1.5, volume: 0.8 }
    ],
    subtitleAssPath: testAss,
  });
  const v3 = ffmpegCore.validateRenderedVideo(out3, 4.0);
  console.log('TEST 3 Result:', v3.isValid, `(${v3.width}x${v3.height}, ${v3.duration}s, hasAudio: ${v3.hasAudio})`);
  if (!v3.isValid) throw new Error(`TEST 3 Failed: ${v3.errors.join('; ')}`);

  console.log('=== TEST 4: Video with NO source audio ===');
  const out4 = path.join(testDir, 'test_4_no_source_audio.mp4');
  await ffmpegCore.renderVerticalShort({
    sourceClip: videoWithoutAudio,
    outputPath: out4,
    duration: 3.0,
    layoutMode: 'blurred_background',
    bgmPath: bgmPath,
    bgmVolume: 0.25,
    sfxEvents: [
      { sfxPath: sfxPath, timestamp: 1.0, volume: 0.9 }
    ],
    subtitleAssPath: testAss,
  });
  const v4 = ffmpegCore.validateRenderedVideo(out4, 3.0);
  console.log('TEST 4 Result:', v4.isValid, `(${v4.width}x${v4.height}, ${v4.duration}s, hasAudio: ${v4.hasAudio}, meanDb: ${v4.meanVolumeDb})`);
  if (!v4.isValid) throw new Error(`TEST 4 Failed: ${v4.errors.join('; ')}`);

  console.log('\n✅ ALL 4 RENDERING PIPELINE TESTS PASSED WITH 100% VALIDATION!');
}

runTests().catch((err) => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
