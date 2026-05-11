#!/usr/bin/env node
// One-shot sweep: replace the Methodology mega-menu block across every
// page in the repo, swapping the lightweight .mega-method-cards--three
// card layout for the premium image-card variant (.mega-pillar-cards
// / .mega-pillar-card).
//
// Idempotent — re-running it leaves already-converted files alone.
//
// Run from repo root:  node scripts/_methodology-mega-pillar-cards.mjs

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

const NEW_BLOCK = `<div id="mega-methodology" class="mega-menu" role="region" aria-label="Methodology">
    <div class="mega-menu-inner">
      <div class="mega-pillar-cards">
        <a href="/foundation/" class="mega-pillar-card mega-pillar-card--01">
          <div class="mega-pillar-card__image" aria-hidden="true"></div>
          <div class="mega-pillar-card__content">
            <span class="mega-pillar-card__num">01</span>
            <h3 class="mega-pillar-card__title">Data Curation<br />&amp; Governance</h3>
            <p class="mega-pillar-card__dek">Data before anything else</p>
          </div>
        </a>
        <a href="/operations/" class="mega-pillar-card mega-pillar-card--02">
          <div class="mega-pillar-card__image" aria-hidden="true"></div>
          <div class="mega-pillar-card__content">
            <span class="mega-pillar-card__num">02</span>
            <h3 class="mega-pillar-card__title">Workflow<br />Optimization</h3>
            <p class="mega-pillar-card__dek">Fix process before applying AI</p>
          </div>
        </a>
        <a href="/agentic-ai/" class="mega-pillar-card mega-pillar-card--03">
          <div class="mega-pillar-card__image" aria-hidden="true"></div>
          <div class="mega-pillar-card__content">
            <span class="mega-pillar-card__num">03</span>
            <h3 class="mega-pillar-card__title">AI Design<br />&amp; Implementation</h3>
            <p class="mega-pillar-card__dek">Designed around measurable outcomes</p>
          </div>
        </a>
      </div>
    </div>
  </div>`;

// Match the entire <div id="mega-methodology"> block. We anchor on the
// known marker `mega-method-cards--three` inside it so we only operate
// on the methodology mega-menu (not AI Training, Industries, Insights).
// Matches lazily up to the third </div> that closes the outer wrapper.
const RE =
  /<div id="mega-methodology"[^>]*>\s*<div class="mega-menu-inner">\s*<div class="mega-method-cards mega-method-cards--three">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/;

const files = await walk(ROOT);
let updated = 0;
let already = 0;
let skipped = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('scripts' + path.sep)) continue;

  const src = await readFile(file, 'utf8');
  if (!src.includes('id="mega-methodology"')) continue;

  if (src.includes('mega-pillar-cards')) {
    already++;
    continue;
  }

  if (!RE.test(src)) {
    console.warn('SKIP (no regex match):', rel);
    skipped++;
    continue;
  }

  const next = src.replace(RE, NEW_BLOCK);
  if (next === src) {
    skipped++;
    continue;
  }

  await writeFile(file, next, 'utf8');
  updated++;
  console.log('UPDATED', rel);
}

console.log(`\nDone. updated=${updated}, already-converted=${already}, skipped=${skipped}`);
