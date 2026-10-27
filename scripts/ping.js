// Sends one minimal request to Muse. Prints only status, model, and reply text.
import '../lib/env.js';

const key = process.env.MODEL_API_KEY;
if (!key) {
  console.error('MODEL_API_KEY is empty. Open .env in your editor and paste the key.');
  process.exit(1);
}

const base = (process.env.MUSE_BASE_URL || 'https://api.meta.ai').replace(/\/+$/, '');
const model = process.env.MUSE_MODEL || 'muse-wonder-1.0';

const res = await fetch(`${base}/v1/messages`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${key}`,
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model,
    max_tokens: 64,
    messages: [{ role: 'user', content: 'Reply with OK' }],
  }),
});

const body = await res.text();
if (!res.ok) {
  console.log(`HTTP ${res.status}`);
  console.log(body.slice(0, 300));
  process.exit(1);
}

let data;
try { data = JSON.parse(body); } catch { data = {}; }
const reply = Array.isArray(data.content)
  ? data.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  : '';
console.log(`HTTP ${res.status}`);
console.log(`model: ${data.model ?? model}`);
console.log(`stop_reason: ${data.stop_reason}`);
console.log(`reply: ${reply}`);
