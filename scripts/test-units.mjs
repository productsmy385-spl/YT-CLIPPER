// Fast unit tests for pure logic. Run: node --test scripts/test-units.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateSqliteToPostgres, convertPlaceholders } from '../src/db/postgres.ts';
import { totalOutputDuration, sourceToOutput, outputToSource, cuesOnOutput, validateEditDoc, fontForText, CAPTION_PRESETS } from '../src/lib/render/edit-doc.ts';
import { removeDeadAir } from '../src/pipeline/agents/shorts-generation-agent.ts';
import { buildCues, validateCueTiming } from '../src/pipeline/agents/caption-agent.ts';
import { snapBoundaries, excitementCurve } from '../src/pipeline/agents/highlight-detection-agent.ts';
import { wordsFromSegment, cleanTranscriptText } from '../src/pipeline/agents/audio-intelligence-agent.ts';
import { isAuthorized } from '../src/lib/auth-gate.ts';
import { buildAss } from '../src/lib/render/ass.ts';

const pk = (t) => (t === 'social_oauth_tokens' ? ['id'] : t === 'm' ? ['a', 'b'] : []);

test('INSERT OR REPLACE becomes an upsert on the primary key', () => {
  const s = translateSqliteToPostgres('INSERT OR REPLACE INTO social_oauth_tokens (id, account_id, scope) VALUES (?, ?, ?)', pk);
  assert.equal(s, 'INSERT INTO social_oauth_tokens (id, account_id, scope) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET account_id = EXCLUDED.account_id, scope = EXCLUDED.scope');
});
test('INSERT OR IGNORE becomes ON CONFLICT DO NOTHING', () => {
  assert.equal(translateSqliteToPostgres('INSERT OR IGNORE INTO x (a) VALUES (?)', pk), 'INSERT INTO x (a) VALUES ($1) ON CONFLICT DO NOTHING');
});
test("datetime('now') and placeholders", () => {
  assert.equal(translateSqliteToPostgres("UPDATE t SET u = datetime('now') WHERE id = ? AND n = '?'", pk), "UPDATE t SET u = CURRENT_TIMESTAMP WHERE id = $1 AND n = '?'");
  assert.equal(convertPlaceholders('a=? b=?'), 'a=$1 b=$2');
});

const doc = {
  version: 1,
  segments: [{ id: 'a', start: 10, end: 20, speed: 1 }, { id: 'b', start: 40, end: 50, speed: 2 }],
  aspect: '9:16', framing: { mode: 'crop', focusX: 0.5, focusY: 0.5, zoom: 1 }, audio: { sourceVolume: 1, music: null },
  captions: { enabled: true, style: CAPTION_PRESETS.bold_pop, cues: [
    { id: 'c1', start: 12, end: 14, text: 'hi there', words: [{ start: 12, end: 13, text: 'hi' }, { start: 13, end: 14, text: 'there' }] },
    { id: 'c2', start: 25, end: 26, text: 'cut', words: [] },
    { id: 'c3', start: 19, end: 42, text: 'spans cut', words: [] },
  ] },
  texts: [],
};

