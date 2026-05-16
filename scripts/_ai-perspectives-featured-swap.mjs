#!/usr/bin/env node
// One-shot sweep: in the AI Perspectives mega-menu Featured column,
// swap the AI Frontiers link with the All AI Perspectives link so the
// hub becomes the primary featured pick at the top of the list and
// AI Frontiers becomes the arrow-CTA pick at the bottom. Visual
// treatments stay tied to position — the .mega-insights-featured__primary
// class continues to render the top link as the headline pick, and the
// .mega-insights-featured__hub class continues to render the bottom
// link as the arrow CTA.
//
// Idempotent: re-running it against pages already swapped is a no-op.
//
// Run from repo root:  node scripts/_ai-perspectives-featured-swap.mjs

import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

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

const OLD_PRIMARY = '<a href="/ai-frontiers/" class="mega-link mega-insights-featured__primary">AI Frontiers<span class="mega-link-dek">Beyond the obvious use cases</span></a>';
const OLD_HUB = '<a href="/insights/" class="mega-link mega-insights-featured__hub">All AI Perspectives <span class="mega-insights-featured__arrow" aria-hidden="true">&rarr;</span><span class="mega-link-dek">The full executive hub</span></a>';

const NEW_PRIMARY = '<a href="/insights/" class="mega-link mega-insights-featured__primary">All AI Perspectives<span class="mega-link-dek">The full executive hub</span></a>';
const NEW_HUB = '<a href="/ai-frontiers/" class="mega-link mega-insights-featured__hub">AI Frontiers <span class="mega-insights-featured__arrow" aria-hidden="true">&rarr;</span><span class="mega-link-dek">Beyond the obvious use cases</span></a>';

const files = await walk(ROOT);
let updated = 0;
let skipped = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('scripts' + path.sep)) continue;

  const src = await readFile(file, 'utf8');
  if (!src.includes(OLD_PRIMARY) || !src.includes(OLD_HUB)) {
    skipped++;
    continue;
  }

  const next = src.replace(OLD_PRIMARY, NEW_PRIMARY).replace(OLD_HUB, NEW_HUB);
  if (next === src) {
    skipped++;
    continue;
  }

  await writeFile(file, next, 'utf8');
  updated++;
  console.log('UPDATED', rel);
}

console.log(`\nDone. updated=${updated}, skipped=${skipped}`);
