import path from 'node:path';
import fs from 'node:fs';
import { dbRepo } from '../src/db/repository.ts';
import { MasterAgentOrchestrator } from '../src/agents/orchestrator.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const sampleVideo = path.join(ROOT, 'public', 'samples', 'gta6_authorized_gameplay_sample.mp4');

if (!fs.existsSync(sampleVideo)) {
  console.error('Sample video does not exist! Run npm run db:seed first.');
  process.exit(1);
}

const projectId = `proj_${Date.now()}`;
console.log(`Creating test project: ${projectId}...`);

dbRepo.createProject({
  id: projectId,
  userId: 'usr_creator_01',
  title: 'GTA 6 Vice City Stunts & Police Chase #01',
  sourceFile: sampleVideo,
});

const orchestrator = new MasterAgentOrchestrator();

orchestrator
  .processProject(projectId, sampleVideo, (stage, percent, msg) => {
    console.log(`[STATUS UPDATE ${percent}%] ${msg}`);
  })
  .then((res) => {
    console.log('\n--- 🏆 PIPELINE RUN SUCCESS! ---');
    console.log('Project ID:', res.projectId);
    console.log('Total Clips Produced:', res.totalClips);

    const clips = dbRepo.getClipsByProject(projectId);
    console.log('Saved Clips in DB:', clips);

    const logs = dbRepo.getAgentLogs(projectId);
    console.log(`Total Agent Execution Logs: ${logs.length}`);

    const exports = dbRepo.getExportFiles();
    console.log(`Total Export Files in DB: ${exports.length}`);

    const cr = dbRepo.getCopyrightReportByProject(projectId);
    console.log('Copyright Report:', cr);

    const metrics = dbRepo.getDashboardMetrics();
    console.log('Dashboard Metrics:', metrics);
  })
  .catch((err) => {
    console.error('Pipeline error:', err);
    process.exit(1);
  });
