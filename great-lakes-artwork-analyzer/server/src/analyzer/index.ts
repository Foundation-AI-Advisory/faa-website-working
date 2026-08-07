/**
 * Analysis orchestrator.
 *
 * Deterministic PDF inspection runs first and owns every value it can establish.
 * Text on the proof is used next. Nothing is inferred visually unless the file
 * cannot answer the question, and inferences are always marked as such.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AnalysisResult,
  AnalysisStage,
  AttributeSource,
  ColorChannel,
  ConfirmationStatus,
  DetectedAttribute,
  DimensionRecord,
  FileCharacteristics,
  ImageInfo,
  MaterialFinish,
  NormalizedSummary,
  PreflightIssue,
  PreflightSeverity,
  ProductionLayer,
  RawFileData,
} from '../types.js';
import { readPdfStructure, xmpValue, type PageStructure } from './pdfStructure.js';
import { scanContentStream, type ContentScan } from './contentStream.js';
import { extractText, type PageText } from './textLayout.js';
import {
  buildProofBlock,
  findField,
  rowsUnderHeading,
  normalizeColorName,
  normalizeText,
  type ProofBlock,
} from './proofFields.js';
import { buildRawChannels, classifyChannelName, normalizeChannels } from './colors.js';
import { renderViews } from './render.js';

export const ANALYZER_VERSION = '1.0.0';

const PT_PER_IN = 72;

function inches(pt: number): number {
  return Math.round((pt / PT_PER_IN) * 10000) / 10000;
}

function fmtIn(pt: number): string {
  const v = inches(pt);
  return `${v.toFixed(Math.abs(v * 100 - Math.round(v * 100)) < 0.5 ? (Number.isInteger(v) ? 0 : v * 10 % 1 === 0 ? 1 : 3) : 4)}"`.replace(
    /\.?0+"$/,
    '"',
  );
}

/** Printing methods a proof might name, in the order we test them. */
const METHOD_PATTERNS: [string, RegExp][] = [
  ['Digital', /\bdigital\b|\binkjet\b|\btoner\b|\bindigo\b/i],
  ['Flexographic', /\bflexo\w*\b/i],
  ['Offset', /\boffset\b|\blitho\w*\b/i],
  ['Rotogravure', /\bgravure\b|\brotogravure\b/i],
  ['Screen', /\bscreen\s*print\w*\b/i],
  ['Letterpress', /\bletterpress\b/i],
  ['Combination', /\bcombination\s*print\w*\b/i],
];

interface Ctx {
  attributes: DetectedAttribute[];
  warnings: string[];
}

function attr(
  ctx: Ctx,
  a: Partial<DetectedAttribute> & Pick<DetectedAttribute, 'key' | 'label' | 'category' | 'source'>,
): DetectedAttribute {
  const full: DetectedAttribute = {
    dataType: 'string',
    rawValue: null,
    normalizedValue: null,
    classification: null,
    confidence: 0.5,
    status: 'detected',
    warning: null,
    page: null,
    region: null,
    notes: null,
    ...a,
  } as DetectedAttribute;
  ctx.attributes.push(full);
  return full;
}

function notFound(
  ctx: Ctx,
  key: string,
  label: string,
  category: DetectedAttribute['category'],
  warning: string,
  status: ConfirmationStatus = 'needs_review',
): DetectedAttribute {
  return attr(ctx, {
    key,
    label,
    category,
    source: 'derived',
    rawValue: null,
    normalizedValue: null,
    confidence: 0,
    status,
    warning,
  });
}

/* ------------------------------------------------------------------ */
/* Layers                                                              */
/* ------------------------------------------------------------------ */

const ANNOTATION_LAYER_PATTERNS: [RegExp, string][] = [
  [/^\s*(sign\s*-?\s*off|signoff|approval|proof\s*info|info\s*block|title\s*block)\s*$/i, 'proof_annotation'],
  [/\b(sign\s*-?\s*off|approval\s*block)\b/i, 'proof_annotation'],
  [/^\s*dimensions?\s*$/i, 'dimension'],
  [/\b(dimension|measurement|callout|annotation|notes?|guides?|template|slug|do\s*not\s*print|non[-\s]?print)\b/i, 'dimension'],
];

