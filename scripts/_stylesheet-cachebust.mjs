#!/usr/bin/env node
// One-shot sweep: append a version query string to the /styles.css
// reference in every HTML page. Forces every browser (including
// Chrome mobile's aggressive disk cache) to fetch the latest file
// rather than serve a stale copy.
//
// The version uses today's date so subsequent edits can bump it
// trivially.
//
// Idempotent — re-running it just replaces the existing ?v=... value.
//
// Run from repo root:  node scripts/_stylesheet-cachebust.mjs

import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const VERSION = '20260512b'; // bump on every cache-bust pass

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.git')) continue;
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walk(full));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

// Matches /styles.css with an optional existing ?v=... suffix.
const RE = /href="\/styles\.css(?:\?v=[^"]*)?"/g;

const files = await walk(ROOT);
let updated = 0;
let skipped = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('scripts' + path.sep)) continue;

  const src = await readFile(file, 'utf8');
  if (!RE.test(src)) continue;

  const next = src.replace(RE, `href="/styles.css?v=${VERSION}"`);
  if (next === src) {
    skipped++;
    continue;
  }

  await writeFile(file, next, 'utf8');
  updated++;
  console.log('UPDATED', rel);
}

console.log(`\nDone. updated=${updated}, skipped=${skipped}, version=${VERSION}`);
