import pg from 'pg';
const { Pool } = pg;

/**
 * PostgreSQL durability layer.
 *
 * The application reads and writes a local SQLite file (fast, synchronous). On Railway that file lives on an
 * ephemeral container filesystem, so PostgreSQL is the durable copy:
 *   - every SQLite mutation is translated to PostgreSQL dialect and replayed IN ORDER (replicateToPostgres)
 *   - on boot the SQLite file is hydrated from PostgreSQL exactly once per process (hydrateSQLiteFromPostgres)
 *   - the PostgreSQL schema is kept in step with SQLite automatically (ensurePostgresSchema)
 *
 * Previously mutations were sent verbatim ("INSERT OR REPLACE", "datetime('now')"), which PostgreSQL rejects,
 * so OAuth tokens and clips never reached the durable store and were lost on every redeploy.
 */

export function resolvePostgresUrl(rawUrl?: string): string | null {
  // POSTGRES_DISABLED=true forces SQLite-only (local runs: .env's DATABASE_URL points at production).
  if (!rawUrl && process.env.POSTGRES_DISABLED === 'true') return null;
  const url = rawUrl || process.env.DATABASE_URL;
  if (!url) return null;
  // Outside Railway the private hostname is unreachable; use the public TCP proxy if one is configured.
  const isInsideRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_ID);
  if (!isInsideRailway && url.includes('.railway.internal') && process.env.DATABASE_PUBLIC_URL) {
    return process.env.DATABASE_PUBLIC_URL;
  }
  return url;
}

let pool: pg.Pool | null = null;

export function getPostgresPool(): pg.Pool | null {
  const connectionString = resolvePostgresUrl();
  if (!connectionString) return null;
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      keepAlive: true,
    });
    pool.on('error', (err) => console.warn('[PostgreSQL] Idle client error:', err.message));
  }
  return pool;
}

