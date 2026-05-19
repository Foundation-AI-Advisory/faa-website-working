#!/usr/bin/env node
// One-shot sweep: add a "By <Author>" byline to every article card
// on the /insights/ index. Inserts a <p class="insight-card-author">
// between the card's <h3> title and the description <p>.
//
// Author mapping:
//   - Two articles by Jason Kapcar:
//       * "When AI Governance Is the Job, Not the Paperwork"
//       * "Workflow Optimization Needs Governance to Last"
//   - Every other card on the page → Ben DeMichael.
//
// Idempotent: skips cards that already carry .insight-card-author.
//
// Run from repo root:
//   node scripts/_insights-author-byline-sweep.mjs

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const FILE = path.join(ROOT, 'insights', 'index.html');

const JASON_TITLES = new Set([
  'When AI Governance Is the Job, Not the Paperwork',
  'Workflow Optimization Needs Governance to Last',
]);

// Normalize HTML entities + smart quotes back to plain ASCII so the
// JASON_TITLES set lookup is reliable. The page uses &rsquo;,
// &mdash;, etc. — we don't normalize those in the markup, we just
// normalize the comparison key.
function normalize(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lsquo;|&rsquo;|&#8216;|&#8217;|‘|’/g, "'")
    .replace(/&ldquo;|&rdquo;|&#8220;|&#8221;|“|”/g, '"')
    .replace(/&mdash;|&#8212;|—/g, '—');
}

const src = await readFile(FILE, 'utf8');

// Match each insight card's <h3 style="font-size: 19px..."> title.
// Capture the inner title text, then walk forward to the next <p
// style="color: var(--faa-gray-600)..."> description (the body
// paragraph) and insert the byline just before that <p>.
const TITLE_RE = /(<h3 style="font-size: 19px; font-weight: 600; line-height: 1\.3;">([^<]+)<\/h3>)\s*(<p style="color: var\(--faa-gray-600\);)/g;

let inserted = 0;
let skipped = 0;
const next = src.replace(TITLE_RE, (full, titleTag, titleText, descStart) => {
  // Skip if this card already has a byline (idempotency check —
  // since the byline sits between </h3> and <p>, we detect it by
  // looking at the segment we matched). The regex above won't match
  // if there's a <p class="insight-card-author"> between </h3> and
  // the description <p>, because the \s* won't span an element. So
  // any match here is by definition uncovered.
  const title = normalize(titleText.trim());
  const author = JASON_TITLES.has(title) ? 'Jason Kapcar' : 'Ben DeMichael';
  inserted++;
  return `${titleTag}\n          <p class="insight-card-author">By ${author}</p>\n          ${descStart}`;
});

if (next === src) {
  console.log('No changes — pages may already be updated.');
} else {
  await writeFile(FILE, next, 'utf8');
  console.log(`Updated insights/index.html`);
  console.log(`  Bylines inserted: ${inserted}`);
}

// Verify how the two Jason articles landed
const verify = await readFile(FILE, 'utf8');
const jasonCount = (verify.match(/By Jason Kapcar/g) || []).length;
const benCount = (verify.match(/By Ben DeMichael/g) || []).length;
console.log(`  By Jason Kapcar: ${jasonCount}`);
console.log(`  By Ben DeMichael: ${benCount}`);
