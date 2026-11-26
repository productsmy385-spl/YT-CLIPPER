export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { STORAGE_DIR } from '@/lib/app-paths';
import { getReplicationStats, getPostgresPool } from '@/db/postgres';
import { geminiConfigured } from '@/lib/ai/gemini';

/** Liveness + configuration report for Railway and operators. Never includes secrets. */
export async function GET() {
  const ffmpeg = spawnSync(process.env.FFMPEG || 'ffmpeg', ['-version'], { encoding: 'utf8', timeout: 5000 });
  let writable = true;
  try {
    fs.accessSync(STORAGE_DIR, fs.constants.W_OK);
  } catch {
    writable = false;
  }
  const worker = (globalThis as any).__gta6Worker;
  const body = {
    ok: ffmpeg.status === 0 && writable,
    ffmpeg: ffmpeg.status === 0 ? ffmpeg.stdout.split('\n')[0] : 'missing',
    storage: { writable, persistentVolume: Boolean(process.env.RAILWAY_VOLUME_MOUNT_PATH) || !process.env.RAILWAY_ENVIRONMENT },
    database: { durableCopy: Boolean(getPostgresPool()), replication: getReplicationStats() },
    ai: { gemini: geminiConfigured() },
    youtube: { oauthConfigured: Boolean(process.env.GOOGLE_CLIENT_ID), encryptionKeySet: Boolean(process.env.TOKEN_ENCRYPTION_KEY) },
    worker: worker ? { id: worker.workerId, runningJobs: worker.running.size } : null,
  };
  return NextResponse.json(body, { status: body.ok ? 200 : 503 });
}
