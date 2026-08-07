/**
 * Raster views of the proof.
 *
 * Three techniques, in decreasing order of fidelity:
 *
 *  1. LAYER ISOLATION — the Illustrator marked-content blocks are blanked out of
 *     the content stream directly, so an isolated layer render is exact.
 *  2. SEPARATION ISOLATION — a named Separation's tint transform is rewritten to
 *     paint nothing, and the result is differenced against the composite. The
 *     difference is exactly the area that separation paints. Also exact.
 *  3. PROCESS DECOMPOSITION — for device CMYK artwork there is no separation
 *     object to neutralise, so the process-only render is decomposed into C/M/Y/K.
 *     This is an approximation and is labelled as one in the UI.
 *
 * None of these are original Illustrator layers, and the app never claims they are.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PDFArray, PDFDocument, PDFName, PDFRawStream, PDFRef } from 'pdf-lib';
import { PNG } from 'pngjs';
import { PDFiumLibrary } from '@hyzyla/pdfium';
import type { ColorChannel, ProductionLayer, RenderedView, SeparationPreview } from '../types.js';
import type { PageStructure } from './pdfStructure.js';
import type { ContentScan } from './contentStream.js';

export const TARGET_DPI = 150;
const MAX_PIXELS = 6_000_000;
/** Renders beyond this page count are limited to the first page to bound cost. */
const FULL_PREVIEW_PAGE_LIMIT = 4;

let libPromise: Promise<Awaited<ReturnType<typeof PDFiumLibrary.init>>> | null = null;
async function getLibrary() {
  if (!libPromise) libPromise = PDFiumLibrary.init();
  return libPromise;
}

export interface Raster {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Buffer;
}

export async function rasterize(bytes: Uint8Array, pageIndex: number, scale: number): Promise<Raster> {
  const lib = await getLibrary();
  const doc = await lib.loadDocument(Buffer.from(bytes));
  try {
    const pages = [...doc.pages()];
    const page = pages[pageIndex];
    if (!page) throw new Error(`Page ${pageIndex + 1} is not present in the document.`);
    const result = await page.render({ scale, render: 'bitmap' });
    // @hyzyla/pdfium normalises pdfium's native BGRA buffer to RGBA before it
    // reaches us, so the bytes are copied straight through. Swapping again here
    // would invert red and blue — and cross the cyan and yellow process masks,
    // which are decomposed from these pixels.
    return { width: result.width, height: result.height, data: Buffer.from(result.data) };
  } finally {
    doc.destroy();
  }
}

function writePng(raster: Raster, file: string): void {
  const png = new PNG({ width: raster.width, height: raster.height });
  raster.data.copy(png.data);
  fs.writeFileSync(file, PNG.sync.write(png, { deflateLevel: 6 }));
}

/** Flatten any alpha onto white — proofs are viewed on paper, not on a checkerboard. */
function flattenOnWhite(r: Raster): Raster {
  const out = Buffer.allocUnsafe(r.data.length);
  for (let i = 0; i < r.width * r.height; i += 1) {
    const a = r.data[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c += 1) {
      out[i * 4 + c] = Math.round(r.data[i * 4 + c] * a + 255 * (1 - a));
    }
    out[i * 4 + 3] = 255;
  }
  return { width: r.width, height: r.height, data: out };
}

function scaleForPage(page: PageStructure): number {
  const wanted = TARGET_DPI / 72;
  const px = page.widthPt * wanted * page.heightPt * wanted;
  if (px <= MAX_PIXELS) return wanted;
  return Math.max(0.6, wanted * Math.sqrt(MAX_PIXELS / px));
}

/* ------------------------------------------------------------------ */
/* PDF variants                                                        */
/* ------------------------------------------------------------------ */

/**
 * Blank the content of every marked-content block except the ones listed.
 * Ranges are replaced with spaces so byte offsets recorded during scanning stay
 * valid for the remaining blocks.
 */
export function isolateGroupsInContent(
  content: string,
  groups: { key: string; start: number; end: number }[],
  keepKeys: string[],
): string {
  const chars = content.split('');
  for (const g of groups) {
    if (keepKeys.includes(g.key)) continue;
    const end = Math.min(g.end, chars.length);
    for (let i = g.start; i < end; i += 1) {
      const c = chars[i];
      if (c !== '\n' && c !== '\r') chars[i] = ' ';
    }
  }
  return chars.join('');
}