test('timeline maps source <-> output across cuts and speed', () => {
  assert.equal(totalOutputDuration(doc), 15);
  assert.equal(sourceToOutput(doc, 15), 5);
  assert.equal(sourceToOutput(doc, 44), 12);
  assert.equal(sourceToOutput(doc, 30), null);
  assert.deepEqual(outputToSource(doc, 12)?.source, 44);
});
test('captions on cut sections are dropped; spanning cues are clipped', () => {
  const c = cuesOnOutput(doc);
  assert.equal(c.find((x) => x.id === 'c2'), undefined);
  assert.deepEqual(c.filter((x) => x.id === 'c3').map((x) => [x.outStart, x.outEnd]), [[9, 10], [10, 11]]);
  assert.deepEqual(c.find((x) => x.id === 'c1').words.map((w) => [w.start, w.end]), [[2, 3], [3, 4]]);
});
test('edit validation rejects bad documents', () => {
  assert.deepEqual(validateEditDoc(doc, 100), []);
  assert.ok(validateEditDoc({ ...doc, segments: [{ id: 'x', start: 5, end: 4, speed: 1 }] }, 100).length > 0);
  assert.ok(validateEditDoc({ ...doc, segments: [{ id: 'x', start: 5, end: 8, speed: 4 }] }, 100).length > 0);
  assert.ok(validateEditDoc(doc, 30).some((p) => p.includes('outside')));
});
test('dead air removal splits around long internal silences only', () => {
  assert.deepEqual(removeDeadAir(0, 30, [{ start: 10, end: 13 }, { start: 20, end: 20.5 }]), [{ start: 0, end: 10.25 }, { start: 12.75, end: 30 }]);
  assert.deepEqual(removeDeadAir(0, 30, []), [{ start: 0, end: 30 }]);
});
test('caption cues: grouped, keyword highlighted, timing valid', () => {
  const seg = { start: 0, end: 4, text: 'This is a really big crash!', words: wordsFromSegment(0, 4, 'This is a really big crash!') };
  const cues = buildCues([seg], 0, 4, ['crash']);
  assert.ok(cues.length >= 2);
  assert.ok(cues.every((c) => c.words.length <= 3));
  assert.ok(cues.flatMap((c) => c.words).find((w) => w.text === 'crash!').highlight);
  const bad = [{ id: '1', start: -1, end: 0.05, text: 'a', words: [] }, { id: '2', start: 0.02, end: 9, text: 'b', words: [] }];
  assert.ok(validateCueTiming(bad, 0, 5) > 0);
  assert.ok(bad[0].start >= 0 && bad[0].end <= bad[1].start && bad[1].end <= 5);
});
test('boundaries never cut a sentence in half', () => {
  const tr = [{ start: 8, end: 12, text: 'x', words: [] }, { start: 28, end: 31, text: 'y', words: [] }];
  assert.deepEqual(snapBoundaries(10, 30, 100, tr, []), { start: 8, end: 31.25 });
});
test('excitement curve penalises black frames and dead time', () => {
  const c = excitementCurve({ duration: 10, loudness: Array(10).fill(-20).map((v, i) => (i === 5 ? -5 : v)), sceneCuts: [], visualEvents: [{ start: 0, end: 2, type: 'dead_time', intensity: 5, description: '', source: 'visual' }], audioEvents: [], blackSegments: [{ start: 8, end: 9 }] });
  assert.equal(c[5], 1);
  assert.equal(c[0], 0);
  assert.equal(c[8], 0);
});
test('font fallback for Indic captions', () => {
  assert.equal(fontForText('బుర్ర ఖాళీ', 'Anton'), 'Noto Sans Telugu');
  assert.equal(fontForText('नमस्ते', 'Anton'), 'Noto Sans Devanagari');
  assert.equal(fontForText('hello', 'Anton'), 'Anton');
});
test('ASS output escapes override braces in user text', () => {
  const ass = buildAss({ ...doc, captions: { ...doc.captions, cues: [] }, texts: [{ id: 't', text: 'a{\\pos(0,0)}b', start: 0, end: 1, x: 0.5, y: 0.5, size: 50, color: '#FFFFFF', font: 'Anton', box: false }] });
  assert.ok(ass.includes('a\\\\pos(0,0)b'));
});
test('auth gate', () => {
  delete process.env.APP_PASSWORD;
  assert.equal(isAuthorized(null), true);
  process.env.APP_PASSWORD = 's3cret';
  assert.equal(isAuthorized(null), false);
  assert.equal(isAuthorized('Basic ' + btoa('any:s3cret')), true);
  assert.equal(isAuthorized('Basic ' + btoa('any:wrong!')), false);
  delete process.env.APP_PASSWORD;
});
test('regression: overlapping/out-of-order Gemini segments produce valid sequential cues', () => {
  const mk = (s, e, t) => ({ start: s, end: e, text: t, words: wordsFromSegment(s, e, t) });
  const tr = [mk(20, 24.4, 'చుట్టు చీర కట్టిన'), mk(24.2, 28.4, 'రోజు సొంగ'), mk(0.02, 0.6, 'అమ్మో'), mk(0, 0.56, 'ఏంటి')];
  const cues = buildCues(tr, 0, 30, []);
  validateCueTiming(cues, 0, 30);
  for (let i = 0; i < cues.length; i++) {
    assert.ok(cues[i].end - cues[i].start >= 0.1, `cue ${i} has length`);
    if (i) assert.ok(cues[i].start >= cues[i - 1].end - 1e-9, `cue ${i} starts after previous ends`);
  }
});
test('regression: sound labels are stripped from non-Latin transcripts', () => {
  assert.equal(cleanTranscriptText('laughter రోజు'), 'రోజు');
  assert.equal(cleanTranscriptText('అమ్మో! (crash) చూడు'), 'అమ్మో! చూడు');
  assert.equal(cleanTranscriptText('watch that crash'), 'watch that crash');
  assert.equal(cleanTranscriptText('laughter'), '');
  assert.equal(cleanTranscriptText('Crash!'), '');
});

