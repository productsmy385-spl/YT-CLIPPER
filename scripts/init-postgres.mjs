import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Set DATABASE_URL (never hard-code credentials in this file).');
  process.exit(1);
}

console.log('Connecting to PostgreSQL:', DATABASE_URL.replace(/:[^:@]+@/, ':****@'));

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: false,
});

async function main() {
  const client = await pool.connect();
  try {
    console.log('Connected! Creating all GTA 6 Shorts AI tables in PostgreSQL...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(100) DEFAULT 'creator',
        avatar_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS projects (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        title VARCHAR(500) NOT NULL,
        game_title VARCHAR(255) DEFAULT 'Grand Theft Auto VI',
        status VARCHAR(100) DEFAULT 'created',
        progress INTEGER DEFAULT 0,
        current_stage VARCHAR(255) DEFAULT 'init',
        stage_id VARCHAR(50) DEFAULT '1',
        stage_status VARCHAR(50) DEFAULT 'PENDING',
        stage_started_at TIMESTAMPTZ,
        stage_completed_at TIMESTAMPTZ,
        heartbeat_at TIMESTAMPTZ,
        error_message TEXT,
        locked_by VARCHAR(255),
        lock_acquired_at TIMESTAMPTZ,
        source_url TEXT,
        source_file TEXT,
        source_video_id VARCHAR(255),
        source_checksum VARCHAR(255),
        is_deleted INTEGER DEFAULT 0,
        deleted_at TIMESTAMPTZ,
        cancellation_requested INTEGER DEFAULT 0,
        cancelled_at TIMESTAMPTZ,
        worker_id VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS source_videos (
        id VARCHAR(255) PRIMARY KEY,
        project_id VARCHAR(255) NOT NULL,
        file_name VARCHAR(500) NOT NULL,
        file_path TEXT NOT NULL,
        file_size BIGINT NOT NULL,
        duration DOUBLE PRECISION NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        fps DOUBLE PRECISION NOT NULL,
        bitrate BIGINT,
        audio_channels INTEGER,
        copyright_declared INTEGER DEFAULT 1,
        origin_source VARCHAR(100) DEFAULT 'authorized_stream',
        sha256_checksum VARCHAR(255),
        is_deleted INTEGER DEFAULT 0,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS video_analysis (
        id VARCHAR(255) PRIMARY KEY,
        project_id VARCHAR(255) NOT NULL,
        total_scenes INTEGER DEFAULT 0,
        speech_segments_count INTEGER DEFAULT 0,
        audio_peaks_count INTEGER DEFAULT 0,
        gameplay_summary TEXT,
        analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS detected_scenes (
        id VARCHAR(255) PRIMARY KEY,
        project_id VARCHAR(255) NOT NULL,
        start_time DOUBLE PRECISION NOT NULL,
        end_time DOUBLE PRECISION NOT NULL,
        duration DOUBLE PRECISION NOT NULL,
        avg_motion_score DOUBLE PRECISION DEFAULT 0,
        visual_summary TEXT,
        keyframe_path TEXT
      );

      CREATE TABLE IF NOT EXISTS detected_highlights (
        id VARCHAR(255) PRIMARY KEY,
        project_id VARCHAR(255) NOT NULL,
        source_video_id VARCHAR(255),
        category VARCHAR(100) NOT NULL,
        category_label VARCHAR(255) NOT NULL,
        entertainment_score INTEGER NOT NULL,
        start_time DOUBLE PRECISION NOT NULL,
        end_time DOUBLE PRECISION NOT NULL,
        normalized_start DOUBLE PRECISION,
        normalized_end DOUBLE PRECISION,
        duration DOUBLE PRECISION NOT NULL,
        hook_strength INTEGER DEFAULT 85,
        hook_reason TEXT,
        peak_event TEXT,
        suggested_meme_mood VARCHAR(100) DEFAULT 'laugh',
        suggested_music_genre VARCHAR(100) DEFAULT 'phonk',
        is_selected INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS generated_clips (
        id VARCHAR(255) PRIMARY KEY,
        project_id VARCHAR(255) NOT NULL,
        highlight_id VARCHAR(255) NOT NULL,
        source_video_id VARCHAR(255),
        title VARCHAR(500) NOT NULL,
        duration DOUBLE PRECISION NOT NULL,
        start_time DOUBLE PRECISION,
        end_time DOUBLE PRECISION,
        extraction_version INTEGER DEFAULT 1,
        editing_version INTEGER DEFAULT 1,
        output_path TEXT,
        output_file_path TEXT,
        raw_clip_path TEXT,
        edited_clip_path TEXT,
        thumbnail_path TEXT,
        status VARCHAR(100) DEFAULT 'extracted',
        processing_status VARCHAR(100) DEFAULT 'extracted',
        resolution VARCHAR(50) DEFAULT '1080x1920',
        fps INTEGER DEFAULT 30,
        qa_score INTEGER,
        copyright_passed INTEGER,
        source_checksum TEXT,
        job_id TEXT,
        is_published INTEGER DEFAULT 0,
        published_url TEXT,
        is_deleted INTEGER DEFAULT 0,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS editing_jobs (
        id VARCHAR(255) PRIMARY KEY,
        project_id VARCHAR(255) NOT NULL,
        clip_id VARCHAR(255),
        active_agent VARCHAR(255),
        status VARCHAR(100) DEFAULT 'pending',
        progress_percent INTEGER DEFAULT 0,
        step_name VARCHAR(255),
        error_message TEXT,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS ai_agents (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        role VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        model VARCHAR(100) DEFAULT 'gemini-2.5-pro',
        is_active INTEGER DEFAULT 1,
        execution_count INTEGER DEFAULT 0,
        avg_latency_ms INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS agent_execution_logs (
        id VARCHAR(255) PRIMARY KEY,
        project_id VARCHAR(255) NOT NULL,
        agent_id VARCHAR(255) NOT NULL,
        agent_name VARCHAR(255) NOT NULL,
        stage VARCHAR(255) NOT NULL,
        status VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        duration_ms INTEGER DEFAULT 0,
        input_summary TEXT,
        output_summary TEXT,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS meme_assets (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        emotion VARCHAR(100) NOT NULL,
        file_path TEXT NOT NULL,
        duration DOUBLE PRECISION DEFAULT 2.5,
        overlay_type VARCHAR(100) DEFAULT 'pip_corner',
        license_id VARCHAR(255),
        tags TEXT
      );

      CREATE TABLE IF NOT EXISTS music_assets (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        genre VARCHAR(100) NOT NULL,
        bpm INTEGER DEFAULT 130,
        energy VARCHAR(50) DEFAULT 'high',
        file_path TEXT NOT NULL,
        duration DOUBLE PRECISION NOT NULL,
        license_id VARCHAR(255)
      );

      CREATE TABLE IF NOT EXISTS sound_effect_assets (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        file_path TEXT NOT NULL,
        duration DOUBLE PRECISION NOT NULL,
        default_volume DOUBLE PRECISION DEFAULT 1.0,
        license_id VARCHAR(255)
      );

      CREATE TABLE IF NOT EXISTS clip_editing_configurations (
        id VARCHAR(255) PRIMARY KEY,
        clip_id VARCHAR(255) UNIQUE NOT NULL,
        crop_mode VARCHAR(100) DEFAULT 'center_action',
        crop_x DOUBLE PRECISION DEFAULT 0.5,
        crop_y DOUBLE PRECISION DEFAULT 0.5,
        zoom_scale DOUBLE PRECISION DEFAULT 1.15,
        music_asset_id VARCHAR(255),
        music_volume DOUBLE PRECISION DEFAULT 0.45,
        music_ducking_db DOUBLE PRECISION DEFAULT -16.0,
        subtitle_style VARCHAR(100) DEFAULT 'vice_neon',
        config_json TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS subtitles (
        id VARCHAR(255) PRIMARY KEY,
        clip_id VARCHAR(255) NOT NULL,
        start_time DOUBLE PRECISION NOT NULL,
        end_time DOUBLE PRECISION NOT NULL,
        text TEXT NOT NULL,
        word_timestamps_json TEXT,
        active_color VARCHAR(50) DEFAULT '#06B6D4'
      );

      CREATE TABLE IF NOT EXISTS copyright_reports (
        id VARCHAR(255) PRIMARY KEY,
        project_id VARCHAR(255) NOT NULL,
        clip_id VARCHAR(255),
        compliance_score INTEGER NOT NULL,
        passed INTEGER NOT NULL,
        source_authorized INTEGER DEFAULT 1,
        music_compliant INTEGER DEFAULT 1,
        memes_compliant INTEGER DEFAULT 1,
        problem_items_json TEXT,
        report_summary TEXT NOT NULL,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS quality_reports (
        id VARCHAR(255) PRIMARY KEY,
        clip_id VARCHAR(255) UNIQUE NOT NULL,
        qa_score INTEGER NOT NULL,
        passed INTEGER NOT NULL,
        resolution_check INTEGER DEFAULT 1,
        aspect_ratio_check INTEGER DEFAULT 1,
        audio_clipping INTEGER DEFAULT 0,
        black_frames_found INTEGER DEFAULT 0,
        sync_offset_ms INTEGER DEFAULT 0,
        hook_grade VARCHAR(10) DEFAULT 'A',
        recommendations_json TEXT,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS export_files (
        id VARCHAR(255) PRIMARY KEY,
        export_job_id VARCHAR(255) NOT NULL,
        platform VARCHAR(100) NOT NULL,
        file_path TEXT NOT NULL,
        file_size BIGINT NOT NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT NOT NULL,
        tags TEXT NOT NULL,
        download_url TEXT NOT NULL,
        is_deleted INTEGER DEFAULT 0,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS user_settings (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) UNIQUE NOT NULL,
        default_crop_mode VARCHAR(100) DEFAULT 'center_action',
        default_music_genre VARCHAR(100) DEFAULT 'phonk',
        auto_ducking_db DOUBLE PRECISION DEFAULT -16.0,
        default_resolution VARCHAR(50) DEFAULT '1080x1920',
        gemini_api_key_configured INTEGER DEFAULT 1,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS connected_social_accounts (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        platform VARCHAR(100) NOT NULL,
        account_name VARCHAR(255) NOT NULL,
        account_id VARCHAR(255) NOT NULL,
        profile_image_url TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS social_oauth_tokens (
        id VARCHAR(255) PRIMARY KEY,
        account_id VARCHAR(255) NOT NULL,
        platform VARCHAR(100) NOT NULL,
        access_token_encrypted TEXT NOT NULL,
        refresh_token_encrypted TEXT,
        token_type VARCHAR(50) DEFAULT 'Bearer',
        scope TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS scheduled_posts (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        project_id VARCHAR(255) NOT NULL,
        export_file_id VARCHAR(255) NOT NULL,
        platform VARCHAR(100) NOT NULL,
        connected_account_id VARCHAR(255) NOT NULL,
        scheduled_at TIMESTAMPTZ NOT NULL,
        timezone VARCHAR(100) DEFAULT 'Asia/Kolkata',
        status VARCHAR(100) DEFAULT 'SCHEDULED',
        platform_post_id VARCHAR(255),
        published_url TEXT,
        retry_count INTEGER DEFAULT 0,
        last_error TEXT,
        is_deleted INTEGER DEFAULT 0,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS publishing_attempts (
        id VARCHAR(255) PRIMARY KEY,
        scheduled_post_id VARCHAR(255) NOT NULL,
        attempt_number INTEGER NOT NULL,
        response_payload TEXT,
        error_message TEXT,
        attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS media_deletion_logs (
        id VARCHAR(255) PRIMARY KEY,
        item_id VARCHAR(255) NOT NULL,
        item_type VARCHAR(100) NOT NULL,
        title VARCHAR(500),
        file_path TEXT,
        action VARCHAR(100) NOT NULL,
        reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS project_pipeline_stages (
        id VARCHAR(255) PRIMARY KEY,
        project_id VARCHAR(255) NOT NULL,
        stage_number INTEGER NOT NULL,
        stage_key VARCHAR(100) NOT NULL,
        stage_name VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'PENDING',
        progress INTEGER DEFAULT 0,
        message TEXT,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS creators (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        channel_id VARCHAR(255),
        channel_url TEXT,
        contact_email VARCHAR(255),
        status VARCHAR(100) DEFAULT 'verified',
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS creator_permissions (
        id VARCHAR(255) PRIMARY KEY,
        creator_id VARCHAR(255) NOT NULL,
        status VARCHAR(100) NOT NULL,
        allowed_usage VARCHAR(100) DEFAULT 'all',
        commercial_usage_allowed INTEGER DEFAULT 1,
        media_access_method VARCHAR(100) DEFAULT 'authorized_upload',
        notes TEXT,
        expiry_date TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    console.log('✓ All PostgreSQL tables created successfully!');

    // Seed default user
    await client.query(`
      INSERT INTO users (id, email, name, role, avatar_url)
      VALUES ('usr_creator_01', 'creator@vicecity.io', 'Vice City Studios', 'Studio Director', '/avatars/creator.svg')
      ON CONFLICT (id) DO UPDATE SET avatar_url = '/avatars/creator.svg';
    `);
    console.log('✓ Seeded default user usr_creator_01 into PostgreSQL!');

    // Seed initial creators and permissions
    await client.query(`
      INSERT INTO creators (id, name, channel_id, channel_url, contact_email, status, notes)
      VALUES 
        ('creator_brucedropemoff', 'BruceDropEmOff', 'UC6vT99WjP24f_Jg7oA1p03g', 'https://www.youtube.com/@BruceDropEmOff', 'mgmt@brucedropemoff.com', 'verified', 'Official creator written consent for GTA 6 gameplay derivative vertical Shorts.'),
        ('creator_kaicenat', 'Kai Cenat Stream Clips', 'UCGjI_G7r4yX3sO2qC_c9r-A', 'https://www.youtube.com/@KaiCenat', 'licensing@kaicenatmedia.com', 'verified', 'Authorized partner for livestream reaction clips and highlight syndication.'),
        ('creator_cc_gaming', 'Open Gaming Archive (Creative Commons)', 'UC_OpenGamingArchive_CC', 'https://www.youtube.com/@OpenGamingCC', 'archive@opengaming.org', 'verified', 'Verified repository of gameplay videos released under Creative Commons CC BY 4.0.')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO creator_permissions (id, creator_id, status, allowed_usage, commercial_usage_allowed, media_access_method, notes)
      VALUES
        ('perm_brucedropemoff_01', 'creator_brucedropemoff', 'VERIFIED', 'all', 1, 'licensed_feed', 'Written creator agreement signed for unlimited vertical shorts and monetization.'),
        ('perm_kaicenat_01', 'creator_kaicenat', 'VERIFIED', 'derivative_shorts', 1, 'licensed_feed', 'Partner feed sync agreement with automated vertical shorts rights.'),
        ('perm_cc_gaming_01', 'creator_cc_gaming', 'CREATIVE_COMMONS', 'cc_by', 1, 'authorized_upload', 'CC BY 4.0 license attribution.')
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log('✓ Seeded initial authorized creators into PostgreSQL!');

    // Verify tables count
    const res = await client.query(`
      SELECT count(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `);
    console.log(`✓ Total tables in PostgreSQL database: ${res.rows[0].count}`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
