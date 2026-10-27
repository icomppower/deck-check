// Checker + pipeline test. No key, no network: Muse is stubbed.
import assert from 'node:assert/strict';
import { allowableSpan, checkPlan, normalizePlan, runPipeline } from './lib/core.js';

// Test case from the brief: 16×12 deck, joists span the 12 ft depth, hot tub zone x 12–16.
const deck = { width: 16, depth: 12, hotTub: { x0: 12, x1: 16, y0: 5, y1: 12 } };
const zones = (tubSize, tubSpacing) => [
  { x0: 0, x1: 12, size: '2x10', spacing: 16 },
  { x0: 12, x1: 16, size: tubSize, spacing: tubSpacing },
];
const draft = normalizePlan({ ...deck, zones: zones('2x10', 16) });
const fixed = normalizePlan({ ...deck, zones: zones('2x12', 12) });

assert.equal(Math.round(allowableSpan('2x12', 12, 100) * 100) / 100, 12.14);
assert.equal(allowableSpan('2x10', 16, 40), 14.0);

const before = checkPlan(draft);
const after = checkPlan(fixed);
assert.equal(before.red, 4, 'draft: 2x10 @ 16" under the hot tub fails on 4 joists');
assert.ok(before.joists.filter((j) => !j.ok).every((j) => j.underTub));
assert.equal(after.red, 0, 'fix: 2x12 @ 12" under the hot tub passes');
assert.equal(checkPlan({ ...draft, hotTub: null }).red, 0, 'same deck without the hot tub passes');
assert.equal(checkPlan(normalizePlan({ ...deck, zones: zones('2x12', 16) })).red, 4, '2x12 @ 16" is not enough');
assert.equal(checkPlan(normalizePlan({ ...deck, zones: zones('4x4', 16) })).red, 4, 'unknown sizes fail');

// Gaps and overlaps in Muse's zones are snapped so the zones tile the deck width.
const messy = normalizePlan({ ...deck, zones: [{ x0: 12, x1: 17, size: '2x12', spacing: 12 }, { x0: 0, x1: 11, size: '2x10', spacing: 16 }] });
assert.deepEqual(messy.zones.map((z) => [z.x0, z.x1]), [[0, 11], [11, 16]]);

// Pipeline with a stubbed Muse. FIX 1 tries to drop the hot tub instead of fixing the framing;
// the pipeline restores the load, so the checker still fails it. FIX 2 does the real fix.
const replies = {
  PLAN: { ...deck, zones: zones('2x10', 16) },
  'FIX 1': { ...deck, hotTub: null, zones: zones('2x10', 16) },
  'FIX 2': { ...deck, zones: zones('2x12', 12) },
  SUMMARY: { cutList: [], permitNote: 'ok' },
};
const stub = async (step) => ({ text: JSON.stringify(replies[step]), log: { step, status: 200, ms: 0 } });
const out = await runPipeline({ sentence: 'test', call: stub });
assert.deepEqual(out.rounds.map((r) => r.check.red), [4, 4, 0]);
assert.deepEqual(out.calls.map((c) => c.step), ['PLAN', 'FIX 1', 'FIX 2', 'SUMMARY']);
assert.deepEqual(out.joistCounts, [{ item: '2x10 joist', qty: 9, lengthFt: 12 }, { item: '2x12 joist', qty: 5, lengthFt: 12 }]);

// "Without hot tub" reruns the same deck from the draft plan: no PLAN call, no FIX needed.
const noTub = await runPipeline({ plan: { ...out.draft, hotTub: null }, call: stub });
assert.deepEqual(noTub.calls.map((c) => c.step), ['SUMMARY']);
assert.equal(noTub.stats.finalRed, 0);

console.log(`ok: ${before.red} red → ${after.red} red on the 16×12 hot tub test case; pipeline ${out.stats.firstRed} → ${out.stats.finalRed} in ${out.stats.fixRounds} fix rounds`);