// ---- PC fetch helper / Send to production ---------------------------------------------------
import { toPortablePath, fromPortablePath, safeRelative, mapRowPaths, checkSyncToken, isValidProjectId } from '../src/lib/sync/sync-core.ts';
import { classifyYtDlpFailure } from '../src/lib/youtube/ytdlp.ts';

test('storage paths become portable and re-root on another OS', () => {
  const win = String.raw`C:\Users\me\app\storage`;
  assert.equal(toPortablePath(String.raw`C:\Users\me\app\storage\projects\proj_1_a\source\s.mp4`, win), '@storage/projects/proj_1_a/source/s.mp4');
  assert.equal(toPortablePath('c:/users/ME/app/storage/projects/x.jpg', win), '@storage/projects/x.jpg'); // Windows is case-insensitive
  assert.equal(toPortablePath('/app/storage/projects/p/a.mp4', '/app/storage'), '@storage/projects/p/a.mp4');
  assert.equal(toPortablePath('/app/storagex/a.mp4', '/app/storage'), '/app/storagex/a.mp4'); // prefix must end at a separator
  assert.equal(toPortablePath('just text', win), 'just text');
  assert.equal(fromPortablePath('@storage/projects/p/a.mp4', '/app/storage').replaceAll(String.fromCharCode(92), '/'),'/app/storage/projects/p/a.mp4');
});
test('portable paths cannot escape storage', () => {
  assert.throws(() => fromPortablePath('@storage/../etc/passwd', '/app/storage'));
  assert.throws(() => fromPortablePath('@storage/projects/C:/x', '/app/storage'));
  assert.equal(safeRelative('projects/p/../../x'), null);
  assert.equal(safeRelative(''), null);
  assert.equal(safeRelative(String.raw`projects\p\a.mp4`), 'projects/p/a.mp4');
});
test('paths inside *_json columns are rewritten too', () => {
  const row = mapRowPaths({ id: 'a', file_path: '/s/projects/p/a.mp4', analysis_json: JSON.stringify({ previewPath: '/s/projects/p/preview.mp4', n: 3 }), note: '{"x":1}' }, (s) => toPortablePath(s, '/s'));
  assert.equal(row.file_path, '@storage/projects/p/a.mp4');
  assert.deepEqual(JSON.parse(row.analysis_json), { previewPath: '@storage/projects/p/preview.mp4', n: 3 });
  assert.equal(row.note, '{"x":1}');
});
test('sync token: required, long enough, exact match', () => {
  const prev = process.env.SYNC_TOKEN;
  try {
    delete process.env.SYNC_TOKEN;
    assert.equal(checkSyncToken('Bearer anything'), false);
    process.env.SYNC_TOKEN = 'short';
    assert.equal(checkSyncToken('Bearer short'), false);
    process.env.SYNC_TOKEN = 'x'.repeat(32);
    assert.equal(checkSyncToken(`Bearer ${'x'.repeat(32)}`), true);
    assert.equal(checkSyncToken(`Bearer ${'x'.repeat(31)}y`), false);
    assert.equal(checkSyncToken(`Basic ${'x'.repeat(32)}`), false);
    assert.equal(checkSyncToken(null), false);
  } finally {
    if (prev === undefined) delete process.env.SYNC_TOKEN; else process.env.SYNC_TOKEN = prev;
  }
});
test('project ids are validated before use in paths', () => {
  assert.equal(isValidProjectId('proj_1764200000000_ab12c'), true);
  assert.equal(isValidProjectId('proj_../../x'), false);
  assert.equal(isValidProjectId('other_1'), false);
});
test('yt-dlp failures are classified (bot wall is not retried on the same server)', () => {
  assert.equal(classifyYtDlpFailure("ERROR: [youtube] abc: Sign in to confirm you're not a bot."), 'bot_wall');
  assert.equal(classifyYtDlpFailure('ERROR: unable to download video data: HTTP Error 429: Too Many Requests'), 'bot_wall');
  assert.equal(classifyYtDlpFailure('ERROR: [youtube] abc: Private video. Sign in if you\'ve been granted access'), 'access');
  assert.equal(classifyYtDlpFailure('ERROR: [youtube] abc: Sign in to confirm your age'), 'access');
  assert.equal(classifyYtDlpFailure('ERROR: unable to download: Connection reset'), 'other');
});
