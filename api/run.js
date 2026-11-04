// POST { sentence } or { sentence, plan } → Deck Check pipeline result. Used by Vercel and server.js.
import '../lib/env.js';
import { museClient, runPipeline } from '../lib/core.js';

export const config = { maxDuration: 120 };

// Simple daily run cap so the event key isn't drained (per warm instance; resets each UTC day).
const DAILY_CAP = Number(process.env.DAILY_RUN_CAP) || 40;
let capDay = '', capCount = 0;
function overCap() {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== capDay) { capDay = day; capCount = 0; }
  return ++capCount > DAILY_CAP;
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 100_000) throw new Error('body too large');
  }
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });

  let body;
  try {
    body = req.body && typeof req.body === 'object' ? req.body : JSON.parse((await readBody(req)) || '{}');
  } catch {
    return send(res, 400, { error: 'Request body must be JSON' });
  }

  const sentence = typeof body.sentence === 'string' ? body.sentence.trim().slice(0, 500) : '';
  const plan = body.plan && typeof body.plan === 'object' ? body.plan : undefined;
  if (!sentence && !plan) return send(res, 400, { error: 'Describe your deck in one sentence' });

  if (overCap()) return send(res, 429, { error: 'Daily demo limit reached — try again tomorrow' });

  try {
    send(res, 200, await runPipeline({ sentence, plan, call: museClient() }));
  } catch (err) {
    send(res, err.status ? 502 : 500, { error: err.message, calls: err.calls ?? [] });
  }
}
