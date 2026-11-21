export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { testPostgresConnection, getPostgresPool, resolvePostgresUrl } from '@/db/postgres';

export async function GET() {
  const resolvedUrl = resolvePostgresUrl();
  const isConfigured = Boolean(resolvedUrl);

  if (!isConfigured) {
    return NextResponse.json({
      success: true,
      engine: 'SQLite (Local Fallback)',
      postgresConfigured: false,
      message: 'PostgreSQL is not configured. Running on local SQLite engine.',
    });
  }

  const start = Date.now();
  const testRes = await testPostgresConnection();
  const latencyMs = Date.now() - start;

  if (!testRes.connected) {
    return NextResponse.json({
      success: false,
      engine: 'PostgreSQL',
      postgresConfigured: true,
      connected: false,
      error: testRes.error,
      latencyMs,
    }, { status: 503 });
  }

  let tableCount = 0;
  try {
    const pool = getPostgresPool();
    if (pool) {
      const countRes = await pool.query(
        "SELECT count(*) as c FROM information_schema.tables WHERE table_schema = 'public'"
      );
      tableCount = parseInt(countRes.rows[0]?.c || '0', 10);
    }
  } catch {}

  return NextResponse.json({
    success: true,
    engine: 'PostgreSQL',
    postgresConfigured: true,
    connected: true,
    latencyMs,
    version: testRes.version,
    tablesCount: tableCount,
    cloudProvider: 'Railway PostgreSQL',
    status: 'ACTIVE & OPERATIONAL',
  });
}