async function withModifiedPdf(
  bytes: Uint8Array,
  mutate: (doc: PDFDocument) => void | Promise<void>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false,
    throwOnInvalidObject: false,
  });
  await mutate(doc);
  return doc.save({ useObjectStreams: false, addDefaultPage: false });
}

function replacePageContent(doc: PDFDocument, pageIndex: number, content: string): void {
  const page = doc.getPages()[pageIndex];
  if (!page) return;
  const raw = Buffer.from(content, 'latin1');
  const dict = doc.context.obj({ Length: raw.length });
  const stream = PDFRawStream.of(dict, new Uint8Array(raw));
  const ref = doc.context.register(stream);
  (page.node as unknown as { set: (k: PDFName, v: PDFRef) => void }).set(PDFName.of('Contents'), ref);
}

/**
 * Rewrite a Separation colour space so every tint paints nothing.
 * Returns false when the space cannot be neutralised safely (e.g. DeviceN, whose
 * tint transform takes several inputs and cannot be replaced by a type-2 function).
 */
function neutralizeSeparation(doc: PDFDocument, ref: PDFRef): boolean {
  const arr = doc.context.lookup(ref);
  if (!(arr instanceof PDFArray) || arr.size() < 4) return false;
  const family = arr.lookup(0);
  if (!(family instanceof PDFName) || family.asString() !== '/Separation') return false;
  const fn = doc.context.obj({
    FunctionType: 2,
    Domain: [0, 1],
    C0: [0, 0, 0, 0],
    C1: [0, 0, 0, 0],
    N: 1,
    Range: [0, 1, 0, 1, 0, 1, 0, 1],
  });
  arr.set(2, PDFName.of('DeviceCMYK'));
  arr.set(3, doc.context.register(fn));
  return true;
}

/* ------------------------------------------------------------------ */
/* Mask maths                                                          */
/* ------------------------------------------------------------------ */

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Difference two renders and turn the delta into a tint mask for one ink. */
function diffMask(
  composite: Raster,
  without: Raster,
  inkRgb: [number, number, number],
): { raster: Raster; coverage: number } {
  const n = composite.width * composite.height;
  const alpha = new Float32Array(n);
  // Reference delta: white paper turning into the solid ink.
  const refDelta = Math.max(
    12,
    Math.max(255 - inkRgb[0], 255 - inkRgb[1], 255 - inkRgb[2]),
  );
  let covered = 0;
  for (let i = 0; i < n; i += 1) {
    const dr = Math.abs(composite.data[i * 4] - without.data[i * 4]);
    const dg = Math.abs(composite.data[i * 4 + 1] - without.data[i * 4 + 1]);
    const db = Math.abs(composite.data[i * 4 + 2] - without.data[i * 4 + 2]);
    const d = Math.max(dr, dg, db);
    if (d <= 3) continue;
    const a = clamp01(d / refDelta);
    alpha[i] = a;
    if (a > 0.02) covered += 1;
  }
  const out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i += 1) {
    const a = alpha[i];
    if (a <= 0) continue;
    out[i * 4] = inkRgb[0];
    out[i * 4 + 1] = inkRgb[1];
    out[i * 4 + 2] = inkRgb[2];
    out[i * 4 + 3] = Math.round(a * 255);
  }
  return {
    raster: { width: composite.width, height: composite.height, data: out },
    coverage: covered / n,
  };
}

