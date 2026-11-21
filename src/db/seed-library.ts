import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from '../lib/app-paths.ts';

const db = new DatabaseSync(DB_PATH);

export function seedLibraryData() {
  console.log('[Seeder] Checking existing media library counts...');

  const currentSource = (db.prepare(`SELECT count(*) as c FROM source_videos WHERE is_deleted = 0 OR is_deleted IS NULL`).get() as any)?.c || 0;
  const currentClips = (db.prepare(`SELECT count(*) as c FROM generated_clips WHERE is_deleted = 0 OR is_deleted IS NULL`).get() as any)?.c || 0;
  const currentScheduled = (db.prepare(`SELECT count(*) as c FROM scheduled_posts WHERE is_deleted = 0 OR is_deleted IS NULL`).get() as any)?.c || 0;

  console.log(`Current counts in DB: ${currentSource} source videos, ${currentClips} clips, ${currentScheduled} scheduled posts.`);

  const sampleTitles = [
    'Lucia & Jason Neon Highway Heist Escape',
    'Vice City Beach Supercar Speed Jump',
    '5-Star Tank Chaos on Ocean Drive Strip',
    'Insane Police Interceptor Crash & Flip',
    'Helicopter Stunt Clearing Skyscraper Bridge',
    'Speedboat Wave Jump Over Marina Pier',
    'Vice City Downtown Drift & Nitro Boost',
    'Armored Truck Bank Robbery Getaway',
    'Motorcycle Roof Leap Clearing Canal Basin',
    'Supercar Hydroplane Across Vice Lake',
    'SWAT Roadblock Ramming Stunt',
    'Vice Beach Quad Bike Sand Dunes Race',
    'Jet Ski Aerial Barrel Roll in Surf',
    'Port Gelhorn Container Yard Gunfight',
    'Nighttime Neon Cruiser Speed Chase',
    'Hovercraft Swamp Escape from Air Patrol',
    'Lucia Stunt Bike Alley Wheelie',
    'Jason Sniper Lookout Helicopter Takedown',
    'Underground Parking Garage Drift Battle',
    'Sunset Boulevard Muscle Car Burnout',
    'Everglades Airboat Wildlife Encounter',
    'Vice Port Crane Stunt Jump',
    'Police Cruiser Water Canal Hydroplane',
    'Sports Car Rail Crossing Narrow Miss',
  ];

  const categories = [
    { cat: 'epic_stunts', label: 'High-Octane Stunts' },
    { cat: 'funny_moments', label: 'Funny Gameplay' },
    { cat: 'police_chases', label: 'Police Chases' },
    { cat: 'gunfights', label: 'Intense Shootouts' },
    { cat: 'fails', label: 'Spectacular Fails' },
  ];

  const platforms = ['youtube_shorts', 'instagram_reels', 'tiktok'];

  // 1. Ensure at least 12 source videos exist
  const neededSource = Math.max(0, 12 - currentSource);
  if (neededSource > 0) {
    console.log(`[Seeder] Seeding ${neededSource} source videos...`);
    const insertSource = db.prepare(`
      INSERT OR IGNORE INTO source_videos (id, project_id, file_name, file_path, file_size, duration, width, height, fps, bitrate, audio_channels, origin_source, created_at)
      VALUES (?, 'proj_1795243867068', ?, ?, ?, ?, 1920, 1080, 60, 12000000, 2, 'authorized_stream', ?)
    `);

    for (let i = 1; i <= neededSource; i++) {
      const id = `src_seed_${Date.now()}_${i}`;
      const name = `gta6_gameplay_stream_part_${i.toString().padStart(2, '0')}.mp4`;
      const dur = Math.floor(1800 + Math.random() * 3600);
      const daysAgo = Math.floor(Math.random() * 15);
      const createdAt = new Date(Date.now() - daysAgo * 86400 * 1000).toISOString();
      insertSource.run(id, name, `public/samples/${name}`, 450000000, dur, createdAt);
    }
  }

  // 2. Ensure at least 48 extracted clips + 76 edited shorts exist
  const existingExtracted = (db.prepare(`SELECT count(*) as c FROM generated_clips WHERE status = 'extracted' AND (is_deleted = 0 OR is_deleted IS NULL)`).get() as any)?.c || 0;
  const existingRendered = (db.prepare(`SELECT count(*) as c FROM generated_clips WHERE status IN ('rendered', 'ready', 'completed') AND (is_deleted = 0 OR is_deleted IS NULL)`).get() as any)?.c || 0;

  const targetExtracted = 48;
  const targetRendered = 76;

  const insertHighlight = db.prepare(`
    INSERT OR IGNORE INTO detected_highlights (id, project_id, category, category_label, entertainment_score, start_time, end_time, duration, hook_strength, hook_reason, peak_event, created_at)
    VALUES (?, 'proj_1795243867068', ?, ?, ?, ?, ?, ?, 90, 'Instant high momentum action hook', 'High impact vehicle stunt climax', ?)
  `);

  const insertClip = db.prepare(`
    INSERT OR IGNORE INTO generated_clips (id, project_id, highlight_id, title, duration, output_path, status, resolution, fps, qa_score, copyright_passed, created_at)
    VALUES (?, 'proj_1795243867068', ?, ?, ?, ?, ?, '1080x1920', 60, ?, 1, ?)
  `);

  if (existingExtracted < targetExtracted) {
    const toAdd = targetExtracted - existingExtracted;
    console.log(`[Seeder] Seeding ${toAdd} extracted clips...`);
    for (let i = 1; i <= toAdd; i++) {
      const clipId = `clip_ext_${Date.now()}_${i}`;
      const hlId = `hl_ext_${Date.now()}_${i}`;
      const catObj = categories[i % categories.length];
      const title = `${sampleTitles[i % sampleTitles.length]} (Raw Clip #${i})`;
      const dur = Number((15 + Math.random() * 30).toFixed(1));
      const score = Math.floor(75 + Math.random() * 23);
      const daysAgo = Math.floor(Math.random() * 20);
      const createdAt = new Date(Date.now() - daysAgo * 86400 * 1000).toISOString();

      insertHighlight.run(hlId, catObj.cat, catObj.label, score, 10.0, 10.0 + dur, dur, createdAt);
      insertClip.run(clipId, hlId, title, dur, `storage/clips/${clipId}_raw.mp4`, 'extracted', score, createdAt);
    }
  }

  if (existingRendered < targetRendered) {
    const toAdd = targetRendered - existingRendered;
    console.log(`[Seeder] Seeding ${toAdd} rendered shorts...`);
    for (let i = 1; i <= toAdd; i++) {
      const clipId = `clip_rend_${Date.now()}_${i}`;
      const hlId = `hl_rend_${Date.now()}_${i}`;
      const catObj = categories[i % categories.length];
      const title = `GTA 6: ${sampleTitles[i % sampleTitles.length]}`;
      const dur = Number((15 + Math.random() * 35).toFixed(1));
      const score = Math.floor(82 + Math.random() * 17);
      const daysAgo = Math.floor(Math.random() * 14);
      const createdAt = new Date(Date.now() - daysAgo * 86400 * 1000).toISOString();

      // Point to verified rendered video samples
      const sampleOut = i % 2 === 0
        ? 'storage/clips/clip_1795243867263_1_vertical_final.mp4'
        : 'storage/clips/clip_1795243879829_2_vertical_final.mp4';

      insertHighlight.run(hlId, catObj.cat, catObj.label, score, 5.0, 5.0 + dur, dur, createdAt);
      insertClip.run(clipId, hlId, title, dur, sampleOut, 'rendered', score, createdAt);
    }
  }

  // 3. Ensure at least 20 published posts + 15 scheduled posts exist across dates
  const currentPublished = (db.prepare(`SELECT count(*) as c FROM scheduled_posts WHERE status = 'PUBLISHED' AND (is_deleted = 0 OR is_deleted IS NULL)`).get() as any)?.c || 0;
  const targetPublished = 20;

  // Insert export jobs and files for scheduled posts
  const insertExportJob = db.prepare(`
    INSERT OR IGNORE INTO export_jobs (id, clip_id, platform, status, started_at, completed_at)
    VALUES (?, ?, ?, 'completed', ?, ?)
  `);

  const insertExportFile = db.prepare(`
    INSERT OR IGNORE INTO export_files (id, export_job_id, platform, file_path, file_size, title, description, tags, download_url, created_at)
    VALUES (?, ?, ?, ?, 21500000, ?, ?, '#GTA6 #Gaming #Shorts #ViceCity', ?, ?)
  `);

  const insertScheduledPost = db.prepare(`
    INSERT OR IGNORE INTO scheduled_posts (id, user_id, project_id, export_file_id, platform, connected_account_id, scheduled_at, timezone, status, platform_post_id, published_url, created_at, updated_at)
    VALUES (?, 'usr_creator_01', 'proj_1795243867068', ?, ?, 'acc_yt_verified_01', ?, 'Asia/Kolkata', ?, ?, ?, ?, ?)
  `);

  if (currentPublished < targetPublished) {
    const toAdd = targetPublished - currentPublished;
    console.log(`[Seeder] Seeding ${toAdd} published social posts...`);
    for (let i = 1; i <= toAdd; i++) {
      const expJobId = `expjob_pub_${Date.now()}_${i}`;
      const expFileId = `expfile_pub_${Date.now()}_${i}`;
      const schedId = `sched_pub_${Date.now()}_${i}`;
      const plat = platforms[i % platforms.length];
      const title = `GTA 6 Best Moments: ${sampleTitles[i % sampleTitles.length]}`;
      const daysAgo = Math.floor(Math.random() * 10);
      const pubDate = new Date(Date.now() - daysAgo * 86400 * 1000).toISOString();
      const videoId = `yt_vid_${Math.random().toString(36).substring(2, 9)}`;
      const pubUrl = `https://www.youtube.com/shorts/${videoId}`;

      insertExportJob.run(expJobId, 'clip_1795243867263_1', plat, pubDate, pubDate);
      insertExportFile.run(expFileId, expJobId, plat, 'storage/clips/clip_1795243867263_1_vertical_final.mp4', title, `Watch this crazy GTA 6 moment! Source footage credit Vice City Studios. ${title}`, pubUrl, pubDate);
      insertScheduledPost.run(schedId, expFileId, plat, pubDate, 'PUBLISHED', videoId, pubUrl, pubDate, pubDate);
    }
  }

  // 4. Ensure at least 15 scheduled posts exist across current and upcoming dates for the calendar
  const currentSched = (db.prepare(`SELECT count(*) as c FROM scheduled_posts WHERE status IN ('SCHEDULED', 'PROCESSING') AND (is_deleted = 0 OR is_deleted IS NULL)`).get() as any)?.c || 0;
  const targetSched = 15;

  if (currentSched < targetSched) {
    const toAdd = targetSched - currentSched;
    console.log(`[Seeder] Seeding ${toAdd} scheduled calendar posts...`);
    for (let i = 1; i <= toAdd; i++) {
      const expJobId = `expjob_sch_${Date.now()}_${i}`;
      const expFileId = `expfile_sch_${Date.now()}_${i}`;
      const schedId = `sched_fut_${Date.now()}_${i}`;
      const plat = platforms[i % platforms.length];
      const title = `Scheduled Premiere: ${sampleTitles[(i + 5) % sampleTitles.length]}`;

      // Spread dates around today, tomorrow, and across the rest of the month
      const daysAhead = (i % 7) - 2; // spreads from -2 days to +4 days
      const schedDate = new Date(Date.now() + daysAhead * 86400 * 1000 + (14 + i) * 3600 * 1000).toISOString();
      const createdAt = new Date().toISOString();

      insertExportJob.run(expJobId, 'clip_1795243879829_2', plat, createdAt, createdAt);
      insertExportFile.run(expFileId, expJobId, plat, 'storage/clips/clip_1795243879829_2_vertical_final.mp4', title, `Upcoming scheduled GTA 6 short: ${title}`, `/api/media/clips/clip_1795243879829_2_vertical_final.mp4#t=0.5`, createdAt);
      insertScheduledPost.run(schedId, expFileId, plat, schedDate, 'SCHEDULED', null, null, createdAt, createdAt);
    }
  }

  console.log('[Seeder] Finished seeding! New counts:');
  const finalSource = (db.prepare(`SELECT count(*) as c FROM source_videos WHERE is_deleted = 0 OR is_deleted IS NULL`).get() as any)?.c || 0;
  const finalExtracted = (db.prepare(`SELECT count(*) as c FROM generated_clips WHERE status = 'extracted' AND (is_deleted = 0 OR is_deleted IS NULL)`).get() as any)?.c || 0;
  const finalRendered = (db.prepare(`SELECT count(*) as c FROM generated_clips WHERE status IN ('rendered', 'ready', 'completed') AND (is_deleted = 0 OR is_deleted IS NULL)`).get() as any)?.c || 0;
  const finalPublished = (db.prepare(`SELECT count(*) as c FROM scheduled_posts WHERE status = 'PUBLISHED' AND (is_deleted = 0 OR is_deleted IS NULL)`).get() as any)?.c || 0;
  const finalScheduled = (db.prepare(`SELECT count(*) as c FROM scheduled_posts WHERE status IN ('SCHEDULED', 'PROCESSING') AND (is_deleted = 0 OR is_deleted IS NULL)`).get() as any)?.c || 0;
  const finalTotal = finalSource + finalExtracted + finalRendered + finalPublished + finalScheduled;

  console.log({
    AllVideos: finalTotal,
    SourceVideos: finalSource,
    ExtractedClips: finalExtracted,
    EditedVideos: finalRendered,
    PublishedVideos: finalPublished,
    ScheduledVideos: finalScheduled,
  });
}

seedLibraryData();
