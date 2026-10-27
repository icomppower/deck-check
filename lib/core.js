// Deck Check core: Muse client, joist span checker, and the PLAN → CHECK → FIX → SUMMARY pipeline.
// The checker in this file decides pass/fail. Muse proposes plans; it never approves its own work.

export const SPACINGS = [12, 16, 24];

// Simplified IRC 2021 R507.6 joist spans, Southern Pine #2, 40 live + 10 dead psf, in feet.
// Demo table, not an engineering stamp.
export const SPAN_TABLE = {
  '2x6': { 12: 9.92, 16: 9.0, 24: 7.58 },
  '2x8': { 12: 13.08, 16: 11.83, 24: 9.67 },
  '2x10': { 12: 16.17, 16: 14.0, 24: 11.42 },
  '2x12': { 12: 18.0, 16: 16.5, 24: 13.5 },
};
export const SIZES = Object.keys(SPAN_TABLE);
export const DEAD_PSF = 10;
export const DECK_LIVE_PSF = 40;
export const HOT_TUB_LIVE_PSF = 100;
const STOCK_FT = [8, 10, 12, 14, 16, 18, 20];
const EPS = 1e-6;

const round2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function allowableSpan(size, spacing, livePsf) {
  const base = SPAN_TABLE[size]?.[spacing];
  if (base == null) return null;
  const total = livePsf + DEAD_PSF;
  return total > 50 ? base * Math.sqrt(50 / total) : base;
}

