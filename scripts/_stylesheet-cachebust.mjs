#!/usr/bin/env node
// One-shot sweep: append a version query string to /styles.css and
// /tailwind-static.css references in every HTML page. Forces every
// browser (including Chrome mobile's aggressive disk cache) to fetch
// the latest files rather than serve stale copies.
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
const VERSION = '20260519k'; // bump on every cache-bust pass

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

// Both stylesheets get the same version. Each regex accepts an
// optional existing ?v=... suffix so the sweep is idempotent.
const TARGETS = [
  { name: 'styles.css',          re: /href="\/styles\.css(?:\?v=[^"]*)?"/g,          replacement: `href="/styles.css?v=${VERSION}"` },
  { name: 'tailwind-static.css', re: /href="\/tailwind-static\.css(?:\?v=[^"]*)?"/g, replacement: `href="/tailwind-static.css?v=${VERSION}"` },
];

const files = await walk(ROOT);
let updated = 0;
let skipped = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('scripts' + path.sep)) continue;

  const src = await readFile(file, 'utf8');
  let next = src;
  for (const t of TARGETS) {
    if (t.re.test(next)) next = next.replace(t.re, t.replacement);
  }
  if (next === src) {
    skipped++;
    continue;
  }

  await writeFile(file, next, 'utf8');
  updated++;
  console.log('UPDATED', rel);
}

console.log(`\nDone. updated=${updated}, skipped=${skipped}, version=${VERSION}`);
