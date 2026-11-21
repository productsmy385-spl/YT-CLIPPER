import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: text('role').default('creator'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  gameTitle: text('game_title').default('Grand Theft Auto VI'),
  status: text('status').default('created'), // created, in_progress, ready, completed, cancelled, error, stalled
  progress: integer('progress').default(0), // 0 to 100
  currentStage: text('current_stage').default('init'),
  stageId: text('stage_id').default('1'),
  stageStatus: text('stage_status').default('PENDING'),
  stageStartedAt: text('stage_started_at'),
  stageCompletedAt: text('stage_completed_at'),
  heartbeatAt: text('heartbeat_at'),
  errorMessage: text('error_message'),
  lockedBy: text('locked_by'),
  lockAcquiredAt: text('lock_acquired_at'),
  sourceUrl: text('source_url'),
  sourceFile: text('source_file'),
  sourceVideoId: text('source_video_id'),
  sourceChecksum: text('source_checksum'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const sourceVideos = sqliteTable('source_videos', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  fileName: text('file_name').notNull(),
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size').notNull(),
  duration: real('duration').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  fps: real('fps').notNull(),
  bitrate: integer('bitrate'),
  audioChannels: integer('audio_channels'),
  sha256Checksum: text('sha256_checksum'),
  copyrightDeclared: integer('copyright_declared', { mode: 'boolean' }).default(true),
  originSource: text('origin_source').default('authorized_stream'),
  createdAt: text('created_at').notNull(),
});

export const videoAnalysis = sqliteTable('video_analysis', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  totalScenes: integer('total_scenes').default(0),
  speechSegmentsCount: integer('speech_segments_count').default(0),
  audioPeaksCount: integer('audio_peaks_count').default(0),
  gameplaySummary: text('gameplay_summary'),
  analyzedAt: text('analyzed_at').notNull(),
});

export const detectedScenes = sqliteTable('detected_scenes', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  startTime: real('start_time').notNull(),
  endTime: real('end_time').notNull(),
  duration: real('duration').notNull(),
  avgMotionScore: real('avg_motion_score').default(0),
  visualSummary: text('visual_summary'),
  keyframePath: text('keyframe_path'),
});

export const detectedHighlights = sqliteTable('detected_highlights', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  sourceVideoId: text('source_video_id'),
  category: text('category').notNull(),
  categoryLabel: text('category_label').notNull(),
  entertainmentScore: integer('entertainment_score').notNull(),
  startTime: real('start_time').notNull(),
  endTime: real('end_time').notNull(),
  normalizedStart: real('normalized_start'),
  normalizedEnd: real('normalized_end'),
  duration: real('duration').notNull(),
  hookStrength: integer('hook_strength').default(85),
  hookReason: text('hook_reason'),
  peakEvent: text('peak_event'),
  suggestedMemeMood: text('suggested_meme_mood').default('laugh'),
  suggestedMusicGenre: text('suggested_music_genre').default('phonk'),
  isSelected: integer('is_selected', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').notNull(),
});

export const generatedClips = sqliteTable('generated_clips', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  sourceVideoId: text('source_video_id'),
  highlightId: text('highlight_id').notNull(),
  title: text('title').notNull(),
  duration: real('duration').notNull(),
  startTime: real('start_time'),
  endTime: real('end_time'),
  extractionVersion: integer('extraction_version').default(1),
  editingVersion: integer('editing_version').default(1),
  outputPath: text('output_path'),
  outputFilePath: text('output_file_path'),
  rawClipPath: text('raw_clip_path'),
  editedClipPath: text('edited_clip_path'),
  thumbnailPath: text('thumbnail_path'),
  status: text('status').default('extracted'), // extracted, editing, rendered, failed
  processingStatus: text('processing_status').default('extracted'),
  resolution: text('resolution').default('1080x1920'),
  fps: integer('fps').default(30),
  qaScore: integer('qa_score'),
  copyrightPassed: integer('copyright_passed', { mode: 'boolean' }),
  sourceChecksum: text('source_checksum'),
  jobId: text('job_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at'),
});

export const projectPipelineStages = sqliteTable('project_pipeline_stages', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  stageNumber: integer('stage_number').notNull(),
  stageKey: text('stage_key').notNull(),
  stageName: text('stage_name').notNull(),
  status: text('status').notNull(), // PENDING, ACTIVE, COMPLETED, FAILED, CANCELLED
  progressPercent: integer('progress_percent').notNull(),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  errorMessage: text('error_message'),
  detailsJson: text('details_json'),
});

