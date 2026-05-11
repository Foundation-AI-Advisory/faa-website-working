// Throwaway: swap related-insight card images for the "How Work Actually
// Gets Done vs How It's Documented" brief on the 4 pages that surface it
// as a related-insight card (3 industry pages + the operations page).
// The Insights index card and the article page itself were already
// swapped via inline Edit. This script targets the remaining 4 files
// using a precise multi-line anchor that includes the article URL and
// the existing image src — guaranteeing we don't touch any unrelated
// use of the same image filename elsewhere on the site.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));

const FILES = [
  'industry-engineering-construction-infrastructure/index.html',
  'industry-manufacturing-industrial-production/index.html',
  'industry-specialty-manufacturing/index.html',
  'operations/index.html',
];

// Anchor: a <card> linking to this brief whose image src is the legacy
// human-in-the-loop-workflow-mapping. We replace the src and update alt
// text to match the new SOP/Reality whiteboard composition.
const OLD = '<a href="/insights/how-work-actually-gets-done-vs-how-its-documented/" class="card">\n        <div class="card-image">\n          <img src="/assets/insights/human-in-the-loop-workflow-mapping.webp" alt="Two professionals mapping decision workflows and process logic" loading="lazy" />';
const NEW = '<a href="/insights/how-work-actually-gets-done-vs-how-its-documented/" class="card">\n        <div class="card-image">\n          <img src="/assets/insights/how-work-actually-gets-done-vs-how-its-documented.webp" alt="Side-by-side whiteboards comparing the documented SOP workflow against how work actually gets done in practice, with exceptions and informal approvals annotated." loading="lazy" />';

let touched = 0, already = 0, nohook = 0;
for (const f of FILES) {
  if (!fs.existsSync(f)) { console.warn('missing:', f); continue; }
  const before = fs.readFileSync(f, 'utf8');
  if (before.includes(NEW)) { already++; continue; }
  if (!before.includes(OLD)) { nohook++; console.warn('no-hook:', f); continue; }
  fs.writeFileSync(f, before.replace(OLD, NEW));
  touched++;
  console.log('updated:', f);
}
console.log('Done. Touched:', touched, 'Already:', already, 'No-hook:', nohook);
