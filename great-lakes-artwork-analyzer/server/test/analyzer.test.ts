/**
 * Analyzer tests.
 *
 * The golden-file suite runs the real analyzer against the supplied proof, so it
 * fails if deterministic extraction regresses. The unit suites cover the pure
 * classification and normalisation logic with cases that file does not contain.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { classifyChannelName, normalizeChannels } from '../src/analyzer/colors.js';
import { colorKey, normalizeColorName, normalizeText } from '../src/analyzer/proofFields.js';
import { scanContentStream } from '../src/analyzer/contentStream.js';
import { isolateGroupsInContent } from '../src/analyzer/render.js';
import { ALLOWED_TRANSITIONS, type JobStatus, type RawColorChannel } from '../src/types.js';

/* ------------------------------------------------------------------ */
/* Channel classification                                              */
/* ------------------------------------------------------------------ */

describe('separation name classification', () => {
  const cases: [string, string][] = [
    ['Cyan', 'process'],
    ['Magenta', 'process'],
    ['Yellow', 'process'],
    ['Black', 'process'],
    ['PANTONE 214 C', 'spot'],
    ['PMS 185C', 'spot'],
    ['Dieline', 'dieline'],
    ['DIE LINE', 'dieline'],
    ['CutContour', 'dieline'],
    ['Thru-Cut', 'dieline'],
    ['Crease', 'cut'],
    ['Perf', 'cut'],
    ['Gloss Varnish', 'varnish'],
    ['Spot UV', 'varnish'],
    ['Aqueous Coating', 'varnish'],
    ['White', 'white'],
    ['Opaque White', 'white'],
    ['White Ink', 'white'],
    ['Gold Foil', 'foil'],
    ['Cold Foil', 'foil'],
    ['Emboss', 'emboss'],
    ['Deboss', 'deboss'],
    ['All', 'registration'],
    ['Registration', 'registration'],
    ['DIMENSION', 'technical'],
    ['Sign Off', 'technical'],
    ['Do Not Print', 'technical'],
  ];

  for (const [name, expected] of cases) {
    it(`classifies "${name}" as ${expected}`, () => {
      expect(classifyChannelName(name).type).toBe(expected);
    });
  }

  it('always explains the call', () => {
    expect(classifyChannelName('Dieline').rationale).toMatch(/dieline/i);
  });
});

describe('ink name normalisation', () => {
  it('folds PANTONE and PMS spellings together', () => {
    expect(normalizeColorName('PANTONE 214 C')).toBe('PMS 214 C');
    expect(normalizeColorName('PMS 214C')).toBe('PMS 214 C');
    expect(normalizeColorName('pms 214 c')).toBe('PMS 214 C');
    expect(colorKey('PANTONE 214 C')).toBe(colorKey('PMS 214C'));
  });

  it('leaves other separation names spelled as the file has them', () => {
    expect(normalizeColorName('Dieline')).toBe('Dieline');
    expect(normalizeColorName('Gloss Varnish')).toBe('Gloss Varnish');
  });

  it('resolves ligatures so wrapped proof text reads correctly', () => {
    expect(normalizeText('dispenses ﬁrst')).toBe('dispenses first');
  });
});

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

function raw(name: string, over: Partial<RawColorChannel> = {}): RawColorChannel {
  return {
    channelName: name,
    colorSpaceFamily: 'Separation',
    resourceKeys: ['CS0'],
    alternateCmyk: [0, 1, 0, 0],
    alternateRgb: null,
    swatchHex: '#ff00ff',
    usedByArtwork: true,
    usageCount: 5,
    usedInGroups: ['Layer 1'],
    source: 'embedded_pdf_colorspace',
    confidence: 0.99,
    ...over,
  };
}