export const editingJobs = sqliteTable('editing_jobs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  clipId: text('clip_id'),
  activeAgent: text('active_agent'),
  status: text('status').default('pending'), // pending, in_progress, completed, failed
  progressPercent: integer('progress_percent').default(0),
  stepName: text('step_name'),
  errorMessage: text('error_message'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
});

export const aiAgents = sqliteTable('ai_agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  role: text('role').notNull(),
  description: text('description').notNull(),
  model: text('model').default('gemini-2.5-pro'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  executionCount: integer('execution_count').default(0),
  avgLatencyMs: integer('avg_latency_ms').default(0),
});

export const agentExecutionLogs = sqliteTable('agent_execution_logs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  agentId: text('agent_id').notNull(),
  agentName: text('agent_name').notNull(),
  stage: text('stage').notNull(),
  status: text('status').notNull(),
  message: text('message').notNull(),
  durationMs: integer('duration_ms').default(0),
  inputSummary: text('input_summary'),
  outputSummary: text('output_summary'),
  error: text('error'),
  createdAt: text('created_at').notNull(),
});

export const assetLicenses = sqliteTable('asset_licenses', {
  id: text('id').primaryKey(),
  licenseName: text('license_name').notNull(),
  licenseType: text('license_type').notNull(), // CC0, Royalty-Free Commercial, Partner
  attributionText: text('attribution_text'),
  commercialAllowed: integer('commercial_allowed', { mode: 'boolean' }).default(true),
  verifiedAt: text('verified_at').notNull(),
});

export const memeAssets = sqliteTable('meme_assets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  emotion: text('emotion').notNull(), // laugh, shock, fail, rage, triumph
  filePath: text('file_path').notNull(),
  duration: real('duration').default(2.5),
  overlayType: text('overlay_type').default('pip_corner'),
  licenseId: text('license_id'),
  tags: text('tags'),
});

export const musicAssets = sqliteTable('music_assets', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  genre: text('genre').notNull(), // phonk, action, comedy, suspense, synthwave, chill
  bpm: integer('bpm').default(130),
  energy: text('energy').default('high'),
  filePath: text('file_path').notNull(),
  duration: real('duration').notNull(),
  licenseId: text('license_id'),
});

export const soundEffectAssets = sqliteTable('sound_effect_assets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(), // impact, punch, whoosh, record_scratch, boing, laugh
  filePath: text('file_path').notNull(),
  duration: real('duration').notNull(),
  defaultVolume: real('default_volume').default(1.0),
  licenseId: text('license_id'),
});

export const clipEditingConfigurations = sqliteTable('clip_editing_configurations', {
  id: text('id').primaryKey(),
  clipId: text('clip_id').notNull().unique(),
  cropMode: text('crop_mode').default('center_action'),
  cropX: real('crop_x').default(0.5),
  cropY: real('crop_y').default(0.5),
  zoomScale: real('zoom_scale').default(1.15),
  musicAssetId: text('music_asset_id'),
  musicVolume: real('music_volume').default(0.45),
  musicDuckingDb: real('music_ducking_db').default(-16.0),
  subtitleStyle: text('subtitle_style').default('vice_neon'),
  configJson: text('config_json'), // holds meme timestamps and SFX placement
  createdAt: text('created_at').notNull(),
});

export const subtitles = sqliteTable('subtitles', {
  id: text('id').primaryKey(),
  clipId: text('clip_id').notNull(),
  startTime: real('start_time').notNull(),
  endTime: real('end_time').notNull(),
  text: text('text').notNull(),
  wordTimestampsJson: text('word_timestamps_json'),
  activeColor: text('active_color').default('#06B6D4'),
});

export const copyrightReports = sqliteTable('copyright_reports', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  clipId: text('clip_id'),
  complianceScore: integer('compliance_score').notNull(), // 0 to 100
  passed: integer('passed', { mode: 'boolean' }).notNull(),
  sourceAuthorized: integer('source_authorized', { mode: 'boolean' }).default(true),
  musicCompliant: integer('music_compliant', { mode: 'boolean' }).default(true),
  memesCompliant: integer('memes_compliant', { mode: 'boolean' }).default(true),
  problemItemsJson: text('problem_items_json'),
  reportSummary: text('report_summary').notNull(),
  generatedAt: text('generated_at').notNull(),
});

