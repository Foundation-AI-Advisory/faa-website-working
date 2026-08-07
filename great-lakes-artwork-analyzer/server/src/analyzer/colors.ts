/**
 * Colour and separation analysis.
 *
 * Two distinct layers, deliberately kept apart:
 *   1. RAW  — every channel the PDF literally declares or paints with.
 *   2. NORMALIZED — what those channels mean on press, which depends on the
 *      printing method stated on the proof.
 *
 * The normalisation step is what stops a digital proof carrying CMYK plus three
 * named PANTONE separations from being reported as a seven-station spot job.
 */
import type { ColorChannel, ProductionRole, RawColorChannel, ConfirmationStatus, AttributeSource } from '../types.js';
import { cmykToRgb, rgbToHex, type DeclaredColorSpace, type PageStructure } from './pdfStructure.js';
import type { ContentScan } from './contentStream.js';
import { colorKey, normalizeColorName } from './proofFields.js';

const PROCESS_NAMES: Record<string, [number, number, number, number]> = {
  CYAN: [1, 0, 0, 0],
  'PROCESS CYAN': [1, 0, 0, 0],
  C: [1, 0, 0, 0],
  MAGENTA: [0, 1, 0, 0],
  'PROCESS MAGENTA': [0, 1, 0, 0],
  M: [0, 1, 0, 0],
  YELLOW: [0, 0, 1, 0],
  'PROCESS YELLOW': [0, 0, 1, 0],
  Y: [0, 0, 1, 0],
  BLACK: [0, 0, 0, 1],
  'PROCESS BLACK': [0, 0, 0, 1],
  K: [0, 0, 0, 1],
};

export type ChannelType =
  | 'process'
  | 'spot'
  | 'white'
  | 'varnish'
  | 'dieline'
  | 'foil'
  | 'emboss'
  | 'deboss'
  | 'cut'
  | 'registration'
  | 'technical'
  | 'device';

export interface ChannelClassification {
  type: ChannelType;
  /** Human sentence explaining the call, shown in the UI. */
  rationale: string;
}

/**
 * Classify a channel from its name alone. Pure and order-independent so it can be
 * unit-tested against the naming conventions different prepress tools emit.
 */
export function classifyChannelName(rawName: string): ChannelClassification {
  const n = colorKey(rawName);
  // Prepress tools separate words with spaces, hyphens or underscores
  // interchangeably ("Thru-Cut", "thru cut", "THRU_CUT"), so match on a
  // separator-normalised copy.
  const l = n.toLowerCase().replace(/[_\-]+/g, ' ');

  if (PROCESS_NAMES[n.toUpperCase()]) {
    return { type: 'process', rationale: `"${rawName}" is a standard process ink name.` };
  }
  if (/^all$/i.test(n) || /\bregistration\b|\breg\s*mark/i.test(l)) {
    return { type: 'registration', rationale: `"${rawName}" names the registration / All separation.` };
  }
  if (/\b(die\s*line|dieline|die\s*cut|diecut|cut\s*contour|cutcontour|cut\s*line|cutline|thru\s*cut|through\s*cut|kiss\s*cut|knife|trim\s*line)\b/i.test(l)) {
    return { type: 'dieline', rationale: `"${rawName}" matches dieline / cut-path naming.` };
  }
  if (/\b(crease|score|perf|perforation|fold|bleed\s*line)\b/i.test(l)) {
    return { type: 'cut', rationale: `"${rawName}" matches structural finishing-path naming.` };
  }
  if (/\b(varnish|overprint\s*varnish|lacquer|aqueous|gloss\s*coat|matte?\s*coat|spot\s*uv|uv\s*coat|coating)\b/i.test(l)) {
    return { type: 'varnish', rationale: `"${rawName}" matches varnish / coating naming.` };
  }
  if (/\b(foil|hot\s*stamp|cold\s*foil)\b/i.test(l)) {
    return { type: 'foil', rationale: `"${rawName}" matches foil naming.` };
  }
  if (/\bdeboss/i.test(l)) return { type: 'deboss', rationale: `"${rawName}" matches deboss naming.` };
  if (/\bemboss/i.test(l)) return { type: 'emboss', rationale: `"${rawName}" matches emboss naming.` };
  if (/^(opaque\s+)?white(\s+ink)?$/i.test(n) || /\bwhite\s*(ink|under|base)\b/i.test(l)) {
    return { type: 'white', rationale: `"${rawName}" names a white ink layer.` };
  }
  if (/\b(dimension|sign\s*off|signoff|annotation|note|info|proof\s*only|do\s*not\s*print|non\s*print|nonprint|noprint|guide|template|slug)\b/i.test(l)) {
    return { type: 'technical', rationale: `"${rawName}" matches non-printing / annotation naming.` };
  }
  if (/^PMS\b/.test(n) || /\bspot\b/i.test(l)) {
    return { type: 'spot', rationale: `"${rawName}" names a spot colour.` };
  }
  return { type: 'spot', rationale: `"${rawName}" is a named separation with no recognised production keyword.` };
}

