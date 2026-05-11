#!/usr/bin/env node
// One-shot sweep: replace the user-facing label "Insights" with
// "AI Advisory" across every HTML, JS, and CSS file in the repo.
//
// Uses a word-boundary regex on capital-I `Insights` only. URLs
// (/insights/), CSS class names (mega-insights), IDs (mega-insights),
// data attributes (data-mega="insights"), and aria-controls values
// all use LOWERCASE `insights` and are therefore not touched. Routes
// stay intact — only display text changes.
//
// Idempotent — re-running it is a no-op once converted.
//
// Run from repo root:  node scripts/_rename-insights-to-ai-advisory.mjs

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
    } else if (entry.isFile() && /\.(html|js|css|mjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const RE = /\bInsights\b/g;
const REPLACEMENT = 'AI Advisory';

const files = await walk(ROOT);
let updated = 0;
let totalReplacements = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  // Don't touch this script itself or other sweep scripts that
  // happen to mention Insights in their commentary.
  if (rel.startsWith('scripts' + path.sep)) continue;

  const src = await readFile(file, 'utf8');
  const matches = src.match(RE);
  if (!matches) continue;

  const next = src.replace(RE, REPLACEMENT);
  if (next === src) continue;

  await writeFile(file, next, 'utf8');
  updated++;
  totalReplacements += matches.length;
  console.log(`UPDATED ${rel}  (${matches.length} replacements)`);
}

console.log(`\nDone. files=${updated}, total replacements=${totalReplacements}`);
