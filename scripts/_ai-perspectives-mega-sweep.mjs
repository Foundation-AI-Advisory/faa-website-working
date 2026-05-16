#!/usr/bin/env node
// One-shot sweep: replace the `#mega-insights` dropdown block in every
// HTML page that embeds the site header. The dropdown markup is
// duplicated across 50+ pages because the header is server-side-
// included by manual copy, not a template — so any structural change
// needs to be applied to all copies in one pass.
//
// Idempotent: re-running it against pages already migrated is a no-op
// (the OLD pattern won't match anymore).
//
// Run from repo root:  node scripts/_ai-perspectives-mega-sweep.mjs

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

// Match the OLD AI Perspectives dropdown block — opening
// `<div id="mega-insights" ...>` through its closing `</div></div>`.
// The block is two levels deep (mega-menu > mega-menu-inner > content)
// so the regex non-greedily captures everything up to and including
// the closing tags for both wrappers.
const RE = /<div id="mega-insights" class="mega-menu" role="region" aria-label="AI Perspectives">\s*<div class="mega-menu-inner">[\s\S]*?<\/div>\s*<\/div>/;

// New replacement block. Keep aria-label and id stable so nav.js
// continues to open/close it via the existing utilnav-link[data-mega]
// trigger.
const NEW = `<div id="mega-insights" class="mega-menu" role="region" aria-label="AI Perspectives">
    <div class="mega-menu-inner">
      <p class="mega-insights-intro">Practical AI perspectives for executives improving data, workflows, and operating systems before automation.</p>
      <div class="mega-grid-3 mega-insights-grid">
        <div class="mega-insights-featured">
          <span class="mega-insights-featured__eyebrow">Start here</span>
          <h4 class="mega-group-heading">Featured Perspective</h4>
          <a href="/ai-frontiers/" class="mega-link mega-insights-featured__primary">AI Frontiers<span class="mega-link-dek">Beyond the obvious use cases</span></a>
          <a href="/insights/#foundations-series" class="mega-link">Foundations Series<span class="mega-link-dek">Five-part field series</span></a>
          <a href="/insights/#subscribe" class="mega-link">Subscribe<span class="mega-link-dek">Get the running record</span></a>
          <a href="/insights/" class="mega-link mega-insights-featured__hub">All AI Perspectives <span class="mega-insights-featured__arrow" aria-hidden="true">&rarr;</span><span class="mega-link-dek">The full executive hub</span></a>
        </div>
        <div class="mega-insights-pillars">
          <h4 class="mega-group-heading">By Business Foundation</h4>
          <a href="/foundation/" class="mega-link mega-insights-pillar"><span class="mega-insights-pillar__num">01</span><span class="mega-insights-pillar__body">Data Curation &amp; Governance<span class="mega-link-dek">Fix the records AI depends on</span></span></a>
          <a href="/operations/" class="mega-link mega-insights-pillar"><span class="mega-insights-pillar__num">02</span><span class="mega-insights-pillar__body">Workflow Optimization<span class="mega-link-dek">Remove friction before automation</span></span></a>
          <a href="/agentic-ai/" class="mega-link mega-insights-pillar"><span class="mega-insights-pillar__num">03</span><span class="mega-insights-pillar__body">AI Design &amp; Implementation<span class="mega-link-dek">Deploy AI with ownership and controls</span></span></a>
        </div>
        <div class="mega-insights-format">
          <h4 class="mega-group-heading">By Format</h4>
          <div class="mega-insights-format__grid">
            <a href="/insights/?format=article" class="mega-link">Articles<span class="mega-link-dek">Long-form analysis</span></a>
            <a href="/insights/?format=brief" class="mega-link">Briefs<span class="mega-link-dek">Short-form executive reads</span></a>
            <a href="/insights/?format=field-note" class="mega-link">Field Notes<span class="mega-link-dek">Lessons from the engagement floor</span></a>
            <a href="/insights/?format=infographic" class="mega-link">Infographics<span class="mega-link-dek">Visual operating explainers</span></a>
            <a href="/insights/?format=podcast" class="mega-link">Podcast<span class="mega-link-dek">Operator conversations</span></a>
            <a href="/insights/?format=video" class="mega-link">Video<span class="mega-link-dek">Working sessions</span></a>
          </div>
        </div>
      </div>
      <div class="mega-insights-footer">
        <p class="mega-insights-footer__copy">New to FAA perspectives? Start with the foundation: data, workflow, and AI design before automation.</p>
        <a href="/insights/" class="mega-insights-footer__cta">Explore all perspectives <span aria-hidden="true">&rarr;</span></a>
      </div>
    </div>
  </div>`;

const files = await walk(ROOT);
let updated = 0;
let skipped = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('scripts' + path.sep)) continue;

  const src = await readFile(file, 'utf8');
  if (!RE.test(src)) {
    skipped++;
    continue;
  }

  const next = src.replace(RE, NEW);
  if (next === src) {
    skipped++;
    continue;
  }

  await writeFile(file, next, 'utf8');
  updated++;
  console.log('UPDATED', rel);
}

console.log(`\nDone. updated=${updated}, skipped=${skipped}`);