function swatchFor(cmyk: [number, number, number, number] | null, rgb: [number, number, number] | null): string {
  if (rgb) return rgbToHex(rgb);
  if (cmyk) return rgbToHex(cmykToRgb(...cmyk));
  return '#8a8f98';
}

export interface RawChannelContext {
  pages: PageStructure[];
  scans: ContentScan[];
}

/** Build the raw channel list: what the PDF declares and paints, with no interpretation. */
export function buildRawChannels(ctx: RawChannelContext): RawColorChannel[] {
  const byName = new Map<string, RawColorChannel>();

  const upsert = (
    name: string,
    partial: Omit<RawColorChannel, 'channelName' | 'usageCount' | 'usedInGroups' | 'usedByArtwork' | 'resourceKeys'>,
    resourceKey: string | null,
  ): RawColorChannel => {
    const key = colorKey(name);
    let rec = byName.get(key);
    if (!rec) {
      rec = {
        channelName: name,
        ...partial,
        resourceKeys: [],
        usedByArtwork: false,
        usageCount: 0,
        usedInGroups: [],
      };
      byName.set(key, rec);
    } else {
      // Keep the richest colour information we have seen for this ink.
      if (!rec.alternateCmyk && partial.alternateCmyk) {
        rec.alternateCmyk = partial.alternateCmyk;
        rec.swatchHex = partial.swatchHex;
      }
      if (!rec.alternateRgb && partial.alternateRgb) rec.alternateRgb = partial.alternateRgb;
      if (rec.colorSpaceFamily === 'DeviceCMYK' && partial.colorSpaceFamily === 'Separation') {
        rec.colorSpaceFamily = 'Separation';
        rec.source = partial.source;
      }
    }
    if (resourceKey && !rec.resourceKeys.includes(resourceKey)) rec.resourceKeys.push(resourceKey);
    return rec;
  };

  ctx.pages.forEach((page, pageIdx) => {
    const scan = ctx.scans[pageIdx];

    // 1. Declared Separation / DeviceN colour spaces.
    for (const cs of page.colorSpaces) {
      if (cs.family !== 'Separation' && cs.family !== 'DeviceN') continue;
      cs.names.forEach((name, i) => {
        if (/^(None)$/i.test(name)) return;
        const cmyk = cs.names.length === 1 ? cs.solidCmyk : null;
        const rgb = cs.names.length === 1 ? cs.solidRgb : null;
        const processCmyk = PROCESS_NAMES[colorKey(name)];
        const finalCmyk = cmyk ?? (processCmyk ? [...processCmyk] as [number, number, number, number] : null);
        const rec = upsert(
          name,
          {
            colorSpaceFamily: cs.family as RawColorChannel['colorSpaceFamily'],
            alternateCmyk: finalCmyk,
            alternateRgb: rgb,
            swatchHex: swatchFor(finalCmyk, rgb),
            source: 'embedded_pdf_colorspace',
            confidence: 0.99,
          },
          cs.resourceKey,
        );
        const usage = scan?.colorUsage.get(cs.resourceKey);
        if (usage) {
          rec.usageCount += usage.fill + usage.stroke;
          if (usage.fill + usage.stroke > 0) rec.usedByArtwork = true;
          for (const g of usage.groups) if (!rec.usedInGroups.includes(g)) rec.usedInGroups.push(g);
        }
      });
    }

    // 2. Separation / DeviceN colour spaces attached directly to images.
    for (const xo of page.xObjects) {
      if (xo.subtype !== 'Image' || !xo.colorSpace) continue;
      const sep = /^(Separation|DeviceN) \((.+)\)$/.exec(xo.colorSpace);
      if (sep) {
        const rec = upsert(
          sep[2],
          {
            colorSpaceFamily: sep[1] as RawColorChannel['colorSpaceFamily'],
            alternateCmyk: PROCESS_NAMES[colorKey(sep[2])]
              ? ([...PROCESS_NAMES[colorKey(sep[2])]] as [number, number, number, number])
              : null,
            alternateRgb: null,
            swatchHex: swatchFor(
              PROCESS_NAMES[colorKey(sep[2])]
                ? ([...PROCESS_NAMES[colorKey(sep[2])]] as [number, number, number, number])
                : null,
              null,
            ),
            source: 'embedded_pdf_colorspace',
            confidence: 0.95,
          },
          xo.resourceKey,
        );
        const used = scan?.images.some((i) => i.resourceKey === xo.resourceKey) ?? false;
        if (used) {
          rec.usedByArtwork = true;
          rec.usageCount += 1;
          const grp = scan?.images.find((i) => i.resourceKey === xo.resourceKey)?.group;
          if (grp && !rec.usedInGroups.includes(grp)) rec.usedInGroups.push(grp);
        }
      }
    }

    if (!scan) return;

    // 3. Device colour operators. Only channels that actually carry ink are listed.
    const deviceCmykInImage = page.xObjects.some(
      (x) => x.subtype === 'Image' && (x.colorSpace === 'DeviceCMYK' || /ICCBased/.test(x.colorSpace ?? '')) &&
        scan.images.some((i) => i.resourceKey === x.resourceKey),
    );
    const processHits: [string, number, [number, number, number, number]][] = [
      ['Cyan', scan.deviceInk.c, [1, 0, 0, 0]],
      ['Magenta', scan.deviceInk.m, [0, 1, 0, 0]],
      ['Yellow', scan.deviceInk.y, [0, 0, 1, 0]],
      ['Black', scan.deviceInk.k, [0, 0, 0, 1]],
    ];
    for (const [name, count, cmyk] of processHits) {
      const cmykImageContribution = deviceCmykInImage ? 1 : 0;
      const total = count + cmykImageContribution;
      if (total === 0) continue;
      const rec = upsert(
        name,
        {
          colorSpaceFamily: 'DeviceCMYK',
          alternateCmyk: [...cmyk] as [number, number, number, number],
          alternateRgb: null,
          swatchHex: swatchFor([...cmyk] as [number, number, number, number], null),
          source: 'embedded_pdf_colorspace',
          confidence: 0.97,
        },
        'DeviceCMYK',
      );
      rec.usedByArtwork = true;
      rec.usageCount += total;
      const grps = scan.colorUsage.get('DeviceCMYK')?.groups;
      if (grps) for (const g of grps) if (!rec.usedInGroups.includes(g)) rec.usedInGroups.push(g);
    }

    if (scan.deviceInk.rgb > 0) {
      const rec = upsert(
        'DeviceRGB artwork',
        {
          colorSpaceFamily: 'DeviceRGB',
          alternateCmyk: null,
          alternateRgb: [120, 120, 200],
          swatchHex: '#7878c8',
          source: 'embedded_pdf_colorspace',
          confidence: 0.97,
        },
        'DeviceRGB',
      );
      rec.usedByArtwork = true;
      rec.usageCount += scan.deviceInk.rgb;
    }
    if (scan.deviceInk.gray > 0) {
      const rec = upsert(
        'DeviceGray artwork',
        {
          colorSpaceFamily: 'DeviceGray',
          alternateCmyk: [0, 0, 0, 1],
          alternateRgb: null,
          swatchHex: '#333333',
          source: 'embedded_pdf_colorspace',
          confidence: 0.9,
        },
        'DeviceGray',
      );
      rec.usedByArtwork = true;
      rec.usageCount += scan.deviceInk.gray;
    }
  });

  const order = ['CYAN', 'MAGENTA', 'YELLOW', 'BLACK'];
  return [...byName.values()].sort((a, b) => {
    const ai = order.indexOf(colorKey(a.channelName));
    const bi = order.indexOf(colorKey(b.channelName));
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.channelName.localeCompare(b.channelName);
  });
}

