/**
 * Interpretation of the proof sign-off block that Great Lakes Label proofs carry.
 *
 * Everything here is driven by geometry and text found in the file:
 *   - a ballot-box glyph is "checked" when stroked marks fall inside its box
 *   - a print method is selected when its heading sits inside a highlight fill
 *   - labelled fields are read from positioned text, not from fixed coordinates
 *
 * No coordinate, colour, or value from any particular proof is hard-coded.
 */
import type { ContentScan, SegmentRecord } from './contentStream.js';
import { columnBoundaries, type PageText, type TextItem, type TextLine } from './textLayout.js';

/** Unicode ballot boxes: empty, checked, and X-ed. */
const BALLOT_EMPTY = '☐';
const BALLOT_CHECK = '☑';
const BALLOT_X = '☒';
const BALLOT_ANY = /[☐☑☒□◻❑]/;

const LIGATURES: Record<string, string> = {
  'ﬀ': 'ff',
  'ﬁ': 'fi',
  'ﬂ': 'fl',
  'ﬃ': 'ffi',
  'ﬄ': 'ffl',
  'ﬅ': 'st',
  'ﬆ': 'st',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '–': '-',
  '—': '-',
  ' ': ' ',
};

export function normalizeText(s: string): string {
  let out = '';
  for (const ch of s) out += LIGATURES[ch] ?? ch;
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Canonical display name for an ink.
 *
 * PANTONE / PMS references are folded to one spelling ("PANTONE 214 C",
 * "PMS 214C" and "pms 214 c" all become "PMS 214 C") so the proof ink list and
 * the PDF separation names can be compared. Every other name keeps the spelling
 * the file uses, because that is what prepress will look for.
 */
export function normalizeColorName(name: string): string {
  const n = normalizeText(name);
  const pms = /^\s*(?:PANTONE|PMS|P\.M\.S\.)\s*([0-9]+[A-Za-z]*)\s*([A-Za-z]{1,3})?\s*$/i.exec(n);
  if (pms) {
    const code = pms[1].toUpperCase();
    const suffix = pms[2] ? ` ${pms[2].toUpperCase()}` : '';
    const trailing = /^(\d+)([A-Z]+)$/.exec(code);
    if (trailing && !pms[2]) return `PMS ${trailing[1]} ${trailing[2]}`;
    return `PMS ${code}${suffix}`;
  }
  const processMatch = /^(cyan|magenta|yellow|black)$/i.exec(n);
  if (processMatch) return processMatch[1][0].toUpperCase() + processMatch[1].slice(1).toLowerCase();
  return n;
}

/** Case-insensitive key for matching ink names across sources. */
export function colorKey(name: string): string {
  return normalizeColorName(name).toUpperCase();
}

export interface CheckboxField {
  label: string;
  checked: boolean;
  /** How the state was decided. */
  evidence: string;
  confidence: number;
  x: number;
  y: number;
  page: number;
  region: [number, number, number, number];
}

export interface HighlightedHeading {
  text: string;
  /** Highlight rectangle in user space. */
  rect: [number, number, number, number];
  page: number;
  fillHex: string;
}

export interface ProofBlock {
  checkboxes: CheckboxField[];
  highlights: HighlightedHeading[];
  /** Every text line, ligature-normalised, in reading order. */
  lines: TextLine[];
  /** Underlying positioned items, for column-scoped lookups. */
  page: PageText;
  /** x positions of the page's vertical table rules. */
  columns: number[];
}

function boxOfItem(it: TextItem): [number, number, number, number] {
  const w = it.width > 0 ? it.width : it.fontSize * 0.75;
  // Ballot glyphs sit roughly on the baseline with a small descender.
  return [it.x, it.y - it.fontSize * 0.1, it.x + w, it.y + it.fontSize * 0.78];
}

function contains(
  outer: [number, number, number, number],
  inner: [number, number, number, number],
  pad = 0,
): boolean {
  return (
    inner[0] >= outer[0] - pad &&
    inner[1] >= outer[1] - pad &&
    inner[2] <= outer[2] + pad &&
    inner[3] <= outer[3] + pad
  );
}

function isSmallSquare(seg: SegmentRecord): boolean {
  const w = seg.bbox[2] - seg.bbox[0];
  const h = seg.bbox[3] - seg.bbox[1];
  if (w < 3 || h < 3 || w > 20 || h > 20) return false;
  const ratio = w / h;
  return ratio > 0.72 && ratio < 1.38;
}

/**
 * Decide whether a checkbox is ticked.
 *
 * A ballot glyph that already encodes its state (U+2611 / U+2612) is taken at its
 * word. Otherwise we look for short stroked marks drawn inside the box — the way
 * Illustrator proofs mark a box that uses an empty ballot glyph from the font.
 */
function markInside(
  box: [number, number, number, number],
  segments: SegmentRecord[],
): SegmentRecord[] {
  const w = box[2] - box[0];
  const h = box[3] - box[1];
  const pad = Math.max(w, h) * 0.28;
  return segments.filter((s) => {
    if (s.painted === 'none') return false;
    const sw = s.bbox[2] - s.bbox[0];
    const sh = s.bbox[3] - s.bbox[1];
    // The mark has to be smaller than the box but not a hairline artefact.
    if (sw > w * 1.35 || sh > h * 1.35) return false;
    if (sw < w * 0.15 && sh < h * 0.15) return false;
    return contains(box, s.bbox, pad);
  });
}

export function findCheckboxes(pageText: PageText, scan: ContentScan): CheckboxField[] {
  const out: CheckboxField[] = [];
  const strokeSegs = scan.segments.filter(
    (s) => (s.painted === 'stroke' || s.painted === 'both' || s.painted === 'fill') && s.kind !== 'rect',
  );

  const claimed: [number, number, number, number][] = [];

  // A ballot glyph is usually merged into the same text item as its caption, so
  // the glyph is located inside the item's string rather than by item boundary.
  for (const it of pageText.items) {
    const chars = [...it.text];
    for (let ci = 0; ci < chars.length; ci += 1) {
      const ch = chars[ci];
      if (!BALLOT_ANY.test(ch)) continue;
      const advance = chars.length > 0 && it.width > 0 ? it.width / chars.length : it.fontSize * 0.5;
      const glyphX = it.x + advance * ci;
      const box = boxOfItem({ ...it, x: glyphX, width: it.fontSize * 0.72 });
      claimed.push(box);

      let checked: boolean;
      let evidence: string;
      let confidence: number;
      if (ch === BALLOT_CHECK || ch === BALLOT_X) {
        checked = true;
        evidence = `Ballot glyph U+${ch.codePointAt(0)!.toString(16).toUpperCase()} encodes a checked box.`;
        confidence = 0.95;
      } else {
        const marks = markInside(box, strokeSegs);
        checked = marks.length > 0;
        evidence = checked
          ? `${marks.length} stroked mark${marks.length === 1 ? '' : 's'} drawn inside the empty ballot glyph at (${glyphX.toFixed(1)}, ${it.y.toFixed(1)}).`
          : 'Empty ballot glyph with no marks drawn inside it.';
        confidence = checked ? 0.9 : 0.85;
      }

      // Caption: the rest of this item after the glyph, then any items to its right.
      const inline = normalizeText(chars.slice(ci + 1).join(''));
      const labelStartX = it.x + advance * (ci + 1);
      // Where the merged item ends — anything past a wide gap from here is a
      // neighbouring table cell, not part of this caption.
      const captionEndX = inline ? it.x + advance * chars.length : labelStartX;
      const label = labelForCheckbox(labelStartX, it.y, it.fontSize, pageText, inline, captionEndX);
      if (!label) continue;
      out.push({
        label,
        checked,
        evidence,
        confidence,
        x: glyphX,
        y: it.y,
        page: pageText.page,
        region: box,
      });
    }
  }

  // Stroked square boxes used as checkboxes (no glyph involved).
  for (const seg of scan.segments) {
    if (seg.painted !== 'stroke' && seg.painted !== 'both') continue;
    if (seg.kind !== 'rect' || !isSmallSquare(seg)) continue;
    if (claimed.some((c) => contains(c, seg.bbox, 4) || contains(seg.bbox, c, 4))) continue;
    const marks = markInside(seg.bbox, strokeSegs.filter((s) => s !== seg));
    const midY = (seg.bbox[1] + seg.bbox[3]) / 2;
    const label = labelForCheckbox(seg.bbox[2] + 1, midY, seg.bbox[3] - seg.bbox[1], pageText);
    if (!label) continue;
    out.push({
      label,
      checked: marks.length > 0,
      evidence: marks.length
        ? `${marks.length} stroked mark${marks.length === 1 ? '' : 's'} inside a ${(seg.bbox[2] - seg.bbox[0]).toFixed(1)}pt stroked box.`
        : 'Stroked box drawn empty.',
      confidence: 0.8,
      x: seg.bbox[0],
      y: midY,
      page: pageText.page,
      region: seg.bbox,
    });
  }

  return out;
}

/**
 * Read the caption sitting to the right of a checkbox.
 *
 * The caption runs until a horizontal gap wide enough to be a new table cell.
 * Wrapped continuation lines are only accepted when they are left-aligned with
 * the caption and one line-height below it, which keeps a neighbouring column's
 * text out of the label.
 */
function labelForCheckbox(
  x: number,
  y: number,
  size: number,
  pageText: PageText,
  inlineCaption = '',
  captionEndX = x,
): string | null {
  const rowTol = Math.max(2, size * 0.5);
  const candidates = pageText.items
    .filter((i) => Math.abs(i.y - y) <= rowTol && i.x >= x - size * 0.4 && !BALLOT_ANY.test(i.text))
    .sort((a, b) => a.x - b.x);

  // Stop at the first gap wider than ~2.5 em — that is the next cell, not this label.
  const run: TextItem[] = [];
  for (const cand of candidates) {
    if (run.length === 0) {
      // The first item must sit next to the caption so far, not across a rule.
      if (cand.x - captionEndX > size * 2.5) break;
      run.push(cand);
      continue;
    }
    const prev = run[run.length - 1];
    if (cand.x - (prev.x + prev.width) > size * 2.5) break;
    run.push(cand);
  }
  let label = normalizeText([inlineCaption, ...run.map((i) => i.text)].join(' '));
  if (!label) return null;

  const startX = run.length ? Math.min(x, run[0].x) : x;
  let cursorY = y;
  for (let step = 0; step < 2; step += 1) {
    const below = pageText.items
      .filter(
        (i) =>
          i.y < cursorY - size * 0.6 &&
          i.y > cursorY - size * 1.9 &&
          Math.abs(i.x - startX) <= size * 1.5 &&
          !BALLOT_ANY.test(i.text),
      )
      .sort((a, b) => b.y - a.y);
    if (below.length === 0) break;
    const rowY = below[0].y;
    const rowItems = pageText.items
      .filter((i) => Math.abs(i.y - rowY) <= rowTol && i.x >= startX - size * 1.5)
      .sort((a, b) => a.x - b.x);
    if (rowItems.some((i) => BALLOT_ANY.test(i.text))) break;
    const contRun: TextItem[] = [rowItems[0]];
    for (let i = 1; i < rowItems.length; i += 1) {
      const prev = contRun[contRun.length - 1];
      if (rowItems[i].x - (prev.x + prev.width) > size * 2.5) break;
      contRun.push(rowItems[i]);
    }
    const text = normalizeText(contRun.map((i) => i.text).join(' '));
    if (!text || text.length > 40) break;
    label = `${label} ${text}`.trim();
    cursorY = rowY;
  }
  return label.replace(/\s+/g, ' ').trim();
}

function componentsToHex(cs: string, comps: number[] | null): string {
  if (!comps) return '#999999';
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  if (cs === 'DeviceCMYK' && comps.length >= 4) {
    const [c, m, y, k] = comps;
    return `#${[1 - Math.min(1, c + k), 1 - Math.min(1, m + k), 1 - Math.min(1, y + k)]
      .map((v) => clamp(v * 255).toString(16).padStart(2, '0'))
      .join('')}`;
  }
  if (cs === 'DeviceRGB' && comps.length >= 3) {
    return `#${comps.slice(0, 3).map((v) => clamp(v * 255).toString(16).padStart(2, '0')).join('')}`;
  }
  if (cs === 'DeviceGray' && comps.length >= 1) {
    const g = clamp(comps[0] * 255);
    return `#${g.toString(16).padStart(2, '0').repeat(3)}`;
  }
  return '#999999';
}

/** Is this fill a highlight — a saturated colour, not paper white or plain black? */
function isHighlightFill(cs: string, comps: number[] | null): boolean {
  if (!comps) return false;
  if (cs === 'DeviceCMYK' && comps.length >= 4) {
    const [c, m, y, k] = comps;
    const ink = c + m + y;
    if (ink < 0.15) return false; // white or black-only
    if (k > 0.85) return false; // effectively black
    return true;
  }
  if (cs === 'DeviceRGB' && comps.length >= 3) {
    const [r, g, b] = comps;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < 0.12) return false; // grey
    if (max > 0.97 && min > 0.97) return false;
    return true;
  }
  return false;
}

