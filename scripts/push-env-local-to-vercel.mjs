#!/usr/bin/env node
/**
 * Push variables from .env.local to Vercel (production + development).
 * Skips VERCEL_OIDC_TOKEN (short-lived local token; do not store on Vercel).
 * Preview: CLI often requires a git branch — run manually in Dashboard if needed.
 *
 * Usage (from repo root):
 *   node scripts/push-env-local-to-vercel.mjs
 *
 * Requires: vercel CLI logged in (`vercel login`), project linked (`vercel link`).
 */

import { readFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const envPath = join(root, '.env.local');

if (!existsSync(envPath)) {
  console.error('No .env.local found at', envPath);
  process.exit(1);
}

const SKIP = new Set(['VERCEL_OIDC_TOKEN', '#']);

function parseEnvFile(text) {
  const out = {};
  for (let line of text.split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i === -1) continue;
    const key = s.slice(0, i).trim();
    let val = s.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (SKIP.has(key)) continue;
    out[key] = val;
  }
  return out;
}

function vercelEnvAdd(name, target, value) {
  const r = spawnSync(
    'vercel',
    ['env', 'add', name, target, '--value', value, '--yes', '--force'],
    { encoding: 'utf8', cwd: root }
  );
  return { code: r.status, stderr: r.stderr || '', stdout: r.stdout || '' };
}

const vars = parseEnvFile(readFileSync(envPath, 'utf8'));
const targets = ['production', 'development'];

console.log(`Syncing ${Object.keys(vars).length} keys from .env.local → Vercel (${targets.join(', ')})…\n`);

let ok = 0;
let fail = 0;

for (const target of targets) {
  for (const [name, value] of Object.entries(vars)) {
    const { code, stderr, stdout } = vercelEnvAdd(name, target, value);
    const tail = (stderr + stdout).split('\n').filter(Boolean).slice(-3).join(' ');
    if (code === 0) {
      console.log(`  ✓ ${name} (${target})`);
      ok++;
    } else {
      console.error(`  ✗ ${name} (${target})`, tail || code);
      fail++;
    }
  }
}

console.log(`\nDone: ${ok} ok, ${fail} failed.`);
console.log(
  'Preview: add missing keys in Vercel → Settings → Environment Variables → Preview if preview deploys need them (CLI may require a git branch).'
);
process.exit(fail > 0 ? 1 : 0);
