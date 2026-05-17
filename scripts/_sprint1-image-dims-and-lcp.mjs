#!/usr/bin/env node
// Sprint 1 sweep: add width/height to every <img>, mark hero images
// with fetchpriority="high" + loading="eager", and drop the legacy
// runtime renderer JS includes from pages whose <main> is now
// prerendered.
//
// Reads image binary headers (PNG + WebP, the only two formats in
// /assets/) to get true dimensions — no npm dependency. Falls back
// to a sensible default for any image whose header can't be parsed.
//
// Idempotent: re-running it skips imgs that already carry width=
// and re-skips the JS removal where the include is already gone.
//
// Run from repo root:
//   node scripts/_sprint1-image-dims-and-lcp.mjs

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

// ─────────────────────────────────────────────────────────────────
// Image dimensions: parse binary headers
// ─────────────────────────────────────────────────────────────────

async function getImageDimensions(filePath) {
  let buf;
  try { buf = await readFile(filePath); } catch { return null; }

  // PNG: signature 0x89 0x50 0x4E 0x47, then IHDR has width/height at byte 16-23 (big-endian).
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // WebP: RIFF .... WEBP <chunk_type>
  if (buf.length > 30 &&
      buf.slice(0, 4).toString() === 'RIFF' &&
      buf.slice(8, 12).toString() === 'WEBP') {
    const chunkType = buf.slice(12, 16).toString();
    if (chunkType === 'VP8X') {
      const w = buf[24] | (buf[25] << 8) | (buf[26] << 16);
      const h = buf[27] | (buf[28] << 8) | (buf[29] << 16);
      return { width: w + 1, height: h + 1 };
    }
    if (chunkType === 'VP8L') {
      const packed = buf.readUInt32LE(21);
      return {
        width: (packed & 0x3FFF) + 1,
        height: ((packed >> 14) & 0x3FFF) + 1,
      };
    }
    if (chunkType === 'VP8 ') {
      return {
        width: buf.readUInt16LE(26) & 0x3FFF,
        height: buf.readUInt16LE(28) & 0x3FFF,
      };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────
// Walk helpers
// ─────────────────────────────────────────────────────────────────

async function walk(dir, predicate) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.git')) continue;
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walk(full, predicate));
    } else if (entry.isFile() && predicate(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────
// Build the asset → dimensions map
// ─────────────────────────────────────────────────────────────────

console.log('Building image dimensions map...');
const assetFiles = await walk(path.join(ROOT, 'assets'), n => /\.(png|webp|jpe?g)$/i.test(n));
const dimMap = new Map();
for (const f of assetFiles) {
  const dims = await getImageDimensions(f);
  if (dims) {
    const webPath = '/' + path.relative(ROOT, f).split(path.sep).join('/');
    dimMap.set(webPath, dims);
  }
}
console.log(`  parsed ${dimMap.size} of ${assetFiles.length} image files`);

// ─────────────────────────────────────────────────────────────────
// HTML sweep
// ─────────────────────────────────────────────────────────────────

const htmlFiles = await walk(ROOT, n => n.endsWith('.html'));
let imgUpdated = 0;
let imgSkipped = 0;
let heroPriorityUpdated = 0;
let jsRemoved = 0;
let pagesUpdated = 0;

for (const file of htmlFiles) {
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('scripts' + path.sep)) continue;

  let src = await readFile(file, 'utf8');
  const original = src;

  // ── Step A: add width="" height="" to every <img> that lacks them
  // Match <img ... src="/assets/..." ...> tags. Self-closing or not.
  src = src.replace(/<img\b[^>]*>/g, (tag) => {
    if (/\bwidth=/.test(tag)) { imgSkipped++; return tag; }
    const srcMatch = tag.match(/\bsrc="([^"]+)"/);
    if (!srcMatch) return tag;
    const url = srcMatch[1];
    // Normalize URL → asset map key
    let key = url;
    if (key.startsWith('https://foundationaiadvisory.com')) {
      key = key.replace('https://foundationaiadvisory.com', '');
    }
    // Skip non-local images (CDN-hosted, data URIs, etc.)
    if (!key.startsWith('/assets/') && !key.startsWith('/')) return tag;
    const dims = dimMap.get(key);
    if (!dims) { imgSkipped++; return tag; }
    // Insert width + height right after src=""
    imgUpdated++;
    return tag.replace(
      /(\bsrc="[^"]+")/,
      `$1 width="${dims.width}" height="${dims.height}"`
    );
  });

  // ── Step B: hero LCP priority
  // First <img class="insight-detail-image"> on an insight detail page
  // and any <img class="page-hero-collage__cell"> first child get
  // fetchpriority="high" + loading="eager".
  // Pattern 1: insight detail hero
  src = src.replace(
    /<img\b([^>]*?)class="insight-detail-image-img"([^>]*)>/g,
    (tag, before, after) => {
      if (/fetchpriority=/.test(tag)) return tag;
      heroPriorityUpdated++;
      return `<img${before}class="insight-detail-image-img"${after} fetchpriority="high" loading="eager">`;
    }
  );
  // Pattern 2: figure.insight-detail-image > img (the actual hero markup)
  // Match <figure class="insight-detail-image">\s*<img ...>
  src = src.replace(
    /(<figure class="insight-detail-image">\s*<img\b)([^>]*?)>/g,
    (full, head, attrs) => {
      if (/fetchpriority=/.test(attrs)) return full;
      // Remove loading="lazy" if present, add eager + fetchpriority
      let next = attrs.replace(/\s*loading="lazy"/, '');
      next += ' fetchpriority="high" loading="eager"';
      heroPriorityUpdated++;
      return `${head}${next}>`;
    }
  );
  // Pattern 3: industries collage first cell
  src = src.replace(
    /(<div class="page-hero-collage" aria-hidden="true">\s*<div class="page-hero-collage__cell"><img\b)([^>]*?)>/g,
    (full, head, attrs) => {
      if (/fetchpriority=/.test(attrs)) return full;
      let next = attrs.replace(/\s*loading="lazy"/, '');
      next += ' fetchpriority="high" loading="eager"';
      heroPriorityUpdated++;
      return `${head}${next}>`;
    }
  );

  // ── Step C: remove legacy runtime renderer JS from prerendered pages
  // Pages that have <!--PRERENDERED--> marker or contain the prerendered
  // article body shouldn't load foundations-series.js / insight-detail.js.
  // We detect a prerendered insight page by presence of
  // `data-insight-body` (the prerender writes that attribute on the
  // article element).
  const isPrerendered = src.includes('data-insight-body') || src.includes('<!--PRERENDERED-->');
  if (isPrerendered) {
    if (src.includes('<script src="/insight-detail.js"')) {
      src = src.replace(/\s*<script src="\/insight-detail\.js"[^>]*><\/script>/g, '');
      jsRemoved++;
    }
    if (src.includes('<script src="/foundations-series.js"')) {
      src = src.replace(/\s*<script src="\/foundations-series\.js"[^>]*><\/script>/g, '');
      jsRemoved++;
    }
  }

  if (src !== original) {
    await writeFile(file, src, 'utf8');
    pagesUpdated++;
  }
}

console.log('');
console.log(`Done.`);
console.log(`  <img> updated with width/height: ${imgUpdated}`);
console.log(`  <img> skipped (already had width or no asset match): ${imgSkipped}`);
console.log(`  Hero LCP priority added: ${heroPriorityUpdated}`);
console.log(`  Legacy JS includes removed: ${jsRemoved}`);
console.log(`  Pages updated: ${pagesUpdated}`);
