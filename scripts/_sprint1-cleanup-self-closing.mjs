#!/usr/bin/env node
// Cleanup: when an <img /> (self-closing) had attrs appended by the
// previous sweep, the slash ended up in the middle of the attr
// list, producing markup like <img ... / fetchpriority="high">.
// HTML5 tolerates this but it's ugly. Normalize to a single trailing
// slash before the closing > on void <img> tags.

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

const files = await walk(ROOT);
let pages = 0, tags = 0;
for (const f of files) {
  const rel = path.relative(ROOT, f);
  if (rel.startsWith('scripts' + path.sep)) continue;
  const src = await readFile(f, 'utf8');
  // Collapse misplaced "/ " inside <img ...> tags
  const next = src.replace(/<img\b[^>]*>/g, (tag) => {
    if (!/\/\s/.test(tag.slice(0, -1))) return tag;
    // Remove all " / " sequences that aren't immediately before the
    // closing >, then add a single trailing " />" if it isn't there.
    let inner = tag.slice(4, -1).replace(/\s*\/\s+/g, ' ').replace(/\s+/g, ' ').trim();
    tags++;
    return `<img ${inner}>`;
  });
  if (next !== src) { await writeFile(f, next, 'utf8'); pages++; }
}
console.log(`cleaned tags=${tags}, pages=${pages}`);
