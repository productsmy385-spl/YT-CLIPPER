import { rawDb } from '../src/db/index.ts';

const clips = rawDb.prepare(`
  SELECT id, project_id, title, status, output_path, raw_clip_path
  FROM generated_clips
  WHERE project_id = 'proj_1795243867068'
`).all();

console.log('Clips for proj_1795243867068:', clips.length);
for (const c of clips) {
  console.log(c);
}