export interface NormalizationInput {
  raw: RawColorChannel[];
  /** 'Digital' | 'Flexographic' | ... or null when the proof does not say. */
  printingMethod: string | null;
  printingMethodConfidence: number;
  /** Colour names the proof lists as digital match targets. */
  digitalMatchNames: string[];
  /** Colour names the proof lists as physical ink stations. */
  declaredInkNames: string[];
  /** Marked-content groups classified as proof/annotation content. */
  annotationGroups: string[];
}

const DIGITAL_METHODS = /digital|inkjet|toner|hp\s*indigo|electrophotograph/i;

export function normalizeChannels(input: NormalizationInput): ColorChannel[] {
  const matchSet = new Set(input.digitalMatchNames.map(colorKey));
  const inkSet = new Set(input.declaredInkNames.map(colorKey));
  const isDigital = input.printingMethod ? DIGITAL_METHODS.test(input.printingMethod) : false;
  const methodKnown = Boolean(input.printingMethod) && input.printingMethodConfidence >= 0.6;

  return input.raw.map((r, idx) => {
    const cls = classifyChannelName(r.channelName);
    const normalizedName = normalizeColorName(r.channelName);
    const key = colorKey(r.channelName);
    const usedOnlyInAnnotations =
      r.usedInGroups.length > 0 && r.usedInGroups.every((g) => input.annotationGroups.includes(g));

    let role: ProductionRole = 'unclassified';
    let isPressStation = false;
    let status: ConfirmationStatus = 'detected';
    let warning: string | null = null;
    let notes: string | null = cls.rationale;

    switch (cls.type) {
      case 'process':
        role = 'process_print_channel';
        isPressStation = true;
        break;
      case 'dieline':
      case 'cut':
        role = 'structural_layer';
        isPressStation = false;
        notes = `${cls.rationale} Structural path — does not print as an ink.`;
        break;
      case 'registration':
        role = 'proof_only';
        notes = `${cls.rationale} Registration marks are prepress furniture, not a press station.`;
        break;
      case 'varnish':
      case 'foil':
      case 'emboss':
      case 'deboss':
        role = 'finish';
        isPressStation = true;
        break;
      case 'white':
        role = 'spot_ink_plate';
        isPressStation = true;
        break;
      case 'technical':
        role = 'proof_only';
        break;
      case 'spot': {
        if (matchSet.has(key)) {
          role = 'digital_match_target';
          isPressStation = false;
          notes = `Proof lists "${r.channelName}" under digital match colours, so it is a match target rather than a press station.`;
        } else if (isDigital) {
          role = 'digital_match_target';
          isPressStation = false;
          notes = `Named separation on a digital proof. A digital press has no spot station, so this is treated as a match target.`;
          if (!matchSet.size) {
            warning = 'Proof does not explicitly list this colour as a digital match target — confirm with prepress.';
            status = 'needs_review';
          }
        } else if (methodKnown) {
          role = 'spot_ink_plate';
          isPressStation = inkSet.size === 0 || inkSet.has(key);
          notes = `Named separation on a ${input.printingMethod} proof — treated as a physical spot ink plate.`;
        } else {
          role = 'unclassified';
          isPressStation = false;
          status = 'needs_review';
          warning =
            'Printing method is not confirmed, so this named separation cannot be classified as a spot plate or a digital match target.';
        }
        break;
      }
      default:
        role = 'unclassified';
    }

    if (usedOnlyInAnnotations && role !== 'structural_layer') {
      role = 'proof_only';
      isPressStation = false;
      notes = `${notes ?? ''} Used only inside proof/annotation content (${r.usedInGroups.join(', ')}).`.trim();
    }

    if (!r.usedByArtwork) {
      warning = warning ?? 'Declared in the PDF but no artwork object paints with it.';
      if (status === 'detected') status = 'needs_review';
      isPressStation = false;
    }

    return {
      id: `ch_${idx}_${key.replace(/[^A-Z0-9]+/gi, '_').toLowerCase()}`,
      channelName: r.channelName,
      normalizedName,
      type: cls.type,
      role,
      swatchHex: r.swatchHex,
      alternateCmyk: r.alternateCmyk,
      alternateRgb: r.alternateRgb,
      source: r.source as AttributeSource,
      confidence: r.confidence,
      usedByArtwork: r.usedByArtwork,
      usageCount: r.usageCount,
      usedInGroups: r.usedInGroups,
      isPressStation,
      status,
      warning,
      previewAvailable: false,
      notes,
    };
  });
}
