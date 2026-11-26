// Fast unit tests for pure logic. Run: node --test scripts/test-units.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateSqliteToPostgres, convertPlaceholders } from '../src/db/postgres.ts';
import { totalOutputDuration, sourceToOutput, outputToSource, cuesOnOutput, validateEditDoc, fontForText, CAPTION_PRESETS } from '../src/lib/render/edit-doc.ts';
import { removeDeadAir } from '../src/pipeline/agents/shorts-generation-agent.ts';
import { buildCues, validateCueTiming } from '../src/pipeline/agents/caption-agent.ts';
import { snapBoundaries, excitementCurve } from '../src/pipeline/agents/highlight-detection-agent.ts';
import { wordsFromSegment } from '../src/pipeline/agents/audio-intelligence-agent.ts';
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
