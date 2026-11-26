import path from 'node:path';
import fs from 'node:fs';

// Resolve root directory of gta6-shorts-ai reliably regardless of whether process.cwd() is YB-STICKMAN or gta6-shorts-ai
export const APP_ROOT = fs.existsSync(path.resolve(process.cwd(), 'src', 'db'))
  ? process.cwd()
  : path.resolve(process.cwd(), 'gta6-shorts-ai');

// Media must live on persistent disk. On Railway attach a volume mounted at /app/storage (the default below),
// or point STORAGE_DIR at the volume mount path.
export const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || path.resolve(APP_ROOT, 'storage'));
export const STORAGE_PROJECTS_DIR = path.resolve(STORAGE_DIR, 'projects');
export const STORAGE_CLIPS_DIR = path.resolve(STORAGE_DIR, 'clips');
export const STORAGE_EXPORTS_DIR = path.resolve(STORAGE_DIR, 'exports');
export const STORAGE_UPLOADS_DIR = path.resolve(STORAGE_DIR, 'uploads');
export const STORAGE_DOWNLOADS_DIR = path.resolve(STORAGE_DIR, 'downloads');
export const STORAGE_AVATARS_DIR = path.resolve(STORAGE_DIR, 'avatars');
export const STORAGE_TMP_DIR = path.resolve(STORAGE_DIR, 'tmp');
export const AUTHORIZED_SOURCES_DIR = path.resolve(STORAGE_DIR, 'authorized_sources');
export const PUBLIC_DIR = path.resolve(APP_ROOT, 'public');
export const SFX_DIR = path.resolve(PUBLIC_DIR, 'assets', 'sfx');
export const MEMES_DIR = path.resolve(PUBLIC_DIR, 'assets', 'memes');
export const MUSIC_DIR = path.resolve(PUBLIC_DIR, 'assets', 'music');
export const SAMPLES_DIR = path.resolve(PUBLIC_DIR, 'samples');
export const DB_PATH = path.resolve(process.env.SQLITE_PATH || path.resolve(STORAGE_DIR, 'gta6_shorts.db'));

// Ensure necessary directories exist
fs.mkdirSync(STORAGE_DIR, { recursive: true });
fs.mkdirSync(STORAGE_TMP_DIR, { recursive: true });
fs.mkdirSync(STORAGE_PROJECTS_DIR, { recursive: true });
fs.mkdirSync(STORAGE_CLIPS_DIR, { recursive: true });
fs.mkdirSync(STORAGE_EXPORTS_DIR, { recursive: true });
fs.mkdirSync(STORAGE_UPLOADS_DIR, { recursive: true });
fs.mkdirSync(STORAGE_DOWNLOADS_DIR, { recursive: true });
fs.mkdirSync(STORAGE_AVATARS_DIR, { recursive: true });
fs.mkdirSync(AUTHORIZED_SOURCES_DIR, { recursive: true });
fs.mkdirSync(SFX_DIR, { recursive: true });
fs.mkdirSync(MEMES_DIR, { recursive: true });
fs.mkdirSync(MUSIC_DIR, { recursive: true });

export interface ProjectStoragePaths {
  base: string;
  sourceDir: string;
  analysisDir: string;
  extractedDir: string;
  editedDir: string;
  subtitlesDir: string;
  thumbnailsDir: string;
  exportsDir: string;
}

/**
 * Returns isolated storage paths for an individual project:
 * storage/projects/<projectId>/{source, analysis, extracted, edited, subtitles, thumbnails, exports}
 */
export function getProjectStoragePaths(projectId: string): ProjectStoragePaths {
  const base = path.resolve(STORAGE_PROJECTS_DIR, projectId);
  const sourceDir = path.resolve(base, 'source');
  const analysisDir = path.resolve(base, 'analysis');
  const extractedDir = path.resolve(base, 'extracted');
  const editedDir = path.resolve(base, 'edited');
  const subtitlesDir = path.resolve(base, 'subtitles');
  const thumbnailsDir = path.resolve(base, 'thumbnails');
  const exportsDir = path.resolve(base, 'exports');

  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(analysisDir, { recursive: true });
  fs.mkdirSync(extractedDir, { recursive: true });
  fs.mkdirSync(editedDir, { recursive: true });
  fs.mkdirSync(subtitlesDir, { recursive: true });
  fs.mkdirSync(thumbnailsDir, { recursive: true });
  fs.mkdirSync(exportsDir, { recursive: true });

  return {
    base,
    sourceDir,
    analysisDir,
    extractedDir,
    editedDir,
    subtitlesDir,
    thumbnailsDir,
    exportsDir,
  };
}