export function findHighlightedHeadings(pageText: PageText, scan: ContentScan): HighlightedHeading[] {
  const out: HighlightedHeading[] = [];
  for (const seg of scan.segments) {
    if (seg.painted !== 'fill' && seg.painted !== 'both') continue;
    if (seg.kind !== 'rect') continue;
    if (!isHighlightFill(seg.colorSpaceKey, seg.deviceComponents)) continue;
    const w = seg.bbox[2] - seg.bbox[0];
    const h = seg.bbox[3] - seg.bbox[1];
    if (w < 20 || h < 6 || h > 60) continue;
    const inside = pageText.items.filter(
      (i) =>
        i.x >= seg.bbox[0] - 2 &&
        i.x <= seg.bbox[2] &&
        i.y >= seg.bbox[1] - 1 &&
        i.y <= seg.bbox[3] + 1,
    );
    if (inside.length === 0) continue;
    const text = normalizeText(
      inside.sort((a, b) => b.y - a.y || a.x - b.x).map((i) => i.text).join(' '),
    );
    if (!text) continue;
    out.push({
      text,
      rect: [...seg.bbox] as [number, number, number, number],
      page: pageText.page,
      fillHex: componentsToHex(seg.colorSpaceKey, seg.deviceComponents),
    });
  }
  return out;
}