export async function testPostgresConnection(): Promise<{ connected: boolean; version?: string; error?: string }> {
  const p = getPostgresPool();
  if (!p) return { connected: false, error: 'DATABASE_URL is not configured' };
  try {
    const res = await p.query('SELECT version() as version');
    return { connected: true, version: res.rows[0]?.version };
  } catch (err: any) {
    return { connected: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------------------------
// Dialect translation
// ---------------------------------------------------------------------------------------------

export type PrimaryKeyLookup = (table: string) => string[];

export function convertPlaceholders(sql: string): string {
  let index = 1;
  let inString = false;
  let out = '';
  for (const ch of sql) {
    if (ch === "'") inString = !inString;
    if (ch === '?' && !inString) out += `$${index++}`;
    else out += ch;
  }
  return out;
}

/** Translate one SQLite mutation statement into PostgreSQL. Exported for tests. */
export function translateSqliteToPostgres(sql: string, pkOf: PrimaryKeyLookup): string {
  let s = sql.trim().replace(/;\s*$/, '');

  s = s.replace(/datetime\(\s*'now'\s*\)/gi, 'CURRENT_TIMESTAMP');

  const orReplace = /^INSERT\s+OR\s+REPLACE\s+INTO\s+([a-zA-Z_][\w]*)\s*\(([^)]*)\)/i.exec(s);
  if (orReplace) {
    const table = orReplace[1];
    const cols = orReplace[2].split(',').map((c) => c.trim()).filter(Boolean);
    const pk = pkOf(table);
    s = s.replace(/^INSERT\s+OR\s+REPLACE\s+INTO/i, 'INSERT INTO');
    if (pk.length) {
      const updates = cols.filter((c) => !pk.includes(c)).map((c) => `${c} = EXCLUDED.${c}`);
      s += updates.length
        ? ` ON CONFLICT (${pk.join(', ')}) DO UPDATE SET ${updates.join(', ')}`
        : ` ON CONFLICT (${pk.join(', ')}) DO NOTHING`;
    }
  } else if (/^INSERT\s+OR\s+IGNORE\s+INTO/i.test(s)) {
    s = s.replace(/^INSERT\s+OR\s+IGNORE\s+INTO/i, 'INSERT INTO') + ' ON CONFLICT DO NOTHING';
  }

  return convertPlaceholders(s);
}

// ---------------------------------------------------------------------------------------------
// Ordered replication queue
// ---------------------------------------------------------------------------------------------

const G = globalThis as any;
G.__pgReplicationChain = G.__pgReplicationChain || Promise.resolve();
G.__pgReplicationStats = G.__pgReplicationStats || { ok: 0, failed: 0, lastError: null as string | null };

export function getReplicationStats() {
  return { ...G.__pgReplicationStats };
}

/** Queue a mutation for PostgreSQL. Statements run strictly in submission order on one logical lane. */
export function replicateToPostgres(sql: string, params: any[], pkOf: PrimaryKeyLookup) {
  const p = getPostgresPool();
  if (!p) return;
  let pgSql: string;
  try {
    pgSql = translateSqliteToPostgres(sql, pkOf);
  } catch (err: any) {
    console.error('[PostgreSQL] Could not translate statement:', err.message);
    return;
  }
  const values = params.map((v) => (v === undefined ? null : v));
  G.__pgReplicationChain = G.__pgReplicationChain
    .then(() => p.query(pgSql, values))
    .then(() => {
      G.__pgReplicationStats.ok++;
    })
    .catch((err: any) => {
      G.__pgReplicationStats.failed++;
      G.__pgReplicationStats.lastError = err.message;
      // Never log parameter values: they can contain encrypted tokens.
      console.error(`[PostgreSQL] Replication failed: ${err.message} | ${pgSql.slice(0, 120)}`);
    });
}

/** Resolves once every queued mutation has been attempted (used by graceful shutdown and tests). */
export function flushReplication(): Promise<void> {
  return G.__pgReplicationChain;
}

// ---------------------------------------------------------------------------------------------
// Schema mirroring + hydration
// ---------------------------------------------------------------------------------------------

interface SqliteColumn { name: string; type: string; pk: number }

function sqliteTables(db: any): string[] {
  return (db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all() as any[]).map((r) => r.name);
}

function sqliteColumns(db: any, table: string): SqliteColumn[] {
  return db.prepare(`PRAGMA table_info(${table})`).all() as any[];
}

function pgType(sqliteType: string): string {
  const t = (sqliteType || '').toUpperCase();
  if (t.includes('INT')) return 'BIGINT';
  if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB')) return 'DOUBLE PRECISION';
  return 'TEXT';
}

export async function ensurePostgresSchema(db: any): Promise<void> {
  const p = getPostgresPool();
  if (!p) return;
  const existing = await p.query(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()`
  );
  const pgCols = new Map<string, Set<string>>();
  for (const r of existing.rows) {
    if (!pgCols.has(r.table_name)) pgCols.set(r.table_name, new Set());
    pgCols.get(r.table_name)!.add(r.column_name);
  }

  for (const table of sqliteTables(db)) {
    const cols = sqliteColumns(db, table);
    const pk = cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
    try {
      if (!pgCols.has(table)) {
        const defs = cols.map((c) => `${c.name} ${pgType(c.type)}`);
        if (pk.length) defs.push(`PRIMARY KEY (${pk.join(', ')})`);
        await p.query(`CREATE TABLE IF NOT EXISTS ${table} (${defs.join(', ')})`);
      } else {
        const have = pgCols.get(table)!;
        for (const c of cols) {
          if (!have.has(c.name)) await p.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${c.name} ${pgType(c.type)}`);
        }
      }
      // Mirror UNIQUE indexes so SQLite "ON CONFLICT(cols)" upserts are valid in PostgreSQL too.
      const indexes = db.prepare(`PRAGMA index_list(${table})`).all() as any[];
      for (const idx of indexes) {
        if (!idx.unique || idx.origin === 'pk') continue;
        const idxCols = (db.prepare(`PRAGMA index_info(${idx.name})`).all() as any[]).map((r) => r.name);
        const name = `${table}_${idxCols.join('_')}_uniq`.slice(0, 63);
        try {
          await p.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${name} ON ${table} (${idxCols.join(', ')})`);
        } catch (err: any) {
          console.error(`[PostgreSQL] Unique index ${name} could not be created: ${err.message}`);
        }
      }
    } catch (err: any) {
      console.error(`[PostgreSQL] Schema sync for ${table} failed: ${err.message}`);
    }
  }
}

function toSqliteValue(v: any): any {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'bigint') return Number(v);
  if (Buffer.isBuffer(v)) return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

/** Copy every durable row from PostgreSQL into the local SQLite file. Returns rows restored per table. */
export async function hydrateSQLiteFromPostgres(db: any): Promise<Record<string, number>> {
  const p = getPostgresPool();
  const restored: Record<string, number> = {};
  if (!p) return restored;

  for (const table of sqliteTables(db)) {
    const localCols = new Set(sqliteColumns(db, table).map((c) => c.name));
    let rows: any[];
    try {
      rows = (await p.query(`SELECT * FROM ${table}`)).rows;
    } catch {
      continue; // table not yet in PostgreSQL
    }
    if (!rows.length) continue;
    let n = 0;
    for (const row of rows) {
      const keys = Object.keys(row).filter((k) => localCols.has(k));
      if (!keys.length) continue;
      try {
        db.prepare(`INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
          .run(...keys.map((k) => toSqliteValue(row[k])));
        n++;
      } catch (err: any) {
        console.error(`[PostgreSQL] Hydration of a ${table} row failed: ${err.message}`);
      }
    }
    restored[table] = n;
  }
  return restored;
}