/** Decompose an RGB render into one naive process-ink channel. */
function processMask(
  src: Raster,
  channel: 'c' | 'm' | 'y' | 'k',
  inkRgb: [number, number, number],
): { raster: Raster; coverage: number } {
  const n = src.width * src.height;
  const out = Buffer.alloc(n * 4);
  let covered = 0;
  for (let i = 0; i < n; i += 1) {
    const r = src.data[i * 4] / 255;
    const g = src.data[i * 4 + 1] / 255;
    const b = src.data[i * 4 + 2] / 255;
    const k = 1 - Math.max(r, g, b);
    let v: number;
    if (channel === 'k') {
      v = k;
    } else if (k >= 0.999) {
      v = 0;
    } else {
      const comp = channel === 'c' ? r : channel === 'm' ? g : b;
      v = (1 - comp - k) / (1 - k);
    }
    v = clamp01(v);
    if (v <= 0.008) continue;
    out[i * 4] = inkRgb[0];
    out[i * 4 + 1] = inkRgb[1];
    out[i * 4 + 2] = inkRgb[2];
    out[i * 4 + 3] = Math.round(v * 255);
    if (v > 0.02) covered += 1;
  }
  return { raster: { width: src.width, height: src.height, data: out }, coverage: covered / n };
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [80, 80, 80];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                       */
/* ------------------------------------------------------------------ */

export interface RenderInput {
  bytes: Uint8Array;
  pages: PageStructure[];
  scans: ContentScan[];
  channels: ColorChannel[];
  layers: ProductionLayer[];
  outDir: string;
  /** Relative URL prefix the client uses to fetch these files. */
  urlPrefix: string;
}

export interface RenderResult {
  views: RenderedView[];
  separations: SeparationPreview[];
  thumbnail: string | null;
  notes: string[];
}

export async function renderViews(input: RenderInput): Promise<RenderResult> {
  const { bytes, pages, scans, channels, layers, outDir, urlPrefix } = input;
  fs.mkdirSync(outDir, { recursive: true });
  const views: RenderedView[] = [];
  const separations: SeparationPreview[] = [];
  const notes: string[] = [];
  let thumbnail: string | null = null;

  const previewPages = pages.length > FULL_PREVIEW_PAGE_LIMIT ? 1 : pages.length;
  if (previewPages < pages.length) {
    notes.push(
      `Separation and layer previews were generated for page 1 only; this document has ${pages.length} pages.`,
    );
  }

  // 1. Composite for every page.
  const composites: Raster[] = [];
  for (let p = 0; p < pages.length; p += 1) {
    const scale = scaleForPage(pages[p]);
    const raster = flattenOnWhite(await rasterize(bytes, p, scale));
    composites.push(raster);
    const name = `composite-p${p + 1}.png`;
    writePng(raster, path.join(outDir, name));
    views.push({
      key: `composite:${p + 1}`,
      label: `Original composite — page ${p + 1}`,
      file: `${urlPrefix}/${name}`,
      description: 'The proof exactly as supplied, all content visible.',
    });
    if (p === 0) {
      thumbnail = `${urlPrefix}/${name}`;
    }
  }

  // 2. Layer isolation and production-art-only, via content-stream surgery.
  const productionGroupKeys = new Map<number, string[]>();
  for (let p = 0; p < previewPages; p += 1) {
    const scan = scans[p];
    if (!scan || scan.groups.length === 0) continue;
    const titleFor = (key: string) =>
      pages[p].markedContentProps.find((m) => m.resourceKey === key)?.title ?? key;

    const prodKeys = scan.groups
      .filter((g) => {
        const title = titleFor(g.key);
        const layer = layers.find((l) => l.name === title);
        return !layer || layer.classification === 'production';
      })
      .map((g) => g.key);
    productionGroupKeys.set(p, prodKeys);

    const scale = scaleForPage(pages[p]);

    if (prodKeys.length > 0 && prodKeys.length < scan.groups.length) {
      const content = isolateGroupsInContent(pages[p].content, scan.groups, prodKeys);
      const variant = await withModifiedPdf(bytes, (doc) => replacePageContent(doc, p, content));
      const raster = flattenOnWhite(await rasterize(variant, p, scale));
      const name = `production-only-p${p + 1}.png`;
      writePng(raster, path.join(outDir, name));
      views.push({
        key: `production:${p + 1}`,
        label: `Production art only — page ${p + 1}`,
        file: `${urlPrefix}/${name}`,
        description:
          'Proof sign-off and dimension annotation groups removed from the content stream. Exact, not a crop.',
      });
    }

    for (const g of scan.groups) {
      const title = titleFor(g.key);
      const content = isolateGroupsInContent(pages[p].content, scan.groups, [g.key]);
      const variant = await withModifiedPdf(bytes, (doc) => replacePageContent(doc, p, content));
      const raster = flattenOnWhite(await rasterize(variant, p, scale));
      const name = `layer-${g.key}-p${p + 1}.png`;
      writePng(raster, path.join(outDir, name));
      views.push({
        key: `layer:${title}:${p + 1}`,
        label: `${title} — page ${p + 1}`,
        file: `${urlPrefix}/${name}`,
        description: `Only the "${title}" marked-content group, isolated from the content stream.`,
      });
    }
  }

  // 3. Separation isolation.
  //    Named Separation spaces are neutralised and differenced (exact).
  //    Device process inks are decomposed from a separations-removed render.
  const page0 = pages[0];
  const scale0 = scaleForPage(page0);

  const separationRefs = new Map<string, PDFRef[]>();
  for (const page of pages.slice(0, previewPages)) {
    for (const cs of page.colorSpaces) {
      if (cs.family !== 'Separation' || !cs.ref) continue;
      for (const nm of cs.names) {
        const key = nm.toUpperCase();
        const list = separationRefs.get(key) ?? [];
        list.push(cs.ref);
        separationRefs.set(key, list);
      }
    }
  }

  // A Separation named after a process ink (e.g. /Separation /Black) is only part
  // of that ink's coverage — the rest comes from device CMYK operators. Isolating
  // it alone would show almost nothing, so process inks always go through
  // decomposition and their separations stay live in the process-only render.
  const processInkKeys = new Set(
    channels.filter((c) => c.type === 'process').map((c) => c.channelName.toUpperCase()),
  );
  const allSeparationRefs = [
    ...new Set(
      [...separationRefs.entries()]
        .filter(([name]) => !processInkKeys.has(name))
        .flatMap(([, refs]) => refs),
    ),
  ];

  for (const channel of channels) {
    if (channel.type === 'process') continue;
    const refs = separationRefs.get(channel.channelName.toUpperCase());
    const inkRgb = hexToRgb(channel.swatchHex);
    if (refs && refs.length) {
      try {
        const variant = await withModifiedPdf(bytes, (doc) => {
          for (const r of refs) neutralizeSeparation(doc, r);
        });
        const without = flattenOnWhite(await rasterize(variant, 0, scale0));
        const { raster, coverage } = diffMask(composites[0], without, inkRgb);
        const name = `sep-${channel.id}-p1.png`;
        writePng(raster, path.join(outDir, name));
        separations.push({
          channelId: channel.id,
          channelName: channel.channelName,
          method: 'exact_separation_isolate',
          file: `${urlPrefix}/${name}`,
          coverage,
          generated: true,
          note:
            'Generated separation preview: the named PDF separation was neutralised and differenced against the composite. Spatially exact, but it is not an original editable Illustrator layer or an output plate.',
        });
        channel.previewAvailable = true;
        continue;
      } catch (err) {
        notes.push(
          `Separation preview for "${channel.channelName}" could not be generated: ${(err as Error).message}`,
        );
      }
    }
  }

  // Process channels: render with every named separation removed, then decompose.
  const processChannels = channels.filter((c) => c.type === 'process' && !c.previewAvailable);
  if (processChannels.length > 0) {
    let processSource = composites[0];
    if (allSeparationRefs.length > 0) {
      try {
        const variant = await withModifiedPdf(bytes, (doc) => {
          for (const r of allSeparationRefs) neutralizeSeparation(doc, r);
        });
        processSource = flattenOnWhite(await rasterize(variant, 0, scale0));
        const name = 'process-only-p1.png';
        writePng(processSource, path.join(outDir, name));
        views.push({
          key: 'process:1',
          label: 'Process artwork only — page 1',
          file: `${urlPrefix}/${name}`,
          description: 'All named separations neutralised, leaving device process artwork.',
        });
      } catch (err) {
        notes.push(`Process-only render failed, decomposing the composite instead: ${(err as Error).message}`);
      }
    }
    for (const channel of processChannels) {
      const letter = channel.normalizedName.toLowerCase().startsWith('cyan')
        ? 'c'
        : channel.normalizedName.toLowerCase().startsWith('magenta')
          ? 'm'
          : channel.normalizedName.toLowerCase().startsWith('yellow')
            ? 'y'
            : 'k';
      const { raster, coverage } = processMask(processSource, letter, hexToRgb(channel.swatchHex));
      const name = `sep-${channel.id}-p1.png`;
      writePng(raster, path.join(outDir, name));
      separations.push({
        channelId: channel.id,
        channelName: channel.channelName,
        method: 'process_channel_decomposition',
        file: `${urlPrefix}/${name}`,
        coverage,
        generated: true,
        note:
          'Generated separation preview: the process artwork was rendered and decomposed into this ink channel. This is an approximation of the plate, not an output separation.',
      });
      channel.previewAvailable = true;
    }
  }

  return { views, separations, thumbnail, notes };
}

export async function shutdownRenderer(): Promise<void> {
  if (libPromise) {
    const lib = await libPromise;
    lib.destroy();
    libPromise = null;
  }
}
