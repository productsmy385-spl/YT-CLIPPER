import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function findVideos(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.next') {
      results.push(...findVideos(full));
    } else if (entry.isFile() && entry.name.endsWith('.mp4')) {
      results.push(full);
    }
  }
  return results;
}

const vids = findVideos('storage');
console.log('Total mp4 files found in storage:', vids.length);
for (const v of vids) {
  const stat = fs.statSync(v);
  console.log(`- ${v} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
}
