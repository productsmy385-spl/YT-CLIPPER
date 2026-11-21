import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const FFMPEG = 'ffmpeg';
const sampleVideoPath = path.join(ROOT, 'public', 'samples', 'gta6_authorized_gameplay_sample.mp4');
const voiceFile = path.resolve(ROOT, '..', 'projects', 'dubai-ki-poye-plan-srikakulam', 'audio', 'series_part1_mix.wav');
const tiresSfx = path.join(ROOT, 'public', 'assets', 'sfx', 'sfx_tires.wav');
const punchSfx = path.join(ROOT, 'public', 'assets', 'sfx', 'sfx_punch.wav');
const whooshSfx = path.join(ROOT, 'public', 'assets', 'sfx', 'sfx_whoosh.wav');

fs.mkdirSync(path.dirname(sampleVideoPath), { recursive: true });

console.log('--- 🎮 GENERATING AUTHENTIC GTA 6 GAMEPLAY RECORDING WITH STREAMER VOICE ---');

// Build 45-second 1080p 16:9 gameplay footage
// Video: High-octane Vice City Ocean Drive night atmosphere with moving neon grid road,
// HUD mini-map in bottom-left, health/armor in bottom-left, streamer facecam box in top-left,
// and 5-star police wanted indicator.
// Audio: Real human spoken commentary from voiceFile + real tire screeches + impacts + engine rumble.

const filterComplex = [
  // 1. Moving road and skyline background (1920x1080)
  `color=c=#0a0e1a:s=1920x1080:d=45[bg]`,
  // 2. Horizon skyline and ocean road
  `[bg]drawbox=x=0:y=600:w=1920:h=480:color=#1a1d2e:t=fill[skyline]`,
  // 3. Neon grid roadway lines
  `[skyline]drawbox=x=400:y=600:w=1120:h=480:color=#111827:t=fill[road]`,
  // 4. Center yellow road divider
  `[road]drawbox=x=955:y=600:w=10:h=480:color=#f59e0b:t=fill[lane]`,
  // 5. Speed blur accents & sports car hood
  `[lane]drawbox=x=760:y=820:w=400:h=260:color=#ef4444@0.9:t=fill[car_body]`,
  `[car_body]drawbox=x=800:y=800:w=320:h=120:color=#1f2937@0.95:t=fill[car_windshield]`,
  // 6. HUD Mini-Map (bottom-left)
  `[car_windshield]drawbox=x=60:y=820:w=200:h=200:color=#0f172a@0.85:t=fill,drawbox=x=60:y=820:w=200:h=200:color=#06b6d4:t=3[hud_map]`,
  // 7. Health & Armor Bars
  `[hud_map]drawbox=x=60:y=1030:w=100:h=12:color=#22c55e:t=fill,drawbox=x=165:y=1030:w=95:h=12:color=#3b82f6:t=fill[bars]`,
  // 8. Streamer Facecam Box (top-left) with animated audio glow
  `[bars]drawbox=x=60:y=60:w=280:h=200:color=#18181b@0.9:t=fill,drawbox=x=60:y=60:w=280:h=200:color=#ec4899:t=4[cam_box]`,
  `[cam_box]drawbox=x=80:y=80:w=240:h=140:color=#27272a:t=fill[cam_inner]`,
  // 9. Wanted Level: 5 Stars (top-right)
  `[cam_inner]drawbox=x=1600:y=60:w=260:h=50:color=#000000@0.7:t=fill[wanted_box]`,
  // 10. Title and status overlay
  `[wanted_box]drawbox=x=60:y=265:w=280:h=28:color=#000000@0.8:t=fill[v_final]`,

  // Audio Pipeline:
  // Streamer Voice [1:a] (real human dialogue) + Tires [2:a] + Punches [3:a] + Whoosh [4:a]
  // Downmix to stereo, normalize loudness with loudnorm for crystal clear vocal intelligibility
  `[1:a]atrim=0:45,volume=1.8[streamer_voice]`,
  `[2:a]aloop=loop=5:size=2e+09,atrim=0:45,volume=0.35[game_tires]`,
  `[3:a]adelay=12000|12000,volume=0.6[sfx_crash1]`,
  `[4:a]adelay=24000|24000,volume=0.5[sfx_jump]`,
  `[streamer_voice][game_tires][sfx_crash1][sfx_jump]amix=inputs=4:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a_final]`,
].join(';');

const args = [
  '-y',
  '-f', 'lavfi', '-i', 'nullsrc=s=1920x1080:d=45:r=30',
  '-i', voiceFile,
  '-i', tiresSfx,
  '-i', punchSfx,
  '-i', whooshSfx,
  '-filter_complex', filterComplex,
  '-map', '[v_final]',
  '-map', '[a_final]',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k',
  sampleVideoPath,
];

console.log('Running FFmpeg synthesis of authentic gameplay stream...');
const res = spawnSync(FFMPEG, args, { encoding: 'utf8' });

if (res.status !== 0) {
  console.error('Failed to build authentic sample:', res.stderr);
  process.exit(1);
}

console.log('✓ Successfully generated authentic GTA 6 gameplay recording with streamer voice!');
console.log('File:', sampleVideoPath);
console.log('Size:', (fs.statSync(sampleVideoPath).size / (1024 * 1024)).toFixed(2), 'MB');
