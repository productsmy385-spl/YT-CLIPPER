import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Find all video files under the workspace
function findVideos(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.next' && entry.name !== '.git') {
      results.push(...findVideos(full));
    } else if (entry.isFile() && (entry.name.endsWith('.mp4') || entry.name.endsWith('.webm'))) {
      results.push(full);
    }
  }
  return results;
}

const allVideos = findVideos('..');
console.log(`Found ${allVideos.length} total videos across workspace.`);

for (const v of allVideos) {
  // probe resolution
  const res = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', v], { encoding: 'utf8' });
  const dims = (res.stdout || '').trim();
  if (dims.includes('1080\n1920') || dims.includes('1080,1920')) {
    console.log(`Vertical 1080x1920: ${v}`);
  }
}
