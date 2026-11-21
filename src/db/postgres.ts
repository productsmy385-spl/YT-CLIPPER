import pg from 'pg';
const { Pool } = pg;

// Resolve connection URL: if user runs locally with internal domain, automatically map to public TCP proxy
export function resolvePostgresUrl(rawUrl?: string): string | null {
  const url = rawUrl || process.env.DATABASE_URL;
  if (!url) return null;

  // If running outside Railway container and URL has .railway.internal, swap to public proxy
  const isInsideRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_ID);
  if (!isInsideRailway && url.includes('postgres.railway.internal:5432')) {
    return url.replace('postgres.railway.internal:5432', 'metro.proxy.rlwy.net:28566');
  }
  return url;
}

let pool: pg.Pool | null = null;
let isConnected = false;

export function getPostgresPool(): pg.Pool | null {
  const connectionString = resolvePostgresUrl();
  if (!connectionString) return null;

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.warn('[PostgreSQL] Unexpected pool error:', err.message);
      isConnected = false;
    });
  }

  return pool;
}

export async function testPostgresConnection(): Promise<{ connected: boolean; version?: string; error?: string }> {
  const p = getPostgresPool();
  if (!p) return { connected: false, error: 'DATABASE_URL is not configured' };

  try {
    const res = await p.query('SELECT version() as version, NOW() as server_time');
    isConnected = true;
    return {
      connected: true,
      version: res.rows[0]?.version,
    };
  } catch (err: any) {
    isConnected = false;
    return { connected: false, error: err.message };
  }
}

/**
 * Convert SQLite '?' parameter placeholders to PostgreSQL '$1, $2, $3...'
 */
export function convertPlaceholders(sql: string): string {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

/**
 * Execute a query against PostgreSQL with automatic placeholder conversion
 */
export async function queryPostgres(sql: string, params: any[] = []): Promise<any> {
  const p = getPostgresPool();
  if (!p) return null;

  const pgSql = convertPlaceholders(sql);
  try {
    const res = await p.query(pgSql, params);
    return res.rows;
  } catch (err: any) {
    console.error(`[PostgreSQL] Query failed: ${err.message}\nSQL: ${pgSql}`);
    throw err;
  }
}

/**
 * Async replication helper: replicates an INSERT / UPDATE / DELETE to PostgreSQL without blocking the main thread
 */
export function replicateToPostgres(sql: string, params: any[] = []) {
  const p = getPostgresPool();
  if (!p) return;

  const pgSql = convertPlaceholders(sql);

  // Background execution with error catching so local workflow never breaks
  p.query(pgSql, params).catch((err: any) => {
    // Ignore minor duplicate key notes
    if (!err.message?.includes('duplicate key') && !err.message?.includes('already exists')) {
      console.warn(`[PostgreSQL Replicate] Note: ${err.message} (SQL: ${pgSql.slice(0, 80)}...)`);
    }
  });
}

/**
 * Synchronize local SQLite state with remote PostgreSQL on boot
 */
export async function syncSQLiteFromPostgres(rawDb: any) {
  const p = getPostgresPool();
  if (!p) return;

  console.log('[PostgreSQL] Hydrating application state from PostgreSQL cloud database...');

  const tables = [
    'users',
    'projects',
    'source_videos',
    'detected_highlights',
    'generated_clips',
    'editing_jobs',
    'connected_social_accounts',
    'social_oauth_tokens',
    'scheduled_posts',
    'export_files',
  ];

  for (const table of tables) {
    try {
      const res = await p.query(`SELECT * FROM ${table}`);
      if (res.rows && res.rows.length > 0) {
        console.log(`[PostgreSQL] Syncing ${res.rows.length} records from '${table}' into local engine...`);
        for (const row of res.rows) {
          const keys = Object.keys(row);
          const placeholders = keys.map(() => '?').join(', ');
          const values = Object.values(row);
          try {
            rawDb.prepare(`INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`).run(...values);
          } catch {}
        }
      }
    } catch (err: any) {
      // Table might not exist yet or be empty
    }
  }

  console.log('[PostgreSQL] ✓ Cloud state synchronization complete.');
}
