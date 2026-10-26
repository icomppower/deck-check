// Loads ./.env from the project root into process.env. Zero dependencies.
// Never prints values. If .env is missing (e.g. on Vercel), does nothing.
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');

let text = null;
try {
  const { mode } = statSync(envPath);
  if (mode & 0o077) {
    console.warn(`warning: .env is group/world accessible (mode ${(mode & 0o777).toString(8)}); run: chmod 600 .env`);
  }
  text = readFileSync(envPath, 'utf8');
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

if (text !== null) {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, '').trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