const normSize = (s) => String(s ?? '').toLowerCase().replace(/[\s"]/g, '').replace('×', 'x');

// Coerce a plan from Muse into a well-formed one: numeric fields, hot tub inside the deck,
// and zones that tile [0, width] with no gaps or overlaps. Sizes/spacings are kept as given;
// anything outside the span table fails the check rather than being silently replaced.
export function normalizePlan(raw) {
  const width = Number(raw?.width);
  const depth = Number(raw?.depth);
  if (!(width >= 4 && width <= 60 && depth >= 4 && depth <= 40)) {
    throw new Error(`Plan has an unusable deck size: ${raw?.width} × ${raw?.depth} ft`);
  }

  let hotTub = null;
  if (raw.hotTub) {
    const t = raw.hotTub;
    const x0 = clamp(Number(t.x0), 0, width);
    const x1 = clamp(Number(t.x1), 0, width);
    let y0 = clamp(Number(t.y0), 0, depth);
    let y1 = clamp(Number(t.y1), 0, depth);
    if (!(y1 > y0)) { y0 = 0; y1 = depth; }
    if (x1 - x0 >= 1) hotTub = { x0: round2(x0), x1: round2(x1), y0: round2(y0), y1: round2(y1) };
  }

  const zones = (Array.isArray(raw.zones) ? raw.zones : [])
    .map((z) => ({ x0: Number(z.x0), x1: Number(z.x1), size: normSize(z.size), spacing: Number(z.spacing) }))
    .filter((z) => Number.isFinite(z.x0) && Number.isFinite(z.x1) && z.x1 > z.x0)
    .sort((a, b) => a.x0 - b.x0);
  const tiled = [];
  let at = 0;
  for (const z of zones) {
    const x1 = Math.min(z.x1, width);
    if (x1 <= at + EPS) continue;
    tiled.push({ x0: round2(at), x1: round2(x1), size: z.size, spacing: z.spacing });
    at = x1;
    if (at >= width - EPS) break;
  }
  if (!tiled.length) throw new Error('Plan has no usable framing zones');
  tiled.at(-1).x1 = round2(width);

  return { width: round2(width), depth: round2(depth), hotTub, zones: tiled };
}

// Joists sit at each zone's x0 and every `spacing` after it, plus an end joist on the far edge.
export function layoutJoists(plan) {
  const joists = [];
  plan.zones.forEach((z, zone) => {
    const last = zone === plan.zones.length - 1;
    const step = (SPACINGS.includes(z.spacing) ? z.spacing : 16) / 12;
    for (let k = 0; ; k++) {
      const x = z.x0 + k * step;
      if (last ? x > z.x1 + EPS : x >= z.x1 - EPS) break;
      joists.push({ x: round2(x), zone, size: z.size, spacing: z.spacing });
    }
    if (last && joists.at(-1).x < z.x1 - 0.01) joists.push({ x: z.x1, zone, size: z.size, spacing: z.spacing });
  });
  return joists;
}

// Every joist spans the full depth (ledger → beam). One under the hot tub's x-range carries hot tub load.
export function checkPlan(plan) {
  const t = plan.hotTub;
  const joists = layoutJoists(plan).map((j) => {
    const underTub = !!t && j.x >= t.x0 - EPS && j.x <= t.x1 + EPS;
    const livePsf = underTub ? HOT_TUB_LIVE_PSF : DECK_LIVE_PSF;
    const allow = allowableSpan(j.size, j.spacing, livePsf);
    const ok = allow != null && allow + EPS >= plan.depth;
    const reason = allow == null ? `${j.size} @ ${j.spacing}" is not in the span table`
      : ok ? null : `span ${plan.depth} ft > allowable ${round2(allow)} ft`;
    return { ...j, underTub, livePsf, allowable: allow == null ? null : round2(allow), ok, reason };
  });
  const red = joists.filter((j) => !j.ok).length;
  return { joists, red, total: joists.length, pass: red === 0 };
}

export function joistCounts(plan) {
  const lengthFt = STOCK_FT.find((l) => l >= plan.depth) ?? Math.ceil(plan.depth);
  const counts = {};
  for (const j of layoutJoists(plan)) counts[j.size] = (counts[j.size] ?? 0) + 1;
  return Object.entries(counts).map(([size, qty]) => ({ item: `${size} joist`, qty, lengthFt }));
}

export function extractJson(text) {
  const s = String(text ?? '').replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error(`Muse did not return JSON: ${s.slice(0, 200)}`);
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch (err) {
    throw new Error(`Muse returned malformed JSON (${err.message}): ${s.slice(a, a + 200)}`);
  }
}

// Anthropic-compatible Messages client for Muse. Returns call(step, system, user) → { text, log }.
// The log carries status, timing and token counts only, never headers or the key.
export function museClient({
  key = process.env.MODEL_API_KEY,
  base = process.env.MUSE_BASE_URL || 'https://api.meta.ai',
  model = process.env.MUSE_MODEL || 'muse-wonder-1.0',
} = {}) {
  if (!key) throw new Error('MODEL_API_KEY is not set');
  const url = `${base.replace(/\/+$/, '')}/v1/messages`;
  return async function call(step, system, user) {
    const t0 = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: 4000, system, messages: [{ role: 'user', content: user }] }),
      signal: AbortSignal.timeout(90_000),
    });
    const body = await res.text();
    const log = { step, status: res.status, ms: Date.now() - t0 };
    if (!res.ok) {
      throw Object.assign(new Error(`Muse ${step} failed: HTTP ${res.status} ${body.slice(0, 300)}`), { status: res.status, log });
    }
    const data = JSON.parse(body);
    const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    Object.assign(log, { model: data.model, stop: data.stop_reason, inTok: data.usage?.input_tokens, outTok: data.usage?.output_tokens });
    return { text, log };
  };
}