export function buildProofBlock(pageText: PageText, scan: ContentScan): ProofBlock {
  const lines = pageText.lines.map((l) => ({ ...l, text: normalizeText(l.text) }));
  return {
    checkboxes: findCheckboxes(pageText, scan),
    highlights: findHighlightedHeadings(pageText, scan),
    lines,
    page: pageText,
    columns: columnBoundaries(scan),
  };
}

/* ------------------------------------------------------------------ */
/* Labelled field extraction                                           */
/* ------------------------------------------------------------------ */

export interface FieldHit {
  value: string;
  line: string;
  y: number;
  x: number;
  page: number;
}

/** Search every line (and each line joined with the next) for a labelled value. */
export function findField(pages: ProofBlock[], re: RegExp): FieldHit | null {
  for (let p = 0; p < pages.length; p += 1) {
    const lines = pages[p].lines;
    for (let i = 0; i < lines.length; i += 1) {
      const single = re.exec(lines[i].text);
      if (single && single[1]?.trim()) {
        return { value: single[1].trim(), line: lines[i].text, y: lines[i].y, x: lines[i].x, page: p + 1 };
      }
    }
    // Retry across a wrapped line pair.
    for (let i = 0; i < lines.length - 1; i += 1) {
      const joined = `${lines[i].text} ${lines[i + 1].text}`;
      const m = re.exec(joined);
      if (m && m[1]?.trim()) {
        return { value: m[1].trim(), line: joined, y: lines[i].y, x: lines[i].x, page: p + 1 };
      }
    }
  }
  return null;
}