describe('production normalisation', () => {
  it('treats named separations on a digital proof as match targets, not press stations', () => {
    const out = normalizeChannels({
      raw: [raw('Cyan', { channelName: 'Cyan' }), raw('PANTONE 214 C')],
      printingMethod: 'Digital',
      printingMethodConfidence: 0.92,
      digitalMatchNames: ['PMS 214 C'],
      declaredInkNames: [],
      annotationGroups: [],
    });
    const pms = out.find((c) => c.channelName === 'PANTONE 214 C')!;
    expect(pms.role).toBe('digital_match_target');
    expect(pms.isPressStation).toBe(false);
    expect(pms.status).toBe('detected');
    expect(out.filter((c) => c.isPressStation)).toHaveLength(1);
  });

  it('treats the same separation on a flexo proof as a physical spot plate', () => {
    const out = normalizeChannels({
      raw: [raw('PANTONE 214 C')],
      printingMethod: 'Flexographic',
      printingMethodConfidence: 0.92,
      digitalMatchNames: [],
      declaredInkNames: ['PMS 214 C'],
      annotationGroups: [],
    });
    expect(out[0].role).toBe('spot_ink_plate');
    expect(out[0].isPressStation).toBe(true);
  });

  it('flags a digital separation the proof does not list as a match target', () => {
    const out = normalizeChannels({
      raw: [raw('PANTONE 999 C')],
      printingMethod: 'Digital',
      printingMethodConfidence: 0.92,
      digitalMatchNames: [],
      declaredInkNames: [],
      annotationGroups: [],
    });
    expect(out[0].status).toBe('needs_review');
    expect(out[0].isPressStation).toBe(false);
  });

  it('refuses to classify named separations when the print method is unknown', () => {
    const out = normalizeChannels({
      raw: [raw('PANTONE 214 C')],
      printingMethod: null,
      printingMethodConfidence: 0,
      digitalMatchNames: [],
      declaredInkNames: [],
      annotationGroups: [],
    });
    expect(out[0].role).toBe('unclassified');
    expect(out[0].status).toBe('needs_review');
    expect(out[0].isPressStation).toBe(false);
  });

  it('never counts a dieline as a press station', () => {
    const out = normalizeChannels({
      raw: [raw('Dieline')],
      printingMethod: 'Flexographic',
      printingMethodConfidence: 0.92,
      digitalMatchNames: [],
      declaredInkNames: [],
      annotationGroups: [],
    });
    expect(out[0].role).toBe('structural_layer');
    expect(out[0].isPressStation).toBe(false);
  });

  it('demotes a channel used only inside annotation groups to proof-only', () => {
    const out = normalizeChannels({
      raw: [raw('PANTONE 214 C', { usedInGroups: ['Sign Off'] })],
      printingMethod: 'Flexographic',
      printingMethodConfidence: 0.92,
      digitalMatchNames: [],
      declaredInkNames: [],
      annotationGroups: ['Sign Off'],
    });
    expect(out[0].role).toBe('proof_only');
    expect(out[0].isPressStation).toBe(false);
  });

  it('warns when a separation is declared but never painted', () => {
    const out = normalizeChannels({
      raw: [raw('PANTONE 214 C', { usedByArtwork: false, usageCount: 0, usedInGroups: [] })],
      printingMethod: 'Flexographic',
      printingMethodConfidence: 0.92,
      digitalMatchNames: [],
      declaredInkNames: [],
      annotationGroups: [],
    });
    expect(out[0].warning).toMatch(/no artwork object paints with it/i);
    expect(out[0].isPressStation).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Content stream scanner                                              */
/* ------------------------------------------------------------------ */

describe('content stream scanner', () => {
  it('attributes paint operations to their marked-content group', () => {
    const content = [
      '/Layer /MC0 BDC',
      '1 0 0 0 k',
      '10 10 100 50 re f',
      'EMC',
      '/Layer /MC1 BDC',
      '/CS0 cs 1 scn',
      '20 20 30 30 re f',
      'EMC',
    ].join('\n');
    const scan = scanContentStream(content, { groupTitles: { MC0: 'Layer 1', MC1: 'Sign Off' } });
    expect(scan.groups.map((g) => g.key).sort()).toEqual(['MC0', 'MC1']);
    expect(scan.colorUsage.get('DeviceCMYK')?.groups.has('Layer 1')).toBe(true);
    expect(scan.colorUsage.get('CS0')?.groups.has('Sign Off')).toBe(true);
    expect(scan.deviceInk.c).toBe(1);
    expect(scan.deviceInk.m).toBe(0);
  });

  it('does not let a clipping path enlarge a group bounding box', () => {
    const clipped = scanContentStream(
      ['/Layer /MC0 BDC', '0 0 612 792 re W n', '0 0 0 1 k', '10 10 20 20 re f', 'EMC'].join('\n'),
      {},
    );
    const box = clipped.groups[0].bbox!;
    expect(box[2]).toBeLessThan(100);
  });

  it('records stroked marks that sit inside a ballot box', () => {
    const scan = scanContentStream(['1 1 m 6 6 l S', '1 6 m 6 1 l S'].join('\n'), {});
    expect(scan.segments.filter((s) => s.painted === 'stroke')).toHaveLength(2);
  });

  it('measures rounded-corner arcs from bezier control points', () => {
    // A quarter-arc from (0,0) to (-9, -9), the shape Illustrator emits for r = 9.
    const scan = scanContentStream(['0 0 m -4.97 0 -9 -4.03 -9 -9 c S'].join('\n'), {});
    const radii = scan.segments[0].cornerRadii!;
    expect(radii[0][0]).toBeCloseTo(9, 1);
    expect(radii[0][1]).toBeCloseTo(9, 1);
  });

  it('skips inline image payloads without mis-parsing the operators after them', () => {
    const scan = scanContentStream(
      ['BI /W 2 /H 2 /BPC 8 /CS /G ID   EI', '0 0 0 1 k', '0 0 10 10 re f'].join('\n'),
      {},
    );
    expect(scan.counts.imageOps).toBe(1);
    expect(scan.deviceInk.k).toBe(1);
  });

  it('detects device RGB usage separately from CMYK', () => {
    const scan = scanContentStream(['0.2 0.4 0.6 rg', '0 0 10 10 re f'].join('\n'), {});
    expect(scan.deviceInk.rgb).toBe(1);
    expect(scan.deviceInk.c).toBe(0);
  });
});

describe('layer isolation by content-stream surgery', () => {
  const content = '/Layer /MC0 BDC AAAA EMC /Layer /MC1 BDC BBBB EMC';
  const groups = [
    { key: 'MC0', start: content.indexOf('AAAA'), end: content.indexOf('AAAA') + 4 },
    { key: 'MC1', start: content.indexOf('BBBB'), end: content.indexOf('BBBB') + 4 },
  ];

  it('blanks the other groups while preserving byte offsets', () => {
    const only0 = isolateGroupsInContent(content, groups, ['MC0']);
    expect(only0.length).toBe(content.length);
    expect(only0).toContain('AAAA');
    expect(only0).not.toContain('BBBB');
  });

  it('keeps several groups when asked', () => {
    const both = isolateGroupsInContent(content, groups, ['MC0', 'MC1']);
    expect(both).toBe(content);
  });
});

/* ------------------------------------------------------------------ */
/* Golden file                                                         */
/* ------------------------------------------------------------------ */

const GOLDEN = process.env.GOLDEN_PDF ?? path.join(process.cwd(), 'test', 'fixtures', '10-9819356 v2 Proof.pdf');

describe.runIf(fs.existsSync(GOLDEN))('golden proof: 10-9819356 v2', () => {
  let result: Awaited<ReturnType<typeof import('../src/analyzer/index.js').analyzePdf>>;
  let renderDir: string;

  beforeAll(async () => {
    const { analyzePdf } = await import('../src/analyzer/index.js');
    renderDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gll-test-'));
    result = await analyzePdf({
      filePath: GOLDEN,
      fileName: '10-9819356 v2 Proof.pdf',
      renderDir,
      renderUrlPrefix: '/r',
    });
  }, 120_000);

  afterAll(async () => {
    const { shutdownRenderer } = await import('../src/analyzer/render.js');
    await shutdownRenderer();
    fs.rmSync(renderDir, { recursive: true, force: true });
  });

  const attr = (key: string) => result.attributes.find((a) => a.key === key);
  const dim = (key: string) => result.dimensions.find((d) => d.key === key);
  const mat = (key: string) => result.materials.find((m) => m.key === key);

  it('reads the job information printed on the proof', () => {
    expect(attr('product_number')?.normalizedValue).toBe('10-9819356');
    expect(attr('revision')?.normalizedValue).toBe('A');
    expect(attr('version')?.normalizedValue).toBe('2');
    expect(attr('proof_date')?.normalizedValue).toBe('12/30/25');
    expect(attr('initials')?.normalizedValue).toBe('SO');
  });

  it('detects CMYK, the three PMS colours and the dieline', () => {
    const names = result.rawChannels.map((c) => c.channelName).sort();
    expect(names).toEqual([
      'Black',
      'Cyan',
      'Dieline',
      'Magenta',
      'PANTONE 185 C',
      'PANTONE 214 C',
      'PANTONE 285 C',
      'Yellow',
    ]);
    expect(result.rawChannels.every((c) => c.usedByArtwork)).toBe(true);
  });

  it('does not turn the PMS references into press stations', () => {
    expect(result.normalizedSummary.printingMethod).toBe('Digital');
    expect(result.normalizedSummary.processPrintSystem).toBe('CMYK');
    expect(result.normalizedSummary.digitalMatchTargets.sort()).toEqual([
      'PMS 185 C',
      'PMS 214 C',
      'PMS 285 C',
    ]);
    expect(result.normalizedSummary.spotInkPlates).toEqual([]);
    expect(result.normalizedSummary.pressStationCount).toBe(4);
  });

  it('reports no white, varnish, foil or emboss layer', () => {
    expect(result.normalizedSummary.whiteInkLayer).toBe('Not detected');
    expect(result.normalizedSummary.varnishLayer).toBe('Not detected');
    expect(result.normalizedSummary.foilLayer).toBe('Not detected');
    expect(result.normalizedSummary.embossLayer).toBe('Not detected');
  });

  it('separates proof annotation groups from production artwork', () => {
    const byName = Object.fromEntries(result.layers.map((l) => [l.name, l.classification]));
    expect(byName['Layer 1']).toBe('production');
    expect(byName['Sign Off']).toBe('proof_annotation');
    expect(byName['DIMENSION']).toBe('dimension');
  });

  it('derives the finished size from the dieline, not the page', () => {
    expect(dim('finished_width')?.valueIn).toBe(10);
    expect(dim('finished_height')?.valueIn).toBe(4.5);
    expect(dim('corner_radius')?.valueIn).toBe(0.125);
    expect(dim('page_width')?.valueIn).toBe(11);
    expect(dim('page_height')?.valueIn).toBe(8.5);
    expect(dim('page_vs_finished')?.warning).toMatch(/proof sheet/i);
  });

  it('reads the rewind, dispensing and eyemark fields', () => {
    expect(dim('rewind')?.rawValue).toBe('Rewind #3');
    expect(dim('dispensing_direction')?.rawValue).toBe('Right side of copy dispenses first');
    expect(dim('eyemark_size')?.rawValue).toBe('N/A');
    expect(dim('eyemark_location')?.rawValue).toBe('N/A');
    expect(dim('eyemark_frequency')?.rawValue).toBe('N/A');
    expect(dim('eyemark_size')?.status).toBe('not_applicable');
  });

  it('resolves the proof checkboxes from the marks drawn inside them', () => {
    expect(mat('print_orientation')?.normalizedValue).toBe('Surface printing');
    expect(mat('construction')?.normalizedValue).toBe('Not selected');
    expect(mat('substrate_color')?.normalizedValue).toBe('White');
  });

  it('flags missing material and finish information instead of inventing it', () => {
    for (const key of ['substrate_material', 'adhesive', 'liner', 'varnish', 'varnish_type', 'varnish_coverage']) {
      expect(mat(key)?.normalizedValue, key).toBe('Not specified');
      expect(mat(key)?.status, key).toBe('needs_review');
    }
    expect(mat('varnish')?.warning).toMatch(/Inks and Varnishes/);
  });

  it('recognises the file characteristics', () => {
    expect(result.file.createdInIllustrator).toBe(true);
    expect(result.file.fonts.length).toBeGreaterThan(0);
    expect(result.file.fonts.every((f) => f.embedded)).toBe(true);
    expect(result.file.primarilyVector).toBe(true);
    expect(result.file.hasOptionalContentLayers).toBe(false);
    expect(result.file.pageCount).toBe(1);
  });

  it('generates a separation preview for every channel', () => {
    expect(result.separations).toHaveLength(result.channels.length);
    for (const sep of result.separations) {
      expect(sep.generated).toBe(true);
      expect(sep.note).toMatch(/not an original editable Illustrator layer|not an output separation/i);
      expect(fs.existsSync(path.join(renderDir, path.basename(sep.file)))).toBe(true);
    }
    const dieline = result.separations.find((s) => s.channelName === 'Dieline')!;
    expect(dieline.method).toBe('exact_separation_isolate');
    expect(dieline.coverage).toBeGreaterThan(0);
    const black = result.separations.find((s) => s.channelName === 'Black')!;
    expect(black.method).toBe('process_channel_decomposition');
    expect(black.coverage).toBeGreaterThan(0.02);
  });

  it('produces composite, production-only and per-layer views', () => {
    const keys = result.views.map((v) => v.key);
    expect(keys).toContain('composite:1');
    expect(keys).toContain('production:1');
    expect(keys).toContain('layer:Sign Off:1');
    expect(keys).toContain('layer:DIMENSION:1');
  });

  it('raises no blocking preflight issues but does not declare it production ready', () => {
    expect(result.preflight.filter((p) => p.severity === 'blocking')).toHaveLength(0);
    expect(result.preflight.some((p) => p.code === 'no_optional_content')).toBe(true);
    expect(result.preflight.some((p) => p.code === 'proof_annotations_present')).toBe(true);
    expect(result.preflight.some((p) => p.code === 'missing_finish_spec')).toBe(true);
  });

  it('gives every finding a source, confidence and status', () => {
    for (const a of result.attributes) {
      expect(a.source, a.key).toBeTruthy();
      expect(a.confidence, a.key).toBeGreaterThanOrEqual(0);
      expect(a.status, a.key).toBeTruthy();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Workflow transitions                                                */
/* ------------------------------------------------------------------ */

describe('approval state machine', () => {
  const allows = (from: JobStatus, to: JobStatus) => ALLOWED_TRANSITIONS[from].includes(to);

  it('walks the happy path', () => {
    expect(allows('uploaded', 'analyzing')).toBe(true);
    expect(allows('analyzing', 'analysis_complete')).toBe(true);
    expect(allows('analysis_complete', 'needs_prepress_review')).toBe(true);
    expect(allows('needs_prepress_review', 'prepress_reviewed')).toBe(true);
    expect(allows('prepress_reviewed', 'sent_for_customer_review')).toBe(true);
    expect(allows('sent_for_customer_review', 'approved')).toBe(true);
  });

  it('supports the changes-requested loop', () => {
    expect(allows('sent_for_customer_review', 'changes_requested')).toBe(true);
    expect(allows('changes_requested', 'revision_uploaded')).toBe(true);
    expect(allows('revision_uploaded', 'analyzing')).toBe(true);
  });

  it('refuses to skip prepress review or customer review', () => {
    expect(allows('analysis_complete', 'sent_for_customer_review')).toBe(false);
    expect(allows('needs_prepress_review', 'approved')).toBe(false);
    expect(allows('uploaded', 'approved')).toBe(false);
    expect(allows('prepress_reviewed', 'approved')).toBe(false);
  });

  it('treats superseded as terminal', () => {
    expect(ALLOWED_TRANSITIONS.superseded).toEqual([]);
  });

  it('lets an approved version be revised but not un-approved directly', () => {
    expect(allows('approved', 'revision_uploaded')).toBe(true);
    expect(allows('approved', 'changes_requested')).toBe(false);
  });
});
