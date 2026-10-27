// POST { sentence } or { sentence, plan } → Deck Check pipeline result. Used by Vercel and server.js.
import '../lib/env.js';
import { museClient, runPipeline } from '../lib/core.js';

export const config = { maxDuration: 120 };

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

  try {
    send(res, 200, await runPipeline({ sentence, plan, call: museClient() }));
  } catch (err) {
    send(res, err.status ? 502 : 500, { error: err.message, calls: err.calls ?? [] });
  }
}