export interface HeadingRow {
  y: number;
  x: number;
  text: string;
}

/**
 * Rows of text sitting under a heading, inside the heading's own column.
 *
 * Works from positioned items rather than assembled lines, because a heading in a
 * table cell shares its baseline with the headings of every neighbouring cell.
 */
export function rowsUnderHeading(
  block: ProofBlock,
  headingRe: RegExp,
  opts: { maxDrop?: number; columnWidth?: number } = {},
): HeadingRow[] {
  const maxDrop = opts.maxDrop ?? 40;
  const colWidth = opts.columnWidth ?? 130;
  const heading = block.page.items.find((i) => headingRe.test(normalizeText(i.text)));
  if (!heading) return [];

  // Prefer the real table cell the heading sits in; fall back to a fixed window
  // when the page has no vertical rules to define columns.
  const left = Math.max(
    heading.x - 20,
    ...block.columns.filter((c) => c < heading.x + 1).map((c) => c + 0.5),
  );
  const right = Math.min(
    heading.x + colWidth,
    ...block.columns.filter((c) => c > heading.x + 1).map((c) => c - 0.5),
  );

  const below = block.page.items
    .filter(
      (i) =>
        i !== heading &&
        i.y < heading.y - 1 &&
        i.y > heading.y - maxDrop &&
        i.x >= left &&
        i.x <= right,
    )
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: HeadingRow[] = [];
  for (const item of below) {
    const tol = Math.max(1.5, item.fontSize * 0.4);
    const row = rows.find((r) => Math.abs(r.y - item.y) <= tol);
    if (row) {
      row.text = `${row.text} ${item.text}`;
      row.x = Math.min(row.x, item.x);
    } else {
      rows.push({ y: item.y, x: item.x, text: item.text });
    }
  }
  return rows.map((r) => ({ ...r, text: normalizeText(r.text) })).filter((r) => r.text.length > 0);
}
