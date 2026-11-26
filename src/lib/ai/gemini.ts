import fs from 'node:fs';
import { Readable } from 'node:stream';

/**
 * Minimal Gemini API client (Files API + generateContent with JSON schema output).
 * Gemini is used because it accepts audio and video directly, which the analysis agents need.
 * The API key is read from GEMINI_API_KEY and is never logged.
 */

const BASE = 'https://generativelanguage.googleapis.com';

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function geminiModel(): string {
  // The "-latest" alias follows Google's current Flash model, so a model retirement does not silently disable
  // the AI agents (gemini-2.5-flash was retired for new keys). Pin a specific model with GEMINI_MODEL if needed.
  return process.env.GEMINI_MODEL || 'gemini-flash-latest';
}

function key(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('GEMINI_API_KEY is not configured.');
  return k;
}

export class GeminiError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

async function call(url: string, init: RequestInit & { duplex?: 'half' }, timeoutMs: number): Promise<Response> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) } as any);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      msg = (await res.json()).error?.message || msg;
    } catch {}
    throw new GeminiError(`Gemini API: ${msg}`, res.status, res.status === 429 || res.status >= 500);
  }
  return res;
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      last = err;
      const retryable = err instanceof GeminiError ? err.retryable : err?.name === 'TimeoutError' || /fetch failed|ECONNRESET|ETIMEDOUT/i.test(String(err?.message));
      if (!retryable || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** i + Math.random() * 1000));
    }
  }
  throw last;
}

export interface UploadedFile { name: string; uri: string; mimeType: string }

/** Resumable upload of a local file, then wait until Gemini has processed it (state ACTIVE). */
export async function uploadFile(filePath: string, mimeType: string, displayName: string): Promise<UploadedFile> {
  const size = fs.statSync(filePath).size;
  const start = await withRetry(() =>
    call(`${BASE}/upload/v1beta/files`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': key(),
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(size),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    }, 30000)
  );
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new GeminiError('Gemini did not return an upload URL.', 500, true);

  const res = await withRetry(() =>
    call(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Length': String(size), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
      body: Readable.toWeb(fs.createReadStream(filePath)) as any,
      duplex: 'half',
    }, 30 * 60 * 1000), 2
  );
  let file = (await res.json()).file;

  const deadline = Date.now() + 15 * 60 * 1000;
  while (file.state === 'PROCESSING') {
    if (Date.now() > deadline) throw new GeminiError('Gemini took too long to process the uploaded media.', 504, true);
    await new Promise((r) => setTimeout(r, 3000));
    file = await (await withRetry(() => call(`${BASE}/v1beta/${file.name}`, { headers: { 'x-goog-api-key': key() } }, 30000))).json();
  }
  if (file.state !== 'ACTIVE') throw new GeminiError(`Gemini could not process the media (state ${file.state}).`, 422, false);
  return { name: file.name, uri: file.uri, mimeType: file.mimeType || mimeType };
}

export async function deleteFile(name: string): Promise<void> {
  try {
    await call(`${BASE}/v1beta/${name}`, { method: 'DELETE', headers: { 'x-goog-api-key': key() } }, 20000);
  } catch (err: any) {
    console.error(`[Gemini] Could not delete uploaded file ${name}: ${err.message}`);
  }
}

export type Part = { text: string } | { fileData: { mimeType: string; fileUri: string } };

/** generateContent constrained to a JSON schema; returns the parsed object. */
export async function generateJson<T>(opts: {
  parts: Part[];
  schema: any;
  system?: string;
  mediaResolution?: 'MEDIA_RESOLUTION_LOW' | 'MEDIA_RESOLUTION_MEDIUM';
  temperature?: number;
  timeoutMs?: number;
}): Promise<T> {
  const body: any = {
    contents: [{ role: 'user', parts: opts.parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: opts.schema,
      temperature: opts.temperature ?? 0.2,
      maxOutputTokens: 32768,
    },
  };
  if (opts.mediaResolution) body.generationConfig.mediaResolution = opts.mediaResolution;
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };

  return withRetry(async () => {
    const res = await call(`${BASE}/v1beta/models/${geminiModel()}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, opts.timeoutMs ?? 10 * 60 * 1000);
    const j = await res.json();
    const cand = j.candidates?.[0];
    const text = (cand?.content?.parts || []).map((p: any) => p.text || '').join('');
    if (!text) {
      const reason = cand?.finishReason || j.promptFeedback?.blockReason || 'empty response';
      throw new GeminiError(`Gemini returned no content (${reason}).`, 502, reason === 'empty response');
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new GeminiError(`Gemini returned malformed JSON (finish reason ${cand?.finishReason}).`, 502, true);
    }
  }, 3);
}