const SPAN_TEXT = SIZES.map((s) => `${s}: ${SPACINGS.map((sp) => `${sp}"=${SPAN_TABLE[s][sp]}`).join(', ')}`).join('\n');

const PLAN_SYSTEM = `You draft deck framing plans. Reply with one JSON object and nothing else.
Coordinates are in feet, seen from above with the house wall along the top edge.
x runs along the house wall, from 0 at the left (standing in the yard, facing the house) to width.
y runs out from the house, from 0 at the ledger to depth at the outer beam.
Joists run in y from ledger to beam, so every joist spans the full depth. They are spaced along x.
If the sentence gives two dimensions without saying which runs along the house, the longer one is the width.
A hot tub is about 7 x 7 ft unless the sentence says otherwise. A corner means the outer corner on that side (away from the house).
Split the deck into framing zones along x. Give the hot tub its own zone whose x-range matches the tub's x-range.
Use only sizes ${SIZES.join(', ')} and spacings ${SPACINGS.join(', ')} (inches on center).
Schema example (a different deck): {"width":20,"depth":10,"hotTub":null,"zones":[{"x0":0,"x1":20,"size":"2x8","spacing":16}]}
With a hot tub, "hotTub" is {"x0":n,"x1":n,"y0":n,"y1":n}.`;

const FIX_SYSTEM = `You repair deck framing plans. A deterministic span checker found joists whose span exceeds the allowable span.
Reply with the full corrected plan as one JSON object, same schema as the input plan, and nothing else.
Rules:
- Keep width, depth and hotTub exactly as given. You may change zones: their x-ranges, size and spacing.
- Use only sizes ${SIZES.join(', ')} and spacings ${SPACINGS.join(', ')}.
- Joists sit at each zone's x0 and every spacing after it, plus one at x = width. Every joist spans the full depth.
- A joist carries the hot tub load when its x is inside the hot tub's x-range, edges included.
- Fix every failing joist. Prefer the lightest size and widest spacing that passes. Leave zones with no failing joists alone.
Allowable spans, feet, Southern Pine #2, 40 psf live + 10 psf dead:
${SPAN_TEXT}
Above 50 psf total load, allowable = table x sqrt(50 / (live + 10)). Under the hot tub live load is ${HOT_TUB_LIVE_PSF} psf, so allowable = table x 0.674.`;

const SUMMARY_SYSTEM = `You write the summary for a deck framing plan that a code checker has already verified.
Reply with one JSON object and nothing else: {"cutList":[{"item":string,"qty":number,"length":string}],"permitNote":string}
cutList: list exactly the joist counts given, no other items.
permitNote: exactly 3 sentences for a homeowner taking this to the permit desk: what the deck is, how it is framed (mention the hot tub zone if there is one), and that the span table is a simplified demo and a hot tub deck needs a licensed engineer's review.
If the checker still reports failing joists, say so plainly in the first sentence.`;

const failingJoists = (check) => check.joists.filter((j) => !j.ok)
  .map(({ x, zone, size, spacing, livePsf, allowable }) => ({ x, zone, size, spacing, livePsf, allowableFt: allowable }));

// sentence → PLAN (or a given plan, e.g. the same deck without its hot tub) → CHECK → FIX ×≤3 → SUMMARY.
export async function runPipeline({ sentence = '', plan: givenPlan, call, maxFix = 3 }) {
  const calls = [];
  const ask = async (step, system, user) => {
    try {
      const r = await call(step, system, user);
      calls.push(r.log);
      return r.text;
    } catch (err) {
      if (err.log) calls.push(err.log);
      throw err;
    }
  };

  try {
    const draft = givenPlan ? normalizePlan(givenPlan) : normalizePlan(extractJson(await ask('PLAN', PLAN_SYSTEM, sentence)));
    const rounds = [{ label: 'Draft', plan: draft, check: checkPlan(draft) }];

    for (let i = 1; i <= maxFix && !rounds.at(-1).check.pass; i++) {
      const prev = rounds.at(-1);
      const user = JSON.stringify({ plan: prev.plan, failingJoists: failingJoists(prev.check) });
      const proposed = extractJson(await ask(`FIX ${i}`, FIX_SYSTEM, user));
      // Muse may only change zones: the deck and the load it carries come from the previous round.
      const next = normalizePlan({ ...proposed, width: prev.plan.width, depth: prev.plan.depth, hotTub: prev.plan.hotTub });
      rounds.push({ label: `Fix ${i}`, plan: next, check: checkPlan(next) });
    }

    const final = rounds.at(-1);
    const counts = joistCounts(final.plan);
    const summary = extractJson(await ask('SUMMARY', SUMMARY_SYSTEM, JSON.stringify({
      deck: { width: final.plan.width, depth: final.plan.depth, hotTub: final.plan.hotTub },
      zones: final.plan.zones,
      checker: { failingJoists: final.check.red, totalJoists: final.check.total, pass: final.check.pass },
      joistCounts: counts,
    })));

    return {
      sentence,
      draft,
      rounds,
      joistCounts: counts,
      summary,
      stats: {
        firstRed: rounds[0].check.red,
        finalRed: final.check.red,
        pass: final.check.pass,
        fixRounds: rounds.length - 1,
        museCalls: calls.length,
      },
      calls,
    };
  } catch (err) {
    err.calls = calls;
    throw err;
  }
}