export const qualityReports = sqliteTable('quality_reports', {
  id: text('id').primaryKey(),
  clipId: text('clip_id').notNull().unique(),
  qaScore: integer('qa_score').notNull(), // 0 to 100
  passed: integer('passed', { mode: 'boolean' }).notNull(),
  resolutionCheck: integer('resolution_check', { mode: 'boolean' }).default(true),
  aspectRatioCheck: integer('aspect_ratio_check', { mode: 'boolean' }).default(true),
  audioClipping: integer('audio_clipping', { mode: 'boolean' }).default(false),
  blackFramesFound: integer('black_frames_found', { mode: 'boolean' }).default(false),
  syncOffsetMs: integer('sync_offset_ms').default(0),
  hookGrade: text('hook_grade').default('A'),
  recommendationsJson: text('recommendations_json'),
  generatedAt: text('generated_at').notNull(),
});

export const exportJobs = sqliteTable('export_jobs', {
  id: text('id').primaryKey(),
  clipId: text('clip_id').notNull(),
  platform: text('platform').notNull(), // youtube_shorts, instagram_reels, tiktok
  status: text('status').default('pending'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
});

export const exportFiles = sqliteTable('export_files', {
  id: text('id').primaryKey(),
  exportJobId: text('export_job_id').notNull(),
  platform: text('platform').notNull(),
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  tags: text('tags').notNull(),
  downloadUrl: text('download_url').notNull(),
  createdAt: text('created_at').notNull(),
});

export const userSettings = sqliteTable('user_settings', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().unique(),
  defaultCropMode: text('default_crop_mode').default('center_action'),
  defaultMusicGenre: text('default_music_genre').default('phonk'),
  autoDuckingDb: real('auto_ducking_db').default(-16.0),
  defaultResolution: text('default_resolution').default('1080x1920'),
  geminiApiKeyConfigured: integer('gemini_api_key_configured', { mode: 'boolean' }).default(true),
  updatedAt: text('updated_at').notNull(),
});

// --- SOCIAL MEDIA PUBLISHING & SCHEDULING (PARTS 7, 8, 9, 10, 11, 12) ---

export const connectedSocialAccounts = sqliteTable('connected_social_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  platform: text('platform').notNull(), // youtube, instagram, tiktok
  accountName: text('account_name').notNull(),
  accountId: text('account_id').notNull(),
  profileImageUrl: text('profile_image_url'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').notNull(),
});

export const socialOauthTokens = sqliteTable('social_oauth_tokens', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  platform: text('platform').notNull(),
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  refreshTokenEncrypted: text('refresh_token_encrypted'),
  tokenType: text('token_type').default('Bearer'),
  scope: text('scope').notNull(),
  expiresAt: text('expires_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const scheduledPosts = sqliteTable('scheduled_posts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  projectId: text('project_id').notNull(),
  exportFileId: text('export_file_id').notNull(),
  platform: text('platform').notNull(), // youtube_shorts, instagram_reels, tiktok
  connectedAccountId: text('connected_account_id').notNull(),
  scheduledAt: text('scheduled_at').notNull(),
  timezone: text('timezone').default('Asia/Kolkata'),
  status: text('status').default('SCHEDULED'), // DRAFT, SCHEDULED, PROCESSING, PUBLISHED, FAILED, CANCELLED
  platformPostId: text('platform_post_id'),
  publishedUrl: text('published_url'),
  retryCount: integer('retry_count').default(0),
  lastError: text('last_error'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const publishingJobs = sqliteTable('publishing_jobs', {
  id: text('id').primaryKey(),
  scheduledPostId: text('scheduled_post_id').notNull(),
  platform: text('platform').notNull(),
  status: text('status').default('pending'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  error: text('error'),
});

export const publishingAttempts = sqliteTable('publishing_attempts', {
  id: text('id').primaryKey(),
  scheduledPostId: text('scheduled_post_id').notNull(),
  attemptNumber: integer('attempt_number').notNull(),
  responsePayload: text('response_payload'),
  errorMessage: text('error_message'),
  attemptedAt: text('attempted_at').notNull(),
});

export const platformUploadSessions = sqliteTable('platform_upload_sessions', {
  id: text('id').primaryKey(),
  exportFileId: text('export_file_id').notNull(),
  platform: text('platform').notNull(),
  uploadUrl: text('upload_url').notNull(),
  bytesUploaded: integer('bytes_uploaded').default(0),
  totalBytes: integer('total_bytes').notNull(),
  status: text('status').default('active'),
  expiresAt: text('expires_at').notNull(),
});

export const publishingAnalytics = sqliteTable('publishing_analytics', {
  id: text('id').primaryKey(),
  scheduledPostId: text('scheduled_post_id').notNull(),
  platform: text('platform').notNull(),
  views: integer('views').default(0),
  likes: integer('likes').default(0),
  shares: integer('shares').default(0),
  comments: integer('comments').default(0),
  syncedAt: text('synced_at').notNull(),
});

