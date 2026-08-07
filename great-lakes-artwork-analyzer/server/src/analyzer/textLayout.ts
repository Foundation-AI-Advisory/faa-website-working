/**
 * Text extraction with positions.
 *
 * pdf.js does the character-mapping work (encoding Differences, ToUnicode, CID
 * maps); this module reassembles the items into positioned words and lines and
 * attributes each one to the Illustrator marked-content group it was drawn in.
 */
import type { ContentScan } from './contentStream.js';

export interface TextItem {
  page: number;
  text: string;
  /** Baseline origin in PDF user space (points, y-up). */
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  group: string | null;
}

export interface TextLine {
  page: number;
  y: number;
  x: number;
  x1: number;
  text: string;
  group: string | null;
  items: TextItem[];
}

export interface PageText {
  page: number;
  items: TextItem[];
  lines: TextLine[];
  plain: string;
}

let pdfjsPromise: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfjsPromise;
}

/** Assign each text item to a marked-content group by matching show-op origins. */
function attributeGroups(items: TextItem[], scan: ContentScan | undefined): void {
  if (!scan || scan.texts.length === 0) return;
  const ops = scan.texts;
  // Bucket show ops by rounded y for a cheap nearest lookup.
  const buckets = new Map<number, typeof ops>();
  for (const o of ops) {
    const key = Math.round(o.y);
    const arr = buckets.get(key);
    if (arr) arr.push(o);
    else buckets.set(key, [o]);
  }
  for (const it of items) {
    let best: (typeof ops)[number] | null = null;
    let bestD = Infinity;
    for (let dy = -2; dy <= 2; dy += 1) {
      const arr = buckets.get(Math.round(it.y) + dy);
      if (!arr) continue;
      for (const o of arr) {
        const d = Math.abs(o.x - it.x) + Math.abs(o.y - it.y) * 2;
        if (d < bestD) {
          bestD = d;
          best = o;
        }
      }
    }
    // 24pt is generous enough for TJ kerning offsets but tight enough that an
    // item never borrows a group from an unrelated block.
    if (best && bestD < 24) it.group = best.group;
  }
}

/**
 * Column boundaries are the x positions of tall vertical rules on the page.
 *
 * Proof sign-off blocks are tables, and two cells side by side share a baseline.
 * Without this, "Substrate" and "Flexo Print Inks and Varnishes" would be read as
 * one line and every field in them would be lost.
 */
export function columnBoundaries(scan: ContentScan | undefined): number[] {
  if (!scan) return [];
  const xs: number[] = [];
  for (const seg of scan.segments) {
    if (seg.painted !== 'stroke' && seg.painted !== 'both') continue;
    const w = seg.bbox[2] - seg.bbox[0];
    const h = seg.bbox[3] - seg.bbox[1];
    if (w > 2 || h < 24) continue;
    xs.push((seg.bbox[0] + seg.bbox[2]) / 2);
  }
  xs.sort((a, b) => a - b);
  const merged: number[] = [];
  for (const x of xs) {
    if (merged.length === 0 || x - merged[merged.length - 1] > 3) merged.push(x);
  }
  return merged;
}

function crossesBoundary(a: number, b: number, boundaries: number[]): boolean {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return boundaries.some((x) => x > lo + 0.5 && x < hi - 0.5);
}

export async function extractText(
  bytes: Uint8Array,
  scans: (ContentScan | undefined)[],
): Promise<PageText[]> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;

  const out: PageText[] = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent({ includeMarkedContent: false });
    const items: TextItem[] = [];
    for (const raw of content.items) {
      const it = raw as {
        str?: string;
        transform?: number[];
        width?: number;
        height?: number;
        fontName?: string;
      };
      if (typeof it.str !== 'string' || it.str === '' || !it.transform) continue;
      const t = it.transform;
      const fontSize = Math.hypot(t[2], t[3]) || Math.hypot(t[0], t[1]);
      items.push({
        page: p,
        text: it.str,
        x: t[4],
        y: t[5],
        width: it.width ?? 0,
        height: it.height ?? fontSize,
        fontSize,
        fontName: it.fontName ?? '',
        group: null,
      });
    }
    attributeGroups(items, scans[p - 1]);

    // Group into visual lines: same baseline, same table column.
    const bounds = columnBoundaries(scans[p - 1]);
    const sorted = [...items].sort((a, b) => (b.y - a.y) || (a.x - b.x));
    const lines: TextLine[] = [];
    for (const it of sorted) {
      const tol = Math.max(1.5, it.fontSize * 0.35);
      const line = lines.find(
        (l) =>
          Math.abs(l.y - it.y) <= tol &&
          l.page === it.page &&
          !crossesBoundary(l.x1, it.x, bounds) &&
          !crossesBoundary(l.x, it.x, bounds),
      );
      if (line) {
        line.items.push(it);
        line.x = Math.min(line.x, it.x);
        line.x1 = Math.max(line.x1, it.x + it.width);
      } else {
        lines.push({ page: p, y: it.y, x: it.x, x1: it.x + it.width, text: '', group: it.group, items: [it] });
      }
    }
    for (const line of lines) {
      line.items.sort((a, b) => a.x - b.x);
      let text = '';
      let prevEnd: number | null = null;
      for (const it of line.items) {
        if (prevEnd !== null) {
          const gap = it.x - prevEnd;
          // A gap wider than a quarter em reads as a space.
          if (gap > it.fontSize * 0.22 && !/\s$/.test(text) && !/^\s/.test(it.text)) text += ' ';
        }
        text += it.text;
        prevEnd = it.x + it.width;
      }
      line.text = text.replace(/\s+/g, ' ').trim();
      const groups = new Set(line.items.map((i) => i.group).filter(Boolean) as string[]);
      line.group = groups.size === 1 ? [...groups][0] : line.items[0]?.group ?? null;
    }
    const kept = lines.filter((l) => l.text.length > 0).sort((a, b) => (b.y - a.y) || (a.x - b.x));
    out.push({
      page: p,
      items,
      lines: kept,
      plain: kept.map((l) => l.text).join('\n'),
    });
    page.cleanup();
  }
  await doc.destroy();
  return out;
}
