#!/usr/bin/env node
// One-shot sweep: insert "Capital Decisions" as the second item in the
// AI Perspectives Featured Perspective list — directly under "All AI
// Perspectives" and above "Foundations Series". Preserves the new
// All AI Perspectives -> ... -> AI Frontiers ordering shipped in
// the previous swap; only adds the new featured link.
//
// Idempotent: skips pages that already contain the Capital Decisions
// link.
//
// Run from repo root:  node scripts/_ai-perspectives-add-capital-decisions.mjs

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

const FOUNDATIONS_LINK = '<a href="/insights/#foundations-series" class="mega-link">Foundations Series<span class="mega-link-dek">Five-part field series</span></a>';
const CAPITAL_LINK = '<a href="/insights/capital-decisions/" class="mega-link">Capital Decisions<span class="mega-link-dek">Evaluate ROI, risk, and payback</span></a>';
const INSERT = `${CAPITAL_LINK}\n          ${FOUNDATIONS_LINK}`;

const files = await walk(ROOT);
let updated = 0;
let skipped = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('scripts' + path.sep)) continue;

  const src = await readFile(file, 'utf8');

  // Skip pages that already include Capital Decisions in the featured list
  // (e.g. the new article page itself sets aria-current="page" but the
  // base link path is present too; treat any /insights/capital-decisions/
  // reference in the mega-insights block as "already done").
  if (src.includes('href="/insights/capital-decisions/" class="mega-link"')) {
    skipped++;
    continue;
  }

  if (!src.includes(FOUNDATIONS_LINK)) {
    skipped++;
    continue;
  }

  const next = src.replace(FOUNDATIONS_LINK, INSERT);
  if (next === src) {
    skipped++;
    continue;
  }

  await writeFile(file, next, 'utf8');
  updated++;
  console.log('UPDATED', rel);
}

console.log(`\nDone. updated=${updated}, skipped=${skipped}`);
