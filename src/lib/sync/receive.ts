import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { NextResponse } from 'next/server';
import { checkSyncToken, syncTokenConfigured } from './sync-core.ts';

const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 8 * 1024 ** 3);

/** Returns a response to send if the caller is not an authorised PC helper, otherwise null. */
export function rejectUnlessSyncAuthorized(req: Request): NextResponse | null {
  if (!syncTokenConfigured()) {
    return NextResponse.json({ error: 'PC sync is not enabled on this server (set SYNC_TOKEN, at least 24 characters).' }, { status: 503 });
  }
  if (!checkSyncToken(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Invalid sync token.' }, { status: 401 });
  }
  return null;
}

/**
 * Stream a request body to `dest` without buffering it in memory. The file only appears at `dest` once complete
 * (written to a sibling temp file, then renamed), so a broken connection never leaves a truncated file behind.
 */
export async function receiveBodyToFile(req: Request, dest: string): Promise<number> {
  if (!req.body) throw new Error('No file received.');
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) throw new Error(`The file is larger than the ${(MAX_BYTES / 1024 ** 3).toFixed(0)} GB limit.`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.incoming-${process.pid}-${Date.now()}`;
  let received = 0;
  try {
    const source = Readable.fromWeb(req.body as any);
    source.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > MAX_BYTES) source.destroy(new Error('File exceeds the upload limit.'));
    });
    await pipeline(source, fs.createWriteStream(tmp));
    if (declared && received !== declared) throw new Error(`Upload incomplete: received ${received} of ${declared} bytes.`);
    fs.renameSync(tmp, dest);
    return received;
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}
