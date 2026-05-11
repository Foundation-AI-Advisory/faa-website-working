#!/usr/bin/env node
// One-shot sweep: replace the Industries (Where We Work) mega-menu
// inner block on every page, swapping the text-only .mega-grid /
// .mega-link layout for the image-backed tile grid
// (.mega-industry-tiles / .mega-industry-tile) that reuses the
// homepage industry-card .webp images.
//
// Idempotent — re-running it is a no-op once converted.
//
// Run from repo root:  node scripts/_industries-mega-tile-grid.mjs

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

const NEW_BLOCK = `<div id="mega-industries" class="mega-menu" role="region" aria-label="Industries">
    <div class="mega-menu-inner">
      <h4><a href="/industries/">Industries</a></h4>
      <div class="mega-industry-tiles">
        <a href="/industry-manufacturing-industrial-production/" class="mega-industry-tile mega-industry-tile--manufacturing">
          <span class="mega-industry-tile__title">Manufacturing &amp; Industrial Production</span>
          <span class="mega-industry-tile__meta">Throughput, yield, plant floor</span>
        </a>
        <a href="/industry-engineering-construction-infrastructure/" class="mega-industry-tile mega-industry-tile--eci">
          <span class="mega-industry-tile__title">Engineering, Construction &amp; Infrastructure (ECI)</span>
          <span class="mega-industry-tile__meta">Field-to-office, project controls</span>
        </a>
        <a href="/industry-transportation-logistics/" class="mega-industry-tile mega-industry-tile--logistics">
          <span class="mega-industry-tile__title">Transportation &amp; Logistics</span>
          <span class="mega-industry-tile__meta">Forecasting, dispatch, freight</span>
        </a>
        <a href="/industry-energy-natural-resources/" class="mega-industry-tile mega-industry-tile--energy">
          <span class="mega-industry-tile__title">Energy &amp; Natural Resources</span>
          <span class="mega-industry-tile__meta">Asset reliability, regulatory trails</span>
        </a>
        <a href="/industry-distribution-wholesale/" class="mega-industry-tile mega-industry-tile--distribution">
          <span class="mega-industry-tile__title">Distribution &amp; Wholesale</span>
          <span class="mega-industry-tile__meta">Inventory, demand, exception flow</span>
        </a>
        <a href="/industry-industrial-equipment/" class="mega-industry-tile mega-industry-tile--equipment">
          <span class="mega-industry-tile__title">Industrial Equipment</span>
          <span class="mega-industry-tile__meta">Aftermarket, parts, service</span>
        </a>
        <a href="/industry-specialty-manufacturing/" class="mega-industry-tile mega-industry-tile--specialty">
          <span class="mega-industry-tile__title">Specialty Manufacturing</span>
          <span class="mega-industry-tile__meta">High-mix, low-volume reality</span>
        </a>
        <a href="/industry-professional-technical-services/" class="mega-industry-tile mega-industry-tile--professional">
          <span class="mega-industry-tile__title">Professional &amp; Technical Services</span>
          <span class="mega-industry-tile__meta">Knowledge work, delivery systems</span>
        </a>
        <a href="/industry-financial-services-banking/" class="mega-industry-tile mega-industry-tile--financial">
          <span class="mega-industry-tile__title">Financial Services &amp; Banking</span>
          <span class="mega-industry-tile__meta">Controls, reporting, risk</span>
        </a>
        <a href="/industry-ai-data-it-systems/" class="mega-industry-tile mega-industry-tile--ai-data">
          <span class="mega-industry-tile__title">AI, Data &amp; IT Systems</span>
          <span class="mega-industry-tile__meta">System owners, data teams</span>
        </a>
      </div>
    </div>
  </div>`;

// Anchor on the marker class `mega-grid` inside #mega-industries — the
// methodology and insights menus do not use that class, so we can't
// match the wrong block. Match lazily through the third closing </div>.
const RE =
  /<div id="mega-industries"[^>]*>\s*<div class="mega-menu-inner">[\s\S]*?<div class="mega-grid">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/;

const files = await walk(ROOT);
let updated = 0;
let already = 0;
let skipped = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('scripts' + path.sep)) continue;

  const src = await readFile(file, 'utf8');
  if (!src.includes('id="mega-industries"')) continue;

  if (src.includes('mega-industry-tiles')) {
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
