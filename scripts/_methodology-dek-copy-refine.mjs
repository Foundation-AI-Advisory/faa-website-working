#!/usr/bin/env node
// One-shot sweep: replace the dek line on the Workflow Optimization
// methodology card across every page that contains it. "Fix process
// before applying AI" -> "Optimize workflows before applying AI" —
// matches the pillar name's verb (Optimize) and reads as a
// deliberate operating action, not a repair job.
//
// Idempotent — re-running it is a no-op once converted.
//
// Run from repo root:  node scripts/_methodology-dek-copy-refine.mjs

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

const OLD = '<p class="mega-pillar-card__dek">Fix process before applying AI</p>';
const NEW = '<p class="mega-pillar-card__dek">Optimize workflows before applying AI</p>';

const files = await walk(ROOT);
let updated = 0;
let already = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('scripts' + path.sep)) continue;

  const src = await readFile(file, 'utf8');
  if (!src.includes(OLD)) {
    if (src.includes(NEW)) already++;
    continue;
  }

  const next = src.split(OLD).join(NEW);
  await writeFile(file, next, 'utf8');
  updated++;
  console.log('UPDATED', rel);
}

console.log(`\nDone. updated=${updated}, already-converted=${already}`);
