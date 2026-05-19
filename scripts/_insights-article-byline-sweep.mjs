#!/usr/bin/env node
// One-shot sweep: add an article-level byline ("By <Author> ·
// <Date>") between the hero <figure class="insight-detail-image">
// and the <article class="insight-detail-body"> on every insight
// article detail page.
//
// Author mapping mirrors the index card byline sweep:
//   - Jason Kapcar: "When AI Governance Is the Job, Not the Paperwork"
//   - Jason Kapcar: "Workflow Optimization Needs Governance to Last"
//   - Ben DeMichael: everything else.
//
// Date source: the Article JSON-LD's datePublished field already
// embedded in <head>. Falls back to a byline without a date if the
// page doesn't have datePublished set.
//
// Idempotent: skips pages that already contain
//   class="insight-article-byline"
//
// Run from repo root:
//   node scripts/_insights-article-byline-sweep.mjs

import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.git') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const JASON_TITLES = new Set([
  'When AI Governance Is the Job, Not the Paperwork',
  'Workflow Optimization Needs Governance to Last',
]);

function normalize(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lsquo;|&rsquo;|&#8216;|&#8217;|‘|’/g, "'")
    .replace(/&ldquo;|&rdquo;|&#8220;|&#8221;|“|”/g, '"')
    .replace(/&mdash;|&#8212;|—/g, '—')
    .trim();
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function formatDate(iso) {
  // iso looks like "2026-05-19"
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const [, y, mo, d] = m;
  return `${MONTHS[parseInt(mo, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}

const files = await walk(ROOT);
let processed = 0, inserted = 0, skipped = 0, notMatched = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('scripts' + path.sep)) continue;

  const src = await readFile(file, 'utf8');

  // Must be an article detail page — detect via the figure +
  // article-body pattern.
  if (!src.includes('class="insight-detail-image"') ||
      !src.includes('class="insight-detail-body"')) {
    continue;
  }
  processed++;

  // Idempotency: skip already-converted pages.
  if (src.includes('class="insight-article-byline"')) {
    skipped++;
    continue;
  }

  // Extract title from <h1 ... data-insight-title>TITLE</h1>
  const titleMatch = src.match(/<h1[^>]*data-insight-title[^>]*>([^<]+)<\/h1>/);
  if (!titleMatch) { notMatched++; console.log('NO TITLE', rel); continue; }
  const title = normalize(titleMatch[1]);

  // Extract datePublished from any Article JSON-LD block.
  const dateMatch = src.match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})"/);
  const dateIso = dateMatch ? dateMatch[1] : null;
  const dateFormatted = dateIso ? formatDate(dateIso) : null;

  const author = JASON_TITLES.has(title) ? 'Jason Kapcar' : 'Ben DeMichael';

  // Build the byline element. If we have a date, render it with
  // a middot separator; otherwise just the author line.
  const byline = dateFormatted
    ? `<p class="insight-article-byline">By ${author}<span class="insight-article-byline__sep" aria-hidden="true">&middot;</span><span class="insight-article-byline__date">${dateFormatted}</span></p>`
    : `<p class="insight-article-byline">By ${author}</p>`;

  // Insert between </figure> and the <article ...> tag. Capture the
  // existing indentation so the output stays clean.
  const RE = /(<\/figure>)(\s*)(<article class="insight-detail-body"[^>]*>)/;
  if (!RE.test(src)) { notMatched++; console.log('NO ANCHOR', rel); continue; }

  const next = src.replace(RE, (_, fig, ws, article) => {
    return `${fig}\n      ${byline}\n${ws}${article}`;
  });

  await writeFile(file, next, 'utf8');
  inserted++;
  console.log(`${rel} — By ${author}${dateFormatted ? ' · ' + dateFormatted : ''}`);
}

console.log('');
console.log(`Done. detail-pages-processed=${processed}, bylines-inserted=${inserted}, already-converted=${skipped}, no-match=${notMatched}`);