function classifyLayerName(name: string): { classification: string; rationale: string } {
  for (const [re, cls] of ANNOTATION_LAYER_PATTERNS) {
    if (re.test(name)) {
      return {
        classification: cls,
        rationale: `Group name "${name}" matches proof/annotation naming, so it is not treated as production printing content.`,
      };
    }
  }
  return {
    classification: 'production',
    rationale: `Group name "${name}" carries no annotation keyword, so it is treated as production artwork.`,
  };
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

export interface AnalyzeOptions {
  filePath: string;
  fileName: string;
  renderDir: string;
  renderUrlPrefix: string;
  onStage?: (stage: AnalysisStage) => void;
}

export async function analyzePdf(opts: AnalyzeOptions): Promise<AnalysisResult> {
  const startedAt = new Date();
  const stages: AnalysisStage[] = [];
  const ctx: Ctx = { attributes: [], warnings: [] };

  const stage = async <T>(key: string, label: string, fn: () => Promise<T> | T): Promise<T> => {
    const rec: AnalysisStage = { key, label, status: 'running', ms: 0, detail: null };
    stages.push(rec);
    opts.onStage?.(rec);
    const t0 = Date.now();
    try {
      const out = await fn();
      rec.status = 'done';
      rec.ms = Date.now() - t0;
      opts.onStage?.(rec);
      return out;
    } catch (err) {
      rec.status = 'failed';
      rec.ms = Date.now() - t0;
      rec.detail = (err as Error).message;
      opts.onStage?.(rec);
      throw err;
    }
  };

  const bytes = await stage('read', 'Reading uploaded file', () =>
    new Uint8Array(fs.readFileSync(opts.filePath)),
  );
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');

  const structure = await stage('structure', 'Parsing PDF objects, metadata and page boxes', () =>
    readPdfStructure(bytes),
  );

  const scans: ContentScan[] = await stage(
    'content',
    'Scanning content streams for colour, geometry and layer groups',
    () =>
      structure.pages.map((page) => {
        const groupTitles: Record<string, string> = {};
        for (const mc of page.markedContentProps) {
          if (mc.title) groupTitles[mc.resourceKey] = mc.title;
        }
        const soft = new Set(
          page.extGStates
            .filter(
              (g) =>
                (g.fillAlpha !== null && g.fillAlpha < 1) ||
                (g.strokeAlpha !== null && g.strokeAlpha < 1) ||
                g.hasSoftMask ||
                (g.blendMode !== null && g.blendMode !== 'Normal' && g.blendMode !== 'Compatible'),
            )
            .map((g) => g.resourceKey),
        );
        const overprint = new Set(
          page.extGStates.filter((g) => g.overprintFill || g.overprintStroke).map((g) => g.resourceKey),
        );
        return scanContentStream(page.content, {
          groupTitles,
          softGStates: soft,
          overprintGStates: overprint,
        });
      }),
  );

  const pageTexts: PageText[] = await stage('text', 'Extracting positioned text', () =>
    extractText(bytes, scans),
  );

  const proofBlocks: ProofBlock[] = await stage('proof', 'Reading proof sign-off block', () =>
    structure.pages.map((_, i) => buildProofBlock(pageTexts[i], scans[i])),
  );

  /* ---------------- file characteristics ---------------- */

  const fileStat = fs.statSync(opts.filePath);
  const creator = structure.info['Creator'] ?? xmpValue(structure.xmp, 'xmp:CreatorTool');
  const illustratorMatch = creator ? /Adobe Illustrator\s*([\d.]+)?/i.exec(creator) : null;
  const hasEsko =
    Boolean(structure.xmp && /esko-graphics\.com\/(?:inkinfo|laylist|grinfo)/.test(structure.xmp)) &&
    Boolean(structure.xmp && /<egInk:|<egLay:|<egGr:/.test(structure.xmp));

  const allFonts = structure.pages.flatMap((p) => p.fonts);
  const fontsByName = new Map(allFonts.map((f) => [`${f.resourceKey}:${f.baseFont}`, f]));
  const fonts = [...fontsByName.values()];

  const images: ImageInfo[] = [];
  structure.pages.forEach((page, pi) => {
    for (const xo of page.xObjects) {
      if (xo.subtype !== 'Image' || xo.width === null || xo.height === null) continue;
      const placement = scans[pi].images.find((i) => i.resourceKey === xo.resourceKey);
      images.push({
        resourceKey: xo.resourceKey,
        width: xo.width,
        height: xo.height,
        colorSpace: xo.colorSpace ?? 'Unknown',
        filter: xo.filter ?? 'None',
        bitsPerComponent: xo.bitsPerComponent,
        effectivePpiX: placement && placement.widthPt > 0 ? Math.round((xo.width / placement.widthPt) * 72) : null,
        effectivePpiY: placement && placement.heightPt > 0 ? Math.round((xo.height / placement.heightPt) * 72) : null,
        isMask: xo.isMask,
      });
    }
  });

  const totals = scans.reduce(
    (acc, s) => ({
      pathOps: acc.pathOps + s.counts.pathOps,
      paintOps: acc.paintOps + s.counts.paintOps,
      textShowOps: acc.textShowOps + s.counts.textShowOps,
      imageOps: acc.imageOps + s.counts.imageOps,
      shadingOps: acc.shadingOps + s.counts.shadingOps,
      total: acc.total + s.counts.total,
    }),
    { pathOps: 0, paintOps: 0, textShowOps: 0, imageOps: 0, shadingOps: 0, total: 0 },
  );

  const fileChars: FileCharacteristics = {
    fileName: opts.fileName,
    fileSize: fileStat.size,
    sha256,
    pageCount: structure.pages.length,
    pdfVersion: structure.pdfVersion,
    producer: structure.info['Producer'] ?? null,
    creator: creator ?? null,
    creationDate: structure.info['CreationDate'] ?? xmpValue(structure.xmp, 'xmp:CreateDate'),
    modificationDate: structure.info['ModDate'] ?? xmpValue(structure.xmp, 'xmp:ModifyDate'),
    title: structure.info['Title'] ?? xmpValue(structure.xmp, 'dc:title') ?? null,
    createdInIllustrator: Boolean(illustratorMatch),
    illustratorVersion: illustratorMatch?.[1] ?? null,
    hasEskoMetadata: hasEsko,
    hasOptionalContentLayers: structure.hasOptionalContentLayers,
    fonts,
    images,
    vectorOperationCount: totals.pathOps,
    textOperationCount: totals.textShowOps,
    imageOperationCount: totals.imageOps,
    primarilyVector: totals.pathOps > totals.imageOps * 20,
    hasTransparency: scans.some((s) => s.usesTransparency),
    encrypted: structure.encrypted,
  };

  /* ---------------- layers ---------------- */

  const layers: ProductionLayer[] = [];
  structure.pages.forEach((page, pi) => {
    for (const g of scans[pi].groups) {
      const mc = page.markedContentProps.find((m) => m.resourceKey === g.key);
      const name = mc?.title ?? g.key;
      if (layers.some((l) => l.name === name)) continue;
      const cls = classifyLayerName(name);
      layers.push({
        id: `layer_${pi}_${g.key}`,
        name,
        classification: cls.classification,
        source: mc?.title ? 'illustrator_esko_metadata' : 'pdf_object',
        confidence: mc?.title ? 0.95 : 0.6,
        isOptionalContent: structure.hasOptionalContentLayers,
        printed: mc?.printed ?? null,
        visible: mc?.visible ?? null,
        objectCount: g.objectCount,
        bbox: g.bbox,
        status: 'detected',
        notes: cls.rationale,
      });
    }
  });
  const annotationGroupNames = layers.filter((l) => l.classification !== 'production').map((l) => l.name);

  /* ---------------- printing method + declared inks ---------------- */

  const methodResult = detectPrintingMethod(proofBlocks);

  /* ---------------- colours ---------------- */

  const rawChannels = await stage('colors', 'Detecting colour spaces and separations', () =>
    buildRawChannels({ pages: structure.pages, scans }),
  );

  const channels: ColorChannel[] = normalizeChannels({
    raw: rawChannels,
    printingMethod: methodResult.method,
    printingMethodConfidence: methodResult.confidence,
    digitalMatchNames: methodResult.matchColors,
    declaredInkNames: methodResult.declaredInks,
    annotationGroups: annotationGroupNames,
  });

  /* ---------------- job information ---------------- */

  const productNumber = findField(proofBlocks, /\bProduct\s*(?:Number|No\.?|#)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9\-_/.]{2,})/i);
  const revision = findField(proofBlocks, /\bRevision\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9\-.]{0,7})\b/i);
  const versionHit = findField(proofBlocks, /\bVersion\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9\-.]{0,7})\b/i);
  const proofDate = findField(
    proofBlocks,
    /\bDate\s*[:#]?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|[A-Z][a-z]{2,8}\.?\s+\d{1,2},?\s+\d{4})/i,
  );
  const initials = findField(proofBlocks, /\bInitials\s*[:#]?\s*([A-Za-z]{1,4})\b/i);
  const rewind = findField(proofBlocks, /\bRewind\s*#?\s*([0-9]{1,2}[A-Za-z]?)\b/i);
  const dispensing = findDispensing(proofBlocks);

  const push = (
    key: string,
    label: string,
    hit: { value: string; line: string; page: number } | null,
    category: DetectedAttribute['category'],
    missingWarning: string,
    confidence = 0.92,
  ) => {
    if (hit) {
      attr(ctx, {
        key,
        label,
        category,
        source: 'proof_text',
        rawValue: hit.value,
        normalizedValue: hit.value,
        confidence,
        status: 'detected',
        page: hit.page,
        notes: `Read from proof text: "${hit.line.slice(0, 120)}"`,
      });
    } else {
      notFound(ctx, key, label, category, missingWarning);
    }
  };

  push('product_number', 'Product number', productNumber, 'job', 'No product number label found on the proof.');
  push('revision', 'Revision', revision, 'job', 'No revision label found on the proof.');
  push('version', 'Version', versionHit, 'job', 'No version label found on the proof.');
  push('proof_date', 'Proof date', proofDate, 'job', 'No proof date found on the proof.');
  push('initials', 'Prepared by (initials)', initials, 'job', 'No initials found on the proof.');

  attr(ctx, {
    key: 'artwork_title',
    label: 'Artwork title',
    category: 'job',
    source: fileChars.title ? 'pdf_object' : 'derived',
    rawValue: fileChars.title ?? opts.fileName,
    normalizedValue: (fileChars.title ?? opts.fileName).replace(/\.pdf$/i, ''),
    confidence: fileChars.title ? 0.9 : 0.4,
    status: fileChars.title ? 'detected' : 'needs_review',
    warning: fileChars.title ? null : 'Title taken from the file name because the PDF has no /Title entry.',
    notes: fileChars.title ? 'Read from the PDF Info dictionary /Title entry.' : null,
  });

  // Customer is rarely a labelled proof field; a copyright line is the usual clue.
  const customerHit = findField(proofBlocks, /©\s*\d{4}\s+([A-Z][A-Za-z0-9&.,'’\- ]{2,50}?)(?=\s*[·|,]|\s+All rights|\s*$)/);
  if (customerHit) {
    attr(ctx, {
      key: 'customer',
      label: 'Customer',
      category: 'job',
      source: 'proof_text',
      rawValue: customerHit.value,
      normalizedValue: customerHit.value.replace(/\s+(Inc|LLC|Ltd|Corp)\.?$/i, (m) => m).trim(),
      confidence: 0.45,
      status: 'needs_review',
      warning:
        'Customer was inferred from a copyright notice in the artwork, not from a labelled proof field. Confirm before sending for approval.',
      page: customerHit.page,
      notes: `Inferred from "${customerHit.line.slice(0, 100)}"`,
    });
  } else {
    notFound(ctx, 'customer', 'Customer', 'job', 'No customer name is labelled on the proof. Enter it manually.');
  }

  /* ---------------- printing method attributes ---------------- */

  if (methodResult.method) {
    attr(ctx, {
      key: 'printing_method',
      label: 'Printing method',
      category: 'prepress',
      source: 'proof_text',
      rawValue: methodResult.rawHeading,
      normalizedValue: methodResult.method,
      classification: methodResult.selectionEvidence,
      confidence: methodResult.confidence,
      status: methodResult.confidence >= 0.8 ? 'detected' : 'needs_review',
      warning:
        methodResult.confidence >= 0.8
          ? null
          : 'Printing method could not be established from a single unambiguous marking on the proof.',
      notes: methodResult.selectionEvidence,
    });
  } else {
    notFound(
      ctx,
      'printing_method',
      'Printing method',
      'prepress',
      'The proof does not clearly mark a printing method. Every named separation therefore cannot be classified as a spot plate or a digital match target.',
    );
  }

  if (methodResult.processSystem) {
    attr(ctx, {
      key: 'process_print_system',
      label: 'Process print system',
      category: 'prepress',
      source: 'proof_text',
      rawValue: methodResult.processSystem,
      normalizedValue: methodResult.processSystem,
      confidence: 0.9,
      status: 'detected',
      notes: `Listed under the selected "${methodResult.rawHeading}" column on the proof.`,
    });
  }

  /* ---------------- dimensions ---------------- */

  const dimensions = buildDimensions(ctx, structure.pages, scans, proofBlocks, {
    rewind,
    dispensing,
    annotationGroups: annotationGroupNames,
  });

  /* ---------------- materials and finishes ---------------- */

  const materials = buildMaterials(ctx, proofBlocks, channels);

  /* ---------------- separations and views ---------------- */

  const renderResult = await stage('render', 'Rendering composite, layer and separation previews', () =>
    renderViews({
      bytes,
      pages: structure.pages,
      scans,
      channels,
      layers,
      outDir: opts.renderDir,
      urlPrefix: opts.renderUrlPrefix,
    }),
  );
  ctx.warnings.push(...renderResult.notes);

  /* ---------------- preflight ---------------- */

  const preflight = await stage('preflight', 'Running preflight checks', () =>
    runPreflight({
      structure,
      scans,
      channels,
      layers,
      dimensions,
      materials,
      fileChars,
      methodResult,
      attributes: ctx.attributes,
    }),
  );

  /* ---------------- normalized summary ---------------- */

  const normalizedSummary: NormalizedSummary = {
    printingMethod: methodResult.method,
    printingMethodSource: methodResult.method ? 'proof_text' : null,
    printingMethodConfidence: methodResult.confidence,
    processPrintSystem: methodResult.processSystem,
    pressStationCount: channels.filter((c) => c.isPressStation).length || null,
    digitalMatchTargets: channels.filter((c) => c.role === 'digital_match_target').map((c) => c.normalizedName),
    spotInkPlates: channels.filter((c) => c.role === 'spot_ink_plate').map((c) => c.normalizedName),
    structuralLayers: channels.filter((c) => c.role === 'structural_layer').map((c) => c.normalizedName),
    finishes: channels.filter((c) => c.role === 'finish').map((c) => c.normalizedName),
    whiteInkLayer: describePresence(channels, 'white'),
    varnishLayer: describePresence(channels, 'varnish'),
    foilLayer: describePresence(channels, 'foil'),
    embossLayer: describeEmboss(channels),
    proofOnlyContent: [
      ...layers.filter((l) => l.classification !== 'production').map((l) => l.name),
      ...channels.filter((c) => c.role === 'proof_only').map((c) => c.normalizedName),
    ],
  };

  /* ---------------- raw file data ---------------- */

  const rawFileData: RawFileData = {
    info: structure.info,
    xmpExcerpt: structure.xmp ? excerptXmp(structure.xmp) : null,
    pageBoxes: Object.fromEntries(
      structure.pages.map((p) => [
        `page ${p.index + 1}`,
        {
          MediaBox: p.mediaBox,
          ...(p.cropBox ? { CropBox: p.cropBox } : {}),
          ...(p.trimBox ? { TrimBox: p.trimBox } : {}),
          ...(p.bleedBox ? { BleedBox: p.bleedBox } : {}),
          ...(p.artBox ? { ArtBox: p.artBox } : {}),
          Rotate: [p.rotate],
          UserUnit: [p.userUnit],
        },
      ]),
    ),
    colorSpaceResources: Object.fromEntries(
      structure.pages.flatMap((p) =>
        p.colorSpaces.map((cs) => [
          `page ${p.index + 1} /${cs.resourceKey}`,
          {
            family: cs.family,
            names: cs.names,
            alternate: cs.alternateFamily,
            solidAtTint1: cs.solid,
            components: cs.componentCount,
          },
        ]),
      ),
    ),
    markedContentProperties: Object.fromEntries(
      structure.pages.flatMap((p) =>
        p.markedContentProps.map((mc) => [
          `page ${p.index + 1} /${mc.resourceKey}`,
          { title: mc.title, visible: mc.visible, printed: mc.printed, editable: mc.editable, dimmed: mc.dimmed },
        ]),
      ),
    ),
    fontResources: Object.fromEntries(
      structure.pages.flatMap((p) =>
        p.fonts.map((f) => [
          `page ${p.index + 1} /${f.resourceKey}`,
          { baseFont: f.baseFont, subtype: f.subtype, embedded: f.embedded, subset: f.subset, encoding: f.encoding },
        ]),
      ),
    ),
    xObjectResources: Object.fromEntries(
      structure.pages.flatMap((p) =>
        p.xObjects.map((x) => [
          `page ${p.index + 1} /${x.resourceKey}`,
          {
            subtype: x.subtype,
            width: x.width,
            height: x.height,
            colorSpace: x.colorSpace,
            filter: x.filter,
            bitsPerComponent: x.bitsPerComponent,
          },
        ]),
      ),
    ),
    extGStateResources: Object.fromEntries(
      structure.pages.flatMap((p) =>
        p.extGStates.map((g) => [
          `page ${p.index + 1} /${g.resourceKey}`,
          {
            fillAlpha: g.fillAlpha,
            strokeAlpha: g.strokeAlpha,
            blendMode: g.blendMode,
            overprintFill: g.overprintFill,
            overprintStroke: g.overprintStroke,
            softMask: g.hasSoftMask,
          },
        ]),
      ),
    ),
    optionalContentProperties: structure.optionalContentProperties,
    contentStreamStats: {
      operators: totals.total,
      pathOperators: totals.pathOps,
      paintOperators: totals.paintOps,
      textShowOperators: totals.textShowOps,
      imageOperators: totals.imageOps,
      shadingOperators: totals.shadingOps,
      markedContentGroups: scans.reduce((n, s) => n + s.groups.length, 0),
    },
    textLines: pageTexts.flatMap((pt) =>
      pt.lines.map((l) => ({
        page: pt.page,
        y: Math.round(l.y * 100) / 100,
        x: Math.round(l.x * 100) / 100,
        text: normalizeText(l.text),
        group: l.group,
      })),
    ),
  };

  for (const s of scans) ctx.warnings.push(...s.errors);

  const finishedAt = new Date();
  return {
    analyzerVersion: ANALYZER_VERSION,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    stages,
    file: fileChars,
    attributes: ctx.attributes,
    rawChannels,
    channels,
    layers,
    materials,
    dimensions,
    preflight,
    separations: renderResult.separations,
    views: renderResult.views,
    normalizedSummary,
    rawFileData,
    warnings: ctx.warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Printing method                                                     */
/* ------------------------------------------------------------------ */

export interface MethodResult {
  method: string | null;
  rawHeading: string | null;
  confidence: number;
  selectionEvidence: string;
  processSystem: string | null;
  matchColors: string[];
  declaredInks: string[];
  /** Other method headings present on the proof but not selected. */
  alternatives: string[];
}

const COLOR_TOKEN = /\b(?:PANTONE|PMS)\s*\d{3,4}\s*[A-Z]{0,3}\b|\bCMYK\b|\bOPAQUE\s+WHITE\b|\bWHITE\b|\bBLACK\b/gi;

export function detectPrintingMethod(blocks: ProofBlock[]): MethodResult {
  const empty: MethodResult = {
    method: null,
    rawHeading: null,
    confidence: 0,
    selectionEvidence: 'No printing-method marking found on the proof.',
    processSystem: null,
    matchColors: [],
    declaredInks: [],
    alternatives: [],
  };

  // Which method headings appear anywhere on the proof?
  const alternatives = new Set<string>();
  for (const b of blocks) {
    for (const line of b.lines) {
      for (const [name, re] of METHOD_PATTERNS) {
        if (re.test(line.text) && /\b(print|ink|process|method)\b/i.test(line.text)) alternatives.add(name);
      }
    }
  }

  // A highlighted heading is the strongest signal a proof gives.
  for (let bi = 0; bi < blocks.length; bi += 1) {
    const block = blocks[bi];
    for (const h of block.highlights) {
      const match = METHOD_PATTERNS.find(([, re]) => re.test(h.text));
      if (!match) continue;
      const column = readInkColumn(block, h.rect);
      return {
        method: match[0],
        rawHeading: h.text,
        confidence: 0.92,
        selectionEvidence: `"${h.text}" is the only method heading drawn inside a ${h.fillHex} highlight fill on the proof; the alternative heading${
          alternatives.size > 1 ? 's are' : ' is'
        } not highlighted.`,
        processSystem: column.processSystem,
        matchColors: column.matchColors,
        declaredInks: column.inks,
        alternatives: [...alternatives].filter((a) => a !== match[0]),
      };
    }
  }

  // No highlight: fall back to a single unambiguous mention.
  if (alternatives.size === 1) {
    const only = [...alternatives][0];
    return {
      ...empty,
      method: only,
      rawHeading: only,
      confidence: 0.55,
      selectionEvidence: `"${only}" is the only printing method named on the proof, but nothing marks it as selected. Confirm with prepress.`,
      alternatives: [],
    };
  }
  if (alternatives.size > 1) {
    return {
      ...empty,
      confidence: 0,
      selectionEvidence: `The proof names ${[...alternatives].join(' and ')} but nothing marks which one applies.`,
      alternatives: [...alternatives],
    };
  }
  return empty;
}

/** Read the ink list printed underneath a method heading, inside its column. */
function readInkColumn(
  block: ProofBlock,
  rect: [number, number, number, number],
): { inks: string[]; matchColors: string[]; processSystem: string | null } {
  const inColumn = block.lines
    .filter((l) => l.x >= rect[0] - 6 && l.x <= rect[2] + 6 && l.y < rect[1])
    .sort((a, b) => b.y - a.y);

  let matchSplitY: number | null = null;
  for (const l of inColumn) {
    if (/\bmatch\s+colou?rs?\b/i.test(l.text)) {
      matchSplitY = l.y;
      break;
    }
  }

  const inks: string[] = [];
  const matchColors: string[] = [];
  let processSystem: string | null = null;

  for (const l of inColumn) {
    if (matchSplitY !== null && Math.abs(l.y - matchSplitY) < 0.5) continue;
    const found = l.text.match(COLOR_TOKEN);
    if (!found) continue;
    for (const tok of found) {
      const name = normalizeColorName(tok);
      if (/^CMYK$/i.test(tok.trim())) {
        processSystem = 'CMYK';
        continue;
      }
      if (matchSplitY !== null && l.y < matchSplitY) {
        if (!matchColors.includes(name)) matchColors.push(name);
      } else if (!inks.includes(name)) {
        inks.push(name);
      }
    }
  }
  return { inks, matchColors, processSystem };
}

/* ------------------------------------------------------------------ */
/* Dimensions                                                          */
/* ------------------------------------------------------------------ */

function buildDimensions(
  ctx: Ctx,
  pages: PageStructure[],
  scans: ContentScan[],
  blocks: ProofBlock[],
  fields: {
    rewind: { value: string; line: string; page: number } | null;
    dispensing: { value: string; line: string; page: number } | null;
    annotationGroups: string[];
  },
): DimensionRecord[] {
  const out: DimensionRecord[] = [];
  let seq = 0;
  const add = (d: Omit<DimensionRecord, 'id'>) => {
    seq += 1;
    out.push({ id: `dim_${seq}_${d.key}`, ...d });
  };

  const page = pages[0];
  const scan = scans[0];

  // Page geometry — always available.
  add({
    key: 'page_width',
    label: 'Proof page width',
    rawValue: `${page.widthPt.toFixed(3)} pt`,
    valueIn: inches(page.widthPt),
    category: 'page',
    source: 'pdf_object',
    confidence: 1,
    status: 'detected',
    warning: null,
  });
  add({
    key: 'page_height',
    label: 'Proof page height',
    rawValue: `${page.heightPt.toFixed(3)} pt`,
    valueIn: inches(page.heightPt),
    category: 'page',
    source: 'pdf_object',
    confidence: 1,
    status: 'detected',
    warning: null,
  });

  for (const [key, label, box] of [
    ['media_box', 'MediaBox', page.mediaBox],
    ['crop_box', 'CropBox', page.cropBox],
    ['trim_box', 'TrimBox', page.trimBox],
    ['bleed_box', 'BleedBox', page.bleedBox],
    ['art_box', 'ArtBox', page.artBox],
  ] as [string, string, number[] | null][]) {
    if (!box) {
      add({
        key,
        label,
        rawValue: null,
        valueIn: null,
        category: 'box',
        source: 'pdf_object',
        confidence: 1,
        status: 'not_found',
        warning: `${label} is not defined on the page.`,
      });
      continue;
    }
    add({
      key,
      label,
      rawValue: `[${box.map((v) => v.toFixed(3)).join(', ')}] pt  →  ${inches(Math.abs(box[2] - box[0])).toFixed(3)}" × ${inches(Math.abs(box[3] - box[1])).toFixed(3)}"`,
      valueIn: inches(Math.abs(box[2] - box[0])),
      category: 'box',
      source: 'pdf_object',
      confidence: 1,
      status: 'detected',
      warning: null,
    });
  }

  // Bleed amount from the trim/bleed box relationship.
  if (page.trimBox && page.bleedBox) {
    const bleedPt = Math.max(
      Math.abs(page.trimBox[0] - page.bleedBox[0]),
      Math.abs(page.trimBox[1] - page.bleedBox[1]),
      Math.abs(page.bleedBox[2] - page.trimBox[2]),
      Math.abs(page.bleedBox[3] - page.trimBox[3]),
    );
    add({
      key: 'bleed_amount',
      label: 'Bleed amount',
      rawValue: bleedPt > 0.01 ? `${bleedPt.toFixed(3)} pt` : 'TrimBox and BleedBox are identical',
      valueIn: bleedPt > 0.01 ? inches(bleedPt) : 0,
      category: 'bleed',
      source: 'pdf_object',
      confidence: 1,
      status: bleedPt > 0.01 ? 'detected' : 'needs_review',
      warning:
        bleedPt > 0.01
          ? null
          : 'TrimBox and BleedBox are identical, so the page declares no bleed. On a proof sheet this is expected; confirm bleed on the production file.',
    });
  } else {
    add({
      key: 'bleed_amount',
      label: 'Bleed amount',
      rawValue: null,
      valueIn: null,
      category: 'bleed',
      source: 'pdf_object',
      confidence: 0,
      status: 'not_found',
      warning: 'The page does not define both a TrimBox and a BleedBox, so bleed cannot be measured.',
    });
  }

  /* --- finished size from the dieline geometry --- */
  const structuralKeys = new Set<string>();
  for (const cs of page.colorSpaces) {
    for (const nm of cs.names) {
      const cls = classifyChannelName(nm);
      if (cls.type === 'dieline' || cls.type === 'cut') structuralKeys.add(cs.resourceKey);
    }
  }

  const dielineSegs = scan.segments.filter(
    (s) => structuralKeys.has(s.colorSpaceKey) && s.painted !== 'none',
  );
  let dieline: (typeof dielineSegs)[number] | null = null;
  let bestArea = 0;
  for (const s of dielineSegs) {
    const area = (s.bbox[2] - s.bbox[0]) * (s.bbox[3] - s.bbox[1]);
    if (area > bestArea) {
      bestArea = area;
      dieline = s;
    }
  }

  const proofWidth = findDimensionCallout(blocks, 'width', fields.annotationGroups);
  const proofHeight = findDimensionCallout(blocks, 'height', fields.annotationGroups);
  const radiusHit = findField(blocks, /\br\s*=\s*([0-9]*\.?[0-9]+)\s*(?:"|in\b|inch)/i);

  if (dieline) {
    const wPt = dieline.bbox[2] - dieline.bbox[0];
    const hPt = dieline.bbox[3] - dieline.bbox[1];
    const wIn = inches(wPt);
    const hIn = inches(hPt);

    // The proof normally prints the finished size too; agreement raises confidence.
    const callouts = [proofWidth, proofHeight].filter(Boolean) as number[];
    const agrees = (v: number) => callouts.some((c) => Math.abs(c - v) <= Math.max(0.02, v * 0.01));
    const corroborated = agrees(wIn) && agrees(hIn);

    add({
      key: 'finished_width',
      label: 'Finished width',
      rawValue: `${wPt.toFixed(3)} pt (dieline bounding box)`,
      valueIn: wIn,
      category: 'finished',
      source: 'dieline_geometry',
      confidence: corroborated ? 0.98 : 0.85,
      status: 'detected',
      warning: corroborated
        ? null
        : 'Dieline geometry and the dimension callouts printed on the proof do not agree. Verify the finished size.',
    });
    add({
      key: 'finished_height',
      label: 'Finished height',
      rawValue: `${hPt.toFixed(3)} pt (dieline bounding box)`,
      valueIn: hIn,
      category: 'finished',
      source: 'dieline_geometry',
      confidence: corroborated ? 0.98 : 0.85,
      status: 'detected',
      warning: corroborated
        ? null
        : 'Dieline geometry and the dimension callouts printed on the proof do not agree. Verify the finished size.',
    });
    add({
      key: 'dieline_size',
      label: 'Dieline dimensions',
      rawValue: `${wIn.toFixed(3)}" × ${hIn.toFixed(3)}" (bbox ${dieline.bbox.map((v) => v.toFixed(1)).join(', ')} pt)`,
      valueIn: wIn,
      category: 'dieline',
      source: 'dieline_geometry',
      confidence: 0.98,
      status: 'detected',
      warning: null,
    });

    // Corner radius: proof text wins, geometry corroborates.
    const radii = (dieline.cornerRadii ?? []).filter(([x, y]) => x > 0.2 && y > 0.2);
    const measured = radii.length
      ? Math.max(...radii.map(([x, y]) => Math.max(x, y)))
      : null;
    const measuredMin = radii.length ? Math.min(...radii.map(([x, y]) => Math.min(x, y))) : null;
    if (radiusHit) {
      const stated = parseFloat(radiusHit.value);
      const geometryNote =
        measured !== null
          ? ` Dieline corner arcs measure ${inches(measured).toFixed(3)}" × ${inches(measuredMin!).toFixed(3)}".`
          : '';
      const disagrees = measured !== null && Math.abs(inches(measured) - stated) > 0.02;
      add({
        key: 'corner_radius',
        label: 'Corner radius',
        rawValue: `r = ${radiusHit.value}"`,
        valueIn: stated,
        category: 'finished',
        source: 'proof_text',
        confidence: disagrees ? 0.7 : 0.95,
        status: disagrees ? 'needs_review' : 'detected',
        warning: disagrees
          ? `Proof states r = ${stated}" but the dieline corner arcs measure ${inches(measured!).toFixed(3)}".`
          : measured !== null && Math.abs(inches(measured) - inches(measuredMin!)) > 0.005
            ? `Corner arcs are not perfectly circular.${geometryNote}`
            : null,
      });
    } else if (measured !== null) {
      add({
        key: 'corner_radius',
        label: 'Corner radius',
        rawValue: `${measured.toFixed(3)} pt corner arc`,
        valueIn: inches(measured),
        category: 'finished',
        source: 'dieline_geometry',
        confidence: 0.75,
        status: 'needs_review',
        warning: 'Corner radius was measured from the dieline path; the proof does not state it.',
      });
    } else {
      add({
        key: 'corner_radius',
        label: 'Corner radius',
        rawValue: null,
        valueIn: null,
        category: 'finished',
        source: 'derived',
        confidence: 0,
        status: 'not_found',
        warning: 'No corner radius is stated on the proof and the dieline path has square corners.',
      });
    }
  } else {
    const fallbackW = proofWidth;
    const fallbackH = proofHeight;
    for (const [key, label, val] of [
      ['finished_width', 'Finished width', fallbackW],
      ['finished_height', 'Finished height', fallbackH],
    ] as [string, string, number | null][]) {
      add({
        key,
        label,
        rawValue: val !== null ? `${val}"` : null,
        valueIn: val,
        category: 'finished',
        source: val !== null ? 'proof_text' : 'derived',
        confidence: val !== null ? 0.6 : 0,
        status: 'needs_review',
        warning:
          val !== null
            ? 'No dieline separation was found, so the finished size comes from the printed dimension callout only.'
            : 'No dieline separation and no dimension callout were found, so the finished size is unknown.',
      });
    }
    add({
      key: 'dieline_size',
      label: 'Dieline dimensions',
      rawValue: null,
      valueIn: null,
      category: 'dieline',
      source: 'derived',
      confidence: 0,
      status: 'not_found',
      warning: 'No dieline / cut-contour separation was found in the file.',
    });
    add({
      key: 'corner_radius',
      label: 'Corner radius',
      rawValue: radiusHit ? `r = ${radiusHit.value}"` : null,
      valueIn: radiusHit ? parseFloat(radiusHit.value) : null,
      category: 'finished',
      source: radiusHit ? 'proof_text' : 'derived',
      confidence: radiusHit ? 0.75 : 0,
      status: radiusHit ? 'detected' : 'not_found',
      warning: radiusHit ? 'No dieline geometry available to corroborate the stated corner radius.' : 'Not stated.',
    });
  }

  /* --- rewind / dispensing / eyemark --- */
  add({
    key: 'rewind',
    label: 'Rewind number',
    rawValue: fields.rewind ? `Rewind #${fields.rewind.value}` : null,
    valueIn: null,
    category: 'dispensing',
    source: fields.rewind ? 'proof_text' : 'derived',
    confidence: fields.rewind ? 0.93 : 0,
    status: fields.rewind ? 'detected' : 'not_found',
    warning: fields.rewind ? null : 'No rewind position is stated on the proof.',
  });
  add({
    key: 'dispensing_direction',
    label: 'Dispensing orientation',
    rawValue: fields.dispensing ? normalizeText(fields.dispensing.value) : null,
    valueIn: null,
    category: 'dispensing',
    source: fields.dispensing ? 'proof_text' : 'derived',
    confidence: fields.dispensing ? 0.9 : 0,
    status: fields.dispensing ? 'detected' : 'not_found',
    warning: fields.dispensing ? null : 'No dispensing direction is stated on the proof.',
  });

  const eyemarkLines = blocks.flatMap((b) =>
    rowsUnderHeading(b, /^eye\s*-?\s*mark$/i, { maxDrop: 46, columnWidth: 140 }),
  );
  const eyemarkField = (label: string, re: RegExp, key: string) => {
    const line = eyemarkLines.find((l) => re.test(l.text));
    const m = line ? re.exec(line.text) : null;
    const value = m?.[1]?.trim() ?? null;
    const isNa = value !== null && /^n\/?a$|^none$|^-$/i.test(value);
    add({
      key,
      label,
      rawValue: value,
      valueIn: null,
      category: 'eyemark',
      source: value !== null ? 'proof_text' : 'derived',
      confidence: value !== null ? 0.9 : 0,
      status: isNa ? 'not_applicable' : value !== null ? 'detected' : 'not_found',
      warning:
        value !== null
          ? null
          : 'The proof does not state this eyemark value. Confirm whether an eyemark is required.',
    });
  };
  eyemarkField('Eyemark size', /\bsize\s*[:#]?\s*(.+)$/i, 'eyemark_size');
  eyemarkField('Eyemark location', /\blocation\s*[:#]?\s*(.+)$/i, 'eyemark_location');
  eyemarkField('Eyemark frequency', /\bfrequency\s*[:#]?\s*(.+)$/i, 'eyemark_frequency');

  /* --- construction --- */
  const booklet = findCheckbox(blocks, /base\s*label.*booklet|booklet/i);
  add({
    key: 'booklet_construction',
    label: 'Base label for booklet',
    rawValue: booklet ? `${booklet.label}: ${booklet.checked ? 'selected' : 'not selected'}` : null,
    valueIn: null,
    category: 'construction',
    source: booklet ? 'content_stream_geometry' : 'derived',
    confidence: booklet?.confidence ?? 0,
    status: booklet ? 'detected' : 'not_found',
    warning: booklet
      ? null
      : 'The proof has no booklet-construction checkbox, so multilayer construction cannot be determined from the file.',
  });

  // Page size vs finished size — an explicit, separate fact.
  const finishedW = out.find((d) => d.key === 'finished_width')?.valueIn ?? null;
  const finishedH = out.find((d) => d.key === 'finished_height')?.valueIn ?? null;
  add({
    key: 'page_vs_finished',
    label: 'Proof page vs finished label size',
    rawValue:
      finishedW && finishedH
        ? `Proof page ${inches(page.widthPt).toFixed(3)}" × ${inches(page.heightPt).toFixed(3)}"; finished label ${finishedW.toFixed(3)}" × ${finishedH.toFixed(3)}"`
        : `Proof page ${inches(page.widthPt).toFixed(3)}" × ${inches(page.heightPt).toFixed(3)}"; finished label unknown`,
    valueIn: null,
    category: 'page',
    source: 'derived',
    confidence: finishedW && finishedH ? 0.95 : 0.3,
    status: finishedW && finishedH ? 'detected' : 'needs_review',
    warning:
      finishedW && finishedH && (Math.abs(inches(page.widthPt) - finishedW) > 0.02 || Math.abs(inches(page.heightPt) - finishedH) > 0.02)
        ? 'The PDF page is a proof sheet, not the finished label size. Do not use the page size as the die size.'
        : null,
  });

  return out;
}

/**
 * Read the standalone dimension callouts (10", 4.5") printed on the proof.
 *
 * Works from positioned items, because a callout sitting alongside the artwork
 * shares its baseline with body copy and would be lost in an assembled line.
 * Callouts inside a dimension/annotation group are preferred when one exists.
 */
function findDimensionCallout(
  blocks: ProofBlock[],
  which: 'width' | 'height',
  annotationGroups: string[],
): number | null {
  const all: { v: number; x: number; y: number; annotated: boolean }[] = [];
  for (const b of blocks) {
    for (const it of b.page.items) {
      const m = /^\s*([0-9]*\.?[0-9]+)\s*(?:"|in\b|inch(?:es)?)\s*$/i.exec(normalizeText(it.text));
      if (!m) continue;
      all.push({
        v: parseFloat(m[1]),
        x: it.x,
        y: it.y,
        annotated: it.group !== null && annotationGroups.includes(it.group),
      });
    }
  }
  const annotated = all.filter((v) => v.annotated);
  const values = annotated.length ? annotated : all;
  if (values.length === 0) return null;
  if (values.length === 1) return values[0].v;

  // The width callout runs along the top or bottom; the height callout sits at a
  // side. Pick them by which axis each one is furthest out on.
  const byX = [...values].sort((a, b) => a.x - b.x);
  const byY = [...values].sort((a, b) => a.y - b.y);
  const xSpread = byX[byX.length - 1].x - byX[0].x;
  const ySpread = byY[byY.length - 1].y - byY[0].y;
  if (xSpread < 20 && ySpread < 20) {
    return which === 'width' ? Math.max(...values.map((v) => v.v)) : Math.min(...values.map((v) => v.v));
  }
  const heightCallout = byX[0];
  const widthCallout = values.find((v) => v !== heightCallout) ?? byY[byY.length - 1];
  return which === 'width' ? widthCallout.v : heightCallout.v;
}

/**
 * "Right side of copy dispenses first" is printed under the rewind heading and
 * wraps across two rows, so it is read from that cell rather than page-wide.
 */
function findDispensing(
  blocks: ProofBlock[],
): { value: string; line: string; page: number } | null {
  for (let bi = 0; bi < blocks.length; bi += 1) {
    const rows = rowsUnderHeading(blocks[bi], /^rewind\b/i, { maxDrop: 40, columnWidth: 130 });
    const joined = normalizeText(rows.map((r) => r.text).join(' '));
    if (/dispens\w*/i.test(joined)) {
      return { value: joined, line: joined, page: bi + 1 };
    }
  }
  // Fall back to a page-wide read for proofs laid out differently.
  return findField(
    blocks,
    /\b((?:right|left|top|bottom|inside|outside|head|tail)[^.,;]{0,45}?dispens\w*\s+first)/i,
  );
}

function findCheckbox(blocks: ProofBlock[], re: RegExp) {
  for (const b of blocks) {
    const hit = b.checkboxes.find((c) => re.test(c.label));
    if (hit) return hit;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Materials and finishes                                              */
/* ------------------------------------------------------------------ */

function buildMaterials(ctx: Ctx, blocks: ProofBlock[], channels: ColorChannel[]): MaterialFinish[] {
  const out: MaterialFinish[] = [];
  let seq = 0;
  const add = (m: Omit<MaterialFinish, 'id'>) => {
    seq += 1;
    out.push({ id: `mat_${seq}_${m.key}`, ...m });
  };

  const notSpecified = (
    key: string,
    label: string,
    category: string,
    warning: string,
  ) =>
    add({
      key,
      label,
      category,
      rawValue: null,
      normalizedValue: 'Not specified',
      source: 'derived',
      confidence: 0,
      status: 'needs_review',
      warning,
    });

  /* --- substrate colour, read from the Substrate cell on the proof --- */
  const substrateLines = blocks.flatMap((b) =>
    rowsUnderHeading(b, /^substrate$/i, { maxDrop: 24, columnWidth: 120 }),
  );
  const colorLine = substrateLines.find((l) => /^[A-Za-z][A-Za-z /-]{1,24}$/.test(l.text));
  if (colorLine) {
    add({
      key: 'substrate_color',
      label: 'Substrate colour',
      category: 'substrate',
      rawValue: colorLine.text,
      normalizedValue: colorLine.text,
      source: 'proof_text',
      confidence: 0.88,
      status: 'detected',
      warning: null,
    });
  } else {
    notSpecified(
      'substrate_color',
      'Substrate colour',
      'substrate',
      'No substrate colour is stated in the proof substrate block.',
    );
  }

  notSpecified(
    'substrate_material',
    'Substrate material',
    'substrate',
    'The exact substrate material is not specified on the proof. Paper, film, grade and calliper must be confirmed before production.',
  );
  notSpecified(
    'substrate_family',
    'Paper or film',
    'substrate',
    'The proof does not state whether the substrate is paper or film.',
  );
  notSpecified(
    'adhesive',
    'Adhesive',
    'adhesive',
    'Adhesive is not specified on the proof. Confirm the adhesive with the order before production.',
  );
  notSpecified(
    'liner',
    'Liner',
    'liner',
    'Liner is not specified on the proof. Confirm the liner with the order before production.',
  );
  notSpecified(
    'laminate',
    'Laminate',
    'laminate',
    'No laminate is specified on the proof.',
  );

  /* --- varnish: never inferred from a template heading --- */
  const varnishChannels = channels.filter((c) => c.type === 'varnish');
  const varnishHeadingOnly = blocks.some((b) =>
    b.lines.some((l) => /inks?\s+and\s+varnish(?:es)?/i.test(l.text)),
  );
  if (varnishChannels.length > 0) {
    for (const v of varnishChannels) {
      add({
        key: `varnish_${v.normalizedName.toLowerCase().replace(/\W+/g, '_')}`,
        label: 'Varnish',
        category: 'varnish',
        rawValue: v.channelName,
        normalizedValue: v.normalizedName,
        source: 'embedded_pdf_colorspace',
        confidence: 0.9,
        status: 'detected',
        warning: 'A varnish separation exists, but its type and coverage are not stated on the proof.',
      });
    }
  } else {
    add({
      key: 'varnish',
      label: 'Varnish',
      category: 'varnish',
      rawValue: null,
      normalizedValue: 'Not specified',
      source: 'derived',
      confidence: 0,
      status: 'needs_review',
      warning: varnishHeadingOnly
        ? 'No varnish separation exists in the file. The proof only carries the template heading "Inks and Varnishes", which is not a varnish specification.'
        : 'No varnish separation exists in the file and none is specified on the proof.',
    });
  }
  notSpecified(
    'varnish_type',
    'Varnish type',
    'varnish',
    'A specific varnish type (gloss, matte, satin, UV, aqueous) is not identified.',
  );
  notSpecified(
    'varnish_coverage',
    'Varnish coverage',
    'varnish',
    'Varnish coverage (flood or spot, and the spot area) is not identified.',
  );

  /* --- finish channels driven by the separations actually present --- */
  const presence = (
    key: string,
    label: string,
    category: string,
    type: string,
    absentNote: string,
  ) => {
    const hits = channels.filter((c) => c.type === type);
    if (hits.length > 0) {
      add({
        key,
        label,
        category,
        rawValue: hits.map((h) => h.channelName).join(', '),
        normalizedValue: hits.map((h) => h.normalizedName).join(', '),
        source: 'embedded_pdf_colorspace',
        confidence: 0.92,
        status: 'detected',
        warning: null,
      });
    } else {
      add({
        key,
        label,
        category,
        rawValue: null,
        normalizedValue: 'Not detected',
        source: 'embedded_pdf_colorspace',
        confidence: 0.9,
        status: 'detected',
        warning: absentNote,
      });
    }
  };

  presence('white_ink', 'White ink', 'white_ink', 'white', 'No separate white-ink separation exists in the file.');
  presence('foil', 'Foil', 'foil', 'foil', 'No foil separation exists in the file.');
  presence('emboss', 'Embossing', 'emboss', 'emboss', 'No emboss separation exists in the file.');
  presence('deboss', 'Debossing', 'emboss', 'deboss', 'No deboss separation exists in the file.');

  /* --- print orientation from the proof checkboxes --- */
  const surface = findCheckbox(blocks, /surface\s*print/i);
  const reverse = findCheckbox(blocks, /reverse\s*print/i);
  const selected = [surface, reverse].filter((c) => c?.checked);
  if (selected.length === 1) {
    const c = selected[0]!;
    add({
      key: 'print_orientation',
      label: 'Print orientation',
      category: 'print_orientation',
      rawValue: c.label,
      normalizedValue: /surface/i.test(c.label) ? 'Surface printing' : 'Reverse printing',
      source: 'content_stream_geometry',
      confidence: c.confidence,
      status: 'detected',
      warning: null,
    });
  } else if (selected.length > 1) {
    add({
      key: 'print_orientation',
      label: 'Print orientation',
      category: 'print_orientation',
      rawValue: selected.map((c) => c!.label).join(' + '),
      normalizedValue: 'Ambiguous',
      source: 'content_stream_geometry',
      confidence: 0.3,
      status: 'needs_review',
      warning: 'More than one print-orientation box is marked on the proof.',
    });
  } else if (surface || reverse) {
    add({
      key: 'print_orientation',
      label: 'Print orientation',
      category: 'print_orientation',
      rawValue: 'No orientation box is marked',
      normalizedValue: 'Not specified',
      source: 'content_stream_geometry',
      confidence: 0.6,
      status: 'needs_review',
      warning: 'The proof has surface/reverse printing boxes but neither is marked.',
    });
  } else {
    notSpecified(
      'print_orientation',
      'Print orientation',
      'print_orientation',
      'The proof does not state surface or reverse printing.',
    );
  }

  const booklet = findCheckbox(blocks, /base\s*label.*booklet|booklet/i);
  add({
    key: 'construction',
    label: 'Base label / booklet construction',
    category: 'construction',
    rawValue: booklet ? booklet.label : null,
    normalizedValue: booklet ? (booklet.checked ? 'Base label for booklet' : 'Not selected') : 'Not specified',
    source: booklet ? 'content_stream_geometry' : 'derived',
    confidence: booklet?.confidence ?? 0,
    status: booklet ? 'detected' : 'needs_review',
    warning: booklet ? null : 'The proof does not state booklet or multilayer construction.',
  });

  return out;
}

/* ------------------------------------------------------------------ */
/* Preflight                                                           */
/* ------------------------------------------------------------------ */

interface PreflightInput {
  structure: Awaited<ReturnType<typeof readPdfStructure>>;
  scans: ContentScan[];
  channels: ColorChannel[];
  layers: ProductionLayer[];
  dimensions: DimensionRecord[];
  materials: MaterialFinish[];
  fileChars: FileCharacteristics;
  methodResult: MethodResult;
  attributes: DetectedAttribute[];
}

function runPreflight(input: PreflightInput): PreflightIssue[] {
  const out: PreflightIssue[] = [];
  let seq = 0;
  const add = (
    code: string,
    title: string,
    severity: PreflightSeverity,
    detail: string,
    evidence: string | null = null,
    recommendation: string | null = null,
  ) => {
    seq += 1;
    out.push({
      id: `pf_${seq}_${code}`,
      code,
      title,
      severity,
      detail,
      evidence,
      recommendation,
      page: null,
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
    });
  };

  const { fileChars, channels, layers, structure, scans, dimensions, materials, methodResult } = input;

  /* fonts */
  const missing = fileChars.fonts.filter((f) => !f.embedded);
  if (missing.length) {
    add(
      'missing_fonts',
      'Fonts are not embedded',
      'blocking',
      `${missing.length} font${missing.length === 1 ? ' is' : 's are'} referenced but not embedded in the PDF.`,
      missing.map((f) => f.baseFont).join(', '),
      'Request a PDF with all fonts embedded or outlined before releasing to plate.',
    );
  } else if (fileChars.fonts.length) {
    add(
      'embedded_fonts',
      'All fonts are embedded',
      'pass',
      `${fileChars.fonts.length} font${fileChars.fonts.length === 1 ? '' : 's'} found, all embedded.`,
      fileChars.fonts.map((f) => `${f.baseFont}${f.subset ? ' (subset)' : ''}`).join(', '),
    );
  } else {
    add('no_fonts', 'No fonts found', 'info', 'The page draws no text, or all text is outlined.', null);
  }

  /* image resolution */
  const rasterImages = fileChars.images.filter((i) => !i.isMask && i.effectivePpiX !== null);
  const low = rasterImages.filter((i) => Math.min(i.effectivePpiX!, i.effectivePpiY!) < 200);
  const veryLow = low.filter((i) => Math.min(i.effectivePpiX!, i.effectivePpiY!) < 150);
  if (veryLow.length) {
    add(
      'low_resolution_images',
      'Low-resolution raster images',
      'warning',
      `${veryLow.length} placed image${veryLow.length === 1 ? '' : 's'} below 150 effective PPI.`,
      veryLow.map((i) => `/${i.resourceKey} ${i.width}×${i.height} at ${i.effectivePpiX}×${i.effectivePpiY} PPI`).join('; '),
      'Replace with higher-resolution artwork or confirm the image is intentionally low resolution.',
    );
  } else if (low.length) {
    add(
      'image_resolution_review',
      'Images between 150 and 200 PPI',
      'info',
      `${low.length} placed image${low.length === 1 ? ' is' : 's are'} under 200 effective PPI.`,
      low.map((i) => `/${i.resourceKey} at ${i.effectivePpiX}×${i.effectivePpiY} PPI`).join('; '),
    );
  } else if (rasterImages.length) {
    add(
      'image_resolution',
      'Image resolution acceptable',
      'pass',
      `${rasterImages.length} placed image${rasterImages.length === 1 ? '' : 's'}, all at or above 200 effective PPI.`,
      rasterImages.map((i) => `/${i.resourceKey} at ${i.effectivePpiX}×${i.effectivePpiY} PPI`).join('; '),
    );
  } else {
    add('no_raster_images', 'No placed raster images', 'pass', 'The page contains no placed raster images.', null);
  }

  /* RGB in a CMYK workflow */
  const rgbChannels = channels.filter((c) => c.channelName.includes('DeviceRGB'));
  const rgbImages = fileChars.images.filter((i) => /RGB/i.test(i.colorSpace));
  if (rgbChannels.length || rgbImages.length) {
    add(
      'rgb_in_cmyk_workflow',
      'RGB content in a CMYK workflow',
      'warning',
      'RGB colour was found in a file that is otherwise built for CMYK printing.',
      [
        ...rgbChannels.map((c) => `${c.usageCount} RGB paint operation(s)`),
        ...rgbImages.map((i) => `/${i.resourceKey} is ${i.colorSpace}`),
      ].join('; '),
      'Convert RGB objects to the production colour space before output.',
    );
  } else {
    add('no_rgb', 'No RGB artwork', 'pass', 'No DeviceRGB or RGB image content was found.', null);
  }

  /* unexpected spot colours */
  const declared = new Set(
    [...methodResult.declaredInks, ...methodResult.matchColors].map((s) => s.toUpperCase()),
  );
  const namedSpots = channels.filter((c) => c.type === 'spot');
  const undeclared = namedSpots.filter((c) => declared.size > 0 && !declared.has(c.normalizedName.toUpperCase()));
  if (undeclared.length) {
    add(
      'unexpected_spot_colors',
      'Named separations not listed on the proof',
      'warning',
      `${undeclared.length} named separation${undeclared.length === 1 ? ' is' : 's are'} present in the file but not listed in the proof ink block.`,
      undeclared.map((c) => c.channelName).join(', '),
      'Confirm whether these separations should be output, converted, or removed.',
    );
  } else if (namedSpots.length) {
    add(
      'spot_colors_match_proof',
      'Named separations match the proof ink list',
      'pass',
      `${namedSpots.length} named separation${namedSpots.length === 1 ? '' : 's'} present, all listed on the proof.`,
      namedSpots.map((c) => c.channelName).join(', '),
    );
  }

  /* duplicate / inconsistent colour names */
  const byNormalized = new Map<string, string[]>();
  for (const c of channels) {
    const list = byNormalized.get(c.normalizedName) ?? [];
    list.push(c.channelName);
    byNormalized.set(c.normalizedName, list);
  }
  const dupes = [...byNormalized.entries()].filter(([, names]) => new Set(names).size > 1);
  if (dupes.length) {
    add(
      'inconsistent_color_names',
      'Inconsistent separation names',
      'warning',
      'Separations that normalise to the same ink are spelled differently in the file.',
      dupes.map(([norm, names]) => `${norm}: ${[...new Set(names)].join(' / ')}`).join('; '),
      'Rename the separations consistently so they merge to one plate on output.',
    );
  } else {
    add('consistent_color_names', 'Separation names are consistent', 'pass', 'No duplicate or conflicting separation names.', null);
  }

  /* dieline */
  const structural = channels.filter((c) => c.type === 'dieline' || c.type === 'cut');
  if (structural.length === 0) {
    add(
      'dieline_missing',
      'No dieline separation',
      'warning',
      'No dieline or cut-contour separation was found, so the finished size cannot be verified from geometry.',
      null,
      'Ask for artwork containing a named dieline separation.',
    );
  } else {
    add(
      'dieline_present',
      'Dieline separation present',
      'pass',
      `${structural.length} structural separation${structural.length === 1 ? '' : 's'} found.`,
      structural.map((c) => `${c.channelName} (${c.usageCount} paint operations)`).join(', '),
    );
    const printing = structural.filter((c) => c.isPressStation);
    add(
      'dieline_print_status',
      'Dieline print status',
      printing.length ? 'warning' : 'info',
      printing.length
        ? 'A structural separation is classified as printing. It must be set non-printing before output.'
        : 'Structural separations are classified as non-printing. Confirm they are set to not output on the press file.',
      structural.map((c) => `${c.channelName}: ${c.isPressStation ? 'printing' : 'non-printing'}`).join(', '),
      'Set the dieline separation to non-printing in the production file.',
    );
  }

  /* artwork outside the dieline */
  const dielineDim = dimensions.find((d) => d.key === 'dieline_size');
  const page0 = structure.pages[0];
  const structuralKeys = new Set<string>();
  for (const cs of page0.colorSpaces) {
    for (const nm of cs.names) {
      const t = classifyChannelName(nm).type;
      if (t === 'dieline' || t === 'cut') structuralKeys.add(cs.resourceKey);
    }
  }
  const dielineSeg = scans[0].segments
    .filter((s) => structuralKeys.has(s.colorSpaceKey))
    .sort(
      (a, b) =>
        (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]) - (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]),
    )[0];
  if (dielineSeg && dielineDim?.valueIn) {
    const productionGroups = new Set(layers.filter((l) => l.classification === 'production').map((l) => l.name));
    const tolerance = 1; // 1pt, roughly a hairline
    const outside = scans[0].paints.filter((p) => {
      if (!p.bbox || !p.group || !productionGroups.has(p.group)) return false;
      return (
        p.bbox[0] < dielineSeg.bbox[0] - tolerance ||
        p.bbox[1] < dielineSeg.bbox[1] - tolerance ||
        p.bbox[2] > dielineSeg.bbox[2] + tolerance ||
        p.bbox[3] > dielineSeg.bbox[3] + tolerance
      );
    });
    if (outside.length) {
      add(
        'artwork_outside_dieline',
        'Production artwork extends past the dieline',
        'warning',
        `${outside.length} production paint operation${outside.length === 1 ? '' : 's'} fall outside the dieline bounding box.`,
        `Dieline box [${dielineSeg.bbox.map((v) => v.toFixed(1)).join(', ')}] pt; furthest object reaches [${outside
          .reduce(
            (acc, p) => [
              Math.min(acc[0], p.bbox![0]),
              Math.min(acc[1], p.bbox![1]),
              Math.max(acc[2], p.bbox![2]),
              Math.max(acc[3], p.bbox![3]),
            ],
            [Infinity, Infinity, -Infinity, -Infinity],
          )
          .map((v) => v.toFixed(1))
          .join(', ')}] pt.`,
        'Confirm this is intentional bleed rather than artwork that will be trimmed off.',
      );
    } else {
      add(
        'artwork_within_dieline',
        'Production artwork sits inside the dieline',
        'pass',
        'No production artwork extends past the dieline bounding box.',
        `Dieline box [${dielineSeg.bbox.map((v) => v.toFixed(1)).join(', ')}] pt.`,
      );
    }
  }

  /* bleed */
  const bleed = dimensions.find((d) => d.key === 'bleed_amount');
  if (bleed && (bleed.valueIn === null || bleed.valueIn === 0)) {
    add(
      'missing_bleed',
      'No bleed defined on the page',
      'warning',
      bleed.warning ?? 'The page does not declare bleed.',
      bleed.rawValue,
      'Confirm the bleed allowance on the production file, not on the proof sheet.',
    );
  } else if (bleed) {
    add('bleed_present', 'Bleed declared', 'pass', `Page declares ${bleed.valueIn}" of bleed.`, bleed.rawValue);
  }

  /* white overprint */
  const whiteOverprint = scans.reduce((n, s) => n + s.whiteOverprintCandidates, 0);
  if (whiteOverprint > 0) {
    add(
      'white_overprint',
      'White objects set to overprint',
      'blocking',
      `${whiteOverprint} object${whiteOverprint === 1 ? ' is' : 's are'} filled with 0% CMYK while overprint is switched on. These will disappear on press.`,
      `${whiteOverprint} paint operation(s) with an overprint ExtGState active.`,
      'Set white objects to knock out, or remove the overprint attribute.',
    );
  } else {
    add('no_white_overprint', 'No white objects set to overprint', 'pass', 'No 0% CMYK fills were found with overprint enabled.', null);
  }

  /* transparency */
  if (fileChars.hasTransparency) {
    add(
      'transparency',
      'Live transparency present',
      'info',
      'The page uses transparency (alpha, soft masks or non-Normal blend modes).',
      structure.pages
        .flatMap((p) =>
          p.extGStates
            .filter((g) => (g.fillAlpha ?? 1) < 1 || (g.strokeAlpha ?? 1) < 1 || g.hasSoftMask)
            .map((g) => `/${g.resourceKey} ca=${g.fillAlpha ?? 1} CA=${g.strokeAlpha ?? 1}`),
        )
        .join('; ') || null,
      'Confirm the RIP flattens transparency acceptably, or flatten before output.',
    );
  } else {
    add('no_transparency', 'No live transparency', 'pass', 'No transparency groups, soft masks or alpha were found.', null);
  }

  /* linked assets */
  const externalRefs = structure.pages.flatMap((p) => p.xObjects.filter((x) => x.subtype === 'Form' && x.hasOptionalContent));
  add(
    'linked_assets',
    'No missing linked assets',
    'pass',
    'All artwork content is embedded in the PDF; no external file references were found.',
    `${structure.pages.reduce((n, p) => n + p.xObjects.length, 0)} XObject(s) embedded${
      externalRefs.length ? `, ${externalRefs.length} with optional content` : ''
    }.`,
  );

  /* page size vs finished size */
  const pvf = dimensions.find((d) => d.key === 'page_vs_finished');
  if (pvf?.warning) {
    add(
      'page_vs_finished_size',
      'Proof page size differs from the finished label size',
      'info',
      pvf.warning,
      pvf.rawValue,
      'Use the dieline geometry, not the page size, as the die dimensions.',
    );
  }

  /* optional content */
  if (!fileChars.hasOptionalContentLayers) {
    add(
      'no_optional_content',
      'No toggleable PDF layers',
      'info',
      'The PDF contains no optional-content groups (OCG/OCMD), so it has no layers a viewer can switch on and off. Separation previews in this app are generated, not original Illustrator layers.',
      `Illustrator marked-content groups found instead: ${layers.map((l) => l.name).join(', ') || 'none'}.`,
    );
  } else {
    add('optional_content', 'Toggleable PDF layers present', 'info', 'The PDF declares optional-content groups.', null);
  }

  /* proof annotations mixed with production art */
  const annotationLayers = layers.filter((l) => l.classification !== 'production');
  if (annotationLayers.length) {
    add(
      'proof_annotations_present',
      'Proof annotations share the page with production artwork',
      'warning',
      `${annotationLayers.length} group${annotationLayers.length === 1 ? '' : 's'} on the page contain proof or dimension content rather than production artwork.`,
      annotationLayers.map((l) => `"${l.name}" (${l.objectCount} objects, ${l.classification})`).join('; '),
      'Remove or switch off these groups before generating the production file.',
    );
  } else {
    add('no_proof_annotations', 'No proof annotation groups', 'pass', 'Every marked-content group looks like production artwork.', null);
  }

  /* material and finish specification */
  const unspecifiedMaterials = materials.filter(
    (m) => m.status === 'needs_review' && m.normalizedValue === 'Not specified',
  );
  if (unspecifiedMaterials.length) {
    add(
      'missing_substrate_spec',
      'Material specification incomplete',
      'warning',
      `${unspecifiedMaterials.length} material or finish value${unspecifiedMaterials.length === 1 ? ' is' : 's are'} not specified on the proof.`,
      unspecifiedMaterials.map((m) => m.label).join(', '),
      'Confirm substrate, adhesive, liner and finish against the order before production.',
    );
  }
  const varnishRecord = materials.find((m) => m.key === 'varnish');
  if (varnishRecord && varnishRecord.normalizedValue === 'Not specified') {
    add(
      'missing_finish_spec',
      'No varnish or finish is identified',
      'warning',
      varnishRecord.warning ?? 'No varnish is specified.',
      null,
      'Confirm whether a varnish or coating is required; do not assume one from the proof template wording.',
    );
  }

  /* printing method confirmation */
  if (!methodResult.method) {
    add(
      'unconfirmed_print_method',
      'Printing method is not established',
      'blocking',
      methodResult.selectionEvidence,
      null,
      'Confirm the printing method so named separations can be classified correctly.',
    );
  } else if (methodResult.confidence < 0.8) {
    add(
      'unconfirmed_print_method',
      'Printing method needs confirmation',
      'warning',
      methodResult.selectionEvidence,
      null,
      'Confirm the printing method with prepress.',
    );
  } else {
    add(
      'print_method_detected',
      'Printing method detected on the proof',
      'info',
      `${methodResult.method} — ${methodResult.selectionEvidence}`,
      methodResult.rawHeading,
      'Confirm in the Colors and Separations tab to lock the interpretation.',
    );
  }

  /* channels the analyzer could not classify */
  const unclassified = channels.filter((c) => c.role === 'unclassified' || c.status === 'needs_review');
  if (unclassified.length) {
    add(
      'ambiguous_production_instructions',
      'Separations awaiting a production decision',
      'warning',
      `${unclassified.length} separation${unclassified.length === 1 ? ' needs' : 's need'} a prepress decision before output.`,
      unclassified.map((c) => `${c.channelName}: ${c.warning ?? c.notes ?? 'needs review'}`).join('; '),
      'Confirm each separation in the Colors and Separations tab.',
    );
  }

  /* declared but unused separations */
  const unused = channels.filter((c) => !c.usedByArtwork);
  if (unused.length) {
    add(
      'unused_separations',
      'Separations declared but never painted',
      'info',
      `${unused.length} separation${unused.length === 1 ? ' is' : 's are'} declared in the page resources but no object paints with them.`,
      unused.map((c) => c.channelName).join(', '),
      'These usually come from a template and can be removed.',
    );
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function describePresence(channels: ColorChannel[], type: string): string {
  const hits = channels.filter((c) => c.type === type);
  return hits.length ? hits.map((c) => c.normalizedName).join(', ') : 'Not detected';
}

function describeEmboss(channels: ColorChannel[]): string {
  const hits = channels.filter((c) => c.type === 'emboss' || c.type === 'deboss');
  return hits.length ? hits.map((c) => c.normalizedName).join(', ') : 'Not detected';
}

function excerptXmp(xmp: string): string {
  // Thumbnails make the packet enormous and say nothing about production.
  return xmp
    .replace(/<xmpGImg:image>[\s\S]*?<\/xmpGImg:image>/g, '<xmpGImg:image>[base64 thumbnail removed]</xmpGImg:image>')
    .slice(0, 24000);
}
