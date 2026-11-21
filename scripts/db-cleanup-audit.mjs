import { rawDb } from '../src/db/index.ts';

// Clean up orphaned records from deleted/mock projects older than today
const cleanedHighlights = rawDb.prepare(`DELETE FROM detected_highlights WHERE project_id = 'proj_1795243867068'`).run();
const cleanedClips = rawDb.prepare(`DELETE FROM generated_clips WHERE project_id = 'proj_1795243867068'`).run();
console.log(`Cleaned mock project proj_1795243867068: ${cleanedHighlights.changes} highlights, ${cleanedClips.changes} clips removed.`);

const currentProjects = rawDb.prepare(`SELECT id, title, source_url, status, created_at FROM projects ORDER BY created_at DESC`).all();
console.log('\nCURRENT ACTIVE PROJECTS IN DB:');
currentProjects.forEach(p => {
  const clips = rawDb.prepare(`SELECT count(*) as count FROM generated_clips WHERE project_id = ?`).get(p.id);
  console.log(`- [${p.id}] "${p.title}" | Status: ${p.status} | Clips: ${clips?.count || 0}`);
});
