import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const videos = [
  ...fs.readdirSync('storage/clips').filter(f => f.endsWith('.mp4')).map(f => path.join('storage/clips', f)),
  ...fs.readdirSync('storage/exports').filter(f => f.endsWith('.mp4')).map(f => path.join('storage/exports', f)),
  ...fs.readdirSync('public/samples').filter(f => f.endsWith('.mp4')).map(f => path.join('public/samples', f)),
];

console.log(`Checking ${videos.length} videos...`);
for (const vid of videos) {
  const thumbPath = `public/samples/check_${path.basename(vid, '.mp4')}.jpg`;
  spawnSync('ffmpeg', ['-y', '-ss', '00:00:02', '-i', vid, '-frames:v', '1', thumbPath]);
  if (fs.existsSync(thumbPath)) {
    const sz = fs.statSync(thumbPath).size;
    // let's check size or log
    console.log(`${vid} -> thumb size ${sz}`);
  }
}
