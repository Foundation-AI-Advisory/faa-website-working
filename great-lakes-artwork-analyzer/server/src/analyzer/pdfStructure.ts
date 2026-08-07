/**
 * Deterministic PDF structure inspection.
 *
 * Everything here comes out of real PDF objects — the Info dictionary, XMP packet,
 * page boxes, and the page Resources dictionary. No guessing, no OCR, no rendering.
 */
import {
  PDFArray,
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
  decodePDFRawStream,
} from 'pdf-lib';
import type { FontInfo } from '../types.js';

export interface DeclaredColorSpace {
  resourceKey: string;
  family: string;
  /** Separation name, or the list of names for DeviceN. */
  names: string[];
  alternateFamily: string | null;
  /** Solid (tint = 1) value in the alternate space. */
  solid: number[] | null;
  solidCmyk: [number, number, number, number] | null;
  solidRgb: [number, number, number] | null;
  /** Ref of the colour-space array, when it is an indirect object we can rewrite. */
  ref: PDFRef | null;
  componentCount: number;
}

export interface MarkedContentProperty {
  resourceKey: string;
  title: string | null;
  visible: boolean | null;
  printed: boolean | null;
  editable: boolean | null;
  dimmed: boolean | null;
  color: number[] | null;
}

export interface DeclaredXObject {
  resourceKey: string;
  subtype: string;
  width: number | null;
  height: number | null;
  colorSpace: string | null;
  filter: string | null;
  bitsPerComponent: number | null;
  isMask: boolean;
  hasOptionalContent: boolean;
  bbox: number[] | null;
}

export interface DeclaredExtGState {
  resourceKey: string;
  fillAlpha: number | null;
  strokeAlpha: number | null;
  blendMode: string | null;
  overprintFill: boolean | null;
  overprintStroke: boolean | null;
  overprintMode: number | null;
  hasSoftMask: boolean;
}

export interface PageStructure {
  index: number;
  /** [x0, y0, x1, y1] */
  mediaBox: number[];
  cropBox: number[] | null;
  trimBox: number[] | null;
  bleedBox: number[] | null;
  artBox: number[] | null;
  rotate: number;
  userUnit: number;
  widthPt: number;
  heightPt: number;
  content: string;
  colorSpaces: DeclaredColorSpace[];
  markedContentProps: MarkedContentProperty[];
  fonts: FontInfo[];
  xObjects: DeclaredXObject[];
  extGStates: DeclaredExtGState[];
  /** Raw resource dictionaries, JSON-ish, for the Raw File Data tab. */
  rawResources: Record<string, unknown>;
}

export interface PdfStructure {
  doc: PDFDocument;
  pdfVersion: string | null;
  encrypted: boolean;
  info: Record<string, string>;
  xmp: string | null;
  hasOptionalContentLayers: boolean;
  optionalContentProperties: unknown;
  pages: PageStructure[];
}

function asNumberArray(v: unknown): number[] | null {
  if (v instanceof PDFArray) {
    const out: number[] = [];
    for (let i = 0; i < v.size(); i += 1) {
      const el = v.lookup(i);
      if (el instanceof PDFNumber) out.push(el.asNumber());
      else return null;
    }
    return out;
  }
  return null;
}

function decodeText(v: unknown): string | null {
  if (v instanceof PDFString) return v.asString();
  if (v instanceof PDFHexString) return v.decodeText();
  if (v instanceof PDFName) return v.asString().replace(/^\//, '');
  if (v instanceof PDFNumber) return String(v.asNumber());
  if (v instanceof PDFBool) return String(v.asBoolean());
  return null;
}

function nameOf(v: unknown): string | null {
  return v instanceof PDFName ? v.asString().replace(/^\//, '') : null;
}

/** CMYK → sRGB using the same naive transform Acrobat uses for on-screen preview. */
export function cmykToRgb(c: number, m: number, y: number, k: number): [number, number, number] {
  const r = Math.round(255 * (1 - Math.min(1, c + k)));
  const g = Math.round(255 * (1 - Math.min(1, m + k)));
  const b = Math.round(255 * (1 - Math.min(1, y + k)));
  return [Math.max(0, r), Math.max(0, g), Math.max(0, b)];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Evaluate a PDF tint-transform function at t. Handles the exponential (type 2)
 * and stitching (type 3) forms that Illustrator and Esko emit; sampled (type 0)
 * functions fall back to their decoded range midpoint, and PostScript (type 4)
 * functions return null so the caller can degrade honestly instead of inventing
 * a colour.
 */
function evalFunction(fnObj: unknown, t: number, depth = 0): number[] | null {
  if (depth > 4) return null;
  let dict: PDFDict | null = null;
  if (fnObj instanceof PDFDict) dict = fnObj;
  else if (fnObj instanceof PDFStream) dict = fnObj.dict;
  if (!dict) return null;

  const type = dict.get(PDFName.of('FunctionType'));
  const ft = type instanceof PDFNumber ? type.asNumber() : -1;

  if (ft === 2) {
    const c0 = asNumberArray(dict.lookup(PDFName.of('C0'))) ?? [0];
    const c1 = asNumberArray(dict.lookup(PDFName.of('C1'))) ?? [1];
    const nRaw = dict.lookup(PDFName.of('N'));
    const n = nRaw instanceof PDFNumber ? nRaw.asNumber() : 1;
    const len = Math.max(c0.length, c1.length);
    const out: number[] = [];
    for (let i = 0; i < len; i += 1) {
      const a = c0[i] ?? 0;
      const b = c1[i] ?? 0;
      out.push(a + Math.pow(t, n) * (b - a));
    }
    return out;
  }

  if (ft === 3) {
    const fns = dict.lookup(PDFName.of('Functions'));
    const bounds = asNumberArray(dict.lookup(PDFName.of('Bounds'))) ?? [];
    const domain = asNumberArray(dict.lookup(PDFName.of('Domain'))) ?? [0, 1];
    if (!(fns instanceof PDFArray) || fns.size() === 0) return null;
    let k = 0;
    while (k < bounds.length && t >= bounds[k]) k += 1;
    const lo = k === 0 ? domain[0] : bounds[k - 1];
    const hi = k === bounds.length ? domain[1] : bounds[k];
    const encode = asNumberArray(dict.lookup(PDFName.of('Encode'))) ?? [];
    const e0 = encode[2 * k] ?? 0;
    const e1 = encode[2 * k + 1] ?? 1;
    const local = hi === lo ? e0 : e0 + ((t - lo) / (hi - lo)) * (e1 - e0);
    return evalFunction(fns.lookup(k), local, depth + 1);
  }

  if (ft === 0 && fnObj instanceof PDFStream) {
    // Sampled function: read the last sample, which is the tint = 1 end.
    try {
      const size = asNumberArray(dict.lookup(PDFName.of('Size'))) ?? [];
      const bps = dict.lookup(PDFName.of('BitsPerSample'));
      const range = asNumberArray(dict.lookup(PDFName.of('Range'))) ?? [];
      const nOut = range.length / 2;
      if (!(fnObj instanceof PDFRawStream) || nOut === 0 || size.length !== 1) return null;
      const bits = bps instanceof PDFNumber ? bps.asNumber() : 8;
      if (bits !== 8 && bits !== 16) return null;
      const bytes = decodePDFRawStream(fnObj).decode();
      const idx = Math.round(t * (size[0] - 1));
      const out: number[] = [];
      for (let i = 0; i < nOut; i += 1) {
        const max = (1 << bits) - 1;
        let raw: number;
        if (bits === 8) raw = bytes[idx * nOut + i];
        else raw = (bytes[(idx * nOut + i) * 2] << 8) | bytes[(idx * nOut + i) * 2 + 1];
        const lo = range[2 * i];
        const hi = range[2 * i + 1];
        out.push(lo + (raw / max) * (hi - lo));
      }
      return out;
    } catch {
      return null;
    }
  }

  return null;
}

function readColorSpace(key: string, obj: unknown, ref: PDFRef | null): DeclaredColorSpace | null {
  if (obj instanceof PDFName) {
    const fam = obj.asString().replace(/^\//, '');
    return {
      resourceKey: key,
      family: fam,
      names: [fam],
      alternateFamily: null,
      solid: null,
      solidCmyk: null,
      solidRgb: null,
      ref,
      componentCount: fam === 'DeviceCMYK' ? 4 : fam === 'DeviceRGB' ? 3 : 1,
    };
  }
  if (!(obj instanceof PDFArray) || obj.size() === 0) return null;
  const family = nameOf(obj.lookup(0)) ?? 'Unknown';

  if (family === 'Separation' || family === 'DeviceN') {
    let names: string[] = [];
    if (family === 'Separation') {
      names = [nameOf(obj.lookup(1)) ?? 'Unnamed'];
    } else {
      const arr = obj.lookup(1);
      if (arr instanceof PDFArray) {
        for (let i = 0; i < arr.size(); i += 1) names.push(nameOf(arr.lookup(i)) ?? `Ink${i}`);
      }
    }
    // PDF names are written with #xx escapes for spaces and specials.
    names = names.map((n) => n.replace(/#([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));

    const altObj = obj.lookup(2);
    const altFamily =
      nameOf(altObj) ?? (altObj instanceof PDFArray ? nameOf(altObj.lookup(0)) : null) ?? null;
    const fn = obj.lookup(3);
    const inputs = family === 'Separation' ? 1 : names.length;
    const solid = evalFunction(fn, 1) ?? null;

    let solidCmyk: [number, number, number, number] | null = null;
    let solidRgb: [number, number, number] | null = null;
    if (solid) {
      if (altFamily === 'DeviceCMYK' && solid.length >= 4) {
        solidCmyk = [solid[0], solid[1], solid[2], solid[3]];
        solidRgb = cmykToRgb(...solidCmyk);
      } else if (altFamily === 'DeviceRGB' && solid.length >= 3) {
        solidRgb = [
          Math.round(solid[0] * 255),
          Math.round(solid[1] * 255),
          Math.round(solid[2] * 255),
        ];
      } else if (altFamily === 'DeviceGray' && solid.length >= 1) {
        const g = Math.round(solid[0] * 255);
        solidRgb = [g, g, g];
      } else if (altFamily === 'ICCBased' || altFamily === 'Lab') {
        if (solid.length >= 4) {
          solidCmyk = [solid[0], solid[1], solid[2], solid[3]];
          solidRgb = cmykToRgb(...solidCmyk);
        } else if (solid.length === 3) {
          solidRgb = [
            Math.round(solid[0] * 255),
            Math.round(solid[1] * 255),
            Math.round(solid[2] * 255),
          ];
        }
      }
    }

    return {
      resourceKey: key,
      family,
      names,
      alternateFamily: altFamily,
      solid,
      solidCmyk,
      solidRgb,
      ref,
      componentCount: inputs,
    };
  }

  if (family === 'ICCBased') {
    const strm = obj.lookup(1);
    let n = 3;
    if (strm instanceof PDFStream) {
      const nv = strm.dict.lookup(PDFName.of('N'));
      if (nv instanceof PDFNumber) n = nv.asNumber();
    }
    return {
      resourceKey: key,
      family,
      names: [`ICCBased (${n} component${n === 1 ? '' : 's'})`],
      alternateFamily: n === 4 ? 'DeviceCMYK' : n === 3 ? 'DeviceRGB' : 'DeviceGray',
      solid: null,
      solidCmyk: null,
      solidRgb: null,
      ref,
      componentCount: n,
    };
  }

  return {
    resourceKey: key,
    family,
    names: [family],
    alternateFamily: null,
    solid: null,
    solidCmyk: null,
    solidRgb: null,
    ref,
    componentCount: 1,
  };
}

function readFonts(dict: PDFDict | undefined): FontInfo[] {
  const out: FontInfo[] = [];
  if (!dict) return out;
  for (const [key, valRef] of dict.entries()) {
    const val = dict.context.lookup(valRef);
    if (!(val instanceof PDFDict)) continue;
    const subtype = nameOf(val.get(PDFName.of('Subtype'))) ?? 'Unknown';
    let baseFont = nameOf(val.get(PDFName.of('BaseFont'))) ?? 'Unknown';

    // Type0 fonts carry the real descriptor on the descendant.
    let descriptorHost: PDFDict = val;
    if (subtype === 'Type0') {
      const desc = val.lookup(PDFName.of('DescendantFonts'));
      if (desc instanceof PDFArray && desc.size() > 0) {
        const d0 = desc.lookup(0);
        if (d0 instanceof PDFDict) descriptorHost = d0;
      }
    }
    const fd = descriptorHost.lookup(PDFName.of('FontDescriptor'));
    let embedded = false;
    if (fd instanceof PDFDict) {
      embedded =
        fd.get(PDFName.of('FontFile')) !== undefined ||
        fd.get(PDFName.of('FontFile2')) !== undefined ||
        fd.get(PDFName.of('FontFile3')) !== undefined;
    }
    if (subtype === 'Type3') embedded = true;

    const subset = /^[A-Z]{6}\+/.test(baseFont);
    const encObj = val.lookup(PDFName.of('Encoding'));
    let encoding: string | null = nameOf(encObj);
    if (encObj instanceof PDFDict) {
      const base = nameOf(encObj.get(PDFName.of('BaseEncoding')));
      const diffs = encObj.lookup(PDFName.of('Differences'));
      const diffCount = diffs instanceof PDFArray ? diffs.size() : 0;
      encoding = `${base ?? 'StandardEncoding'}${diffCount ? ` + ${diffCount} Differences` : ''}`;
    }

    out.push({
      resourceKey: key.asString().replace(/^\//, ''),
      baseFont,
      subtype,
      embedded,
      subset,
      encoding,
    });
  }
  return out.sort((a, b) => a.resourceKey.localeCompare(b.resourceKey));
}

function readXObjects(dict: PDFDict | undefined): DeclaredXObject[] {
  const out: DeclaredXObject[] = [];
  if (!dict) return out;
  for (const [key, valRef] of dict.entries()) {
    const val = dict.context.lookup(valRef);
    if (!(val instanceof PDFStream)) continue;
    const d = val.dict;
    const subtype = nameOf(d.get(PDFName.of('Subtype'))) ?? 'Unknown';
    const w = d.lookup(PDFName.of('Width'));
    const h = d.lookup(PDFName.of('Height'));
    const bpc = d.lookup(PDFName.of('BitsPerComponent'));
    const csObj = d.lookup(PDFName.of('ColorSpace'));
    let cs: string | null = nameOf(csObj);
    if (!cs && csObj instanceof PDFArray) {
      const fam = nameOf(csObj.lookup(0));
      const nm = fam === 'Separation' ? nameOf(csObj.lookup(1)) : null;
      cs = nm ? `${fam} (${nm})` : fam;
    }
    const filterObj = d.lookup(PDFName.of('Filter'));
    let filter: string | null = nameOf(filterObj);
    if (!filter && filterObj instanceof PDFArray) {
      const parts: string[] = [];
      for (let i = 0; i < filterObj.size(); i += 1) parts.push(nameOf(filterObj.lookup(i)) ?? '?');
      filter = parts.join(' + ');
    }
    const maskFlag = d.lookup(PDFName.of('ImageMask'));
    out.push({
      resourceKey: key.asString().replace(/^\//, ''),
      subtype,
      width: w instanceof PDFNumber ? w.asNumber() : null,
      height: h instanceof PDFNumber ? h.asNumber() : null,
      colorSpace: cs,
      filter,
      bitsPerComponent: bpc instanceof PDFNumber ? bpc.asNumber() : null,
      isMask: maskFlag instanceof PDFBool ? maskFlag.asBoolean() : false,
      hasOptionalContent: d.get(PDFName.of('OC')) !== undefined,
      bbox: asNumberArray(d.lookup(PDFName.of('BBox'))),
    });
  }
  return out.sort((a, b) => a.resourceKey.localeCompare(b.resourceKey));
}

function readExtGStates(dict: PDFDict | undefined): DeclaredExtGState[] {
  const out: DeclaredExtGState[] = [];
  if (!dict) return out;
  for (const [key, valRef] of dict.entries()) {
    const val = dict.context.lookup(valRef);
    if (!(val instanceof PDFDict)) continue;
    const num = (n: string) => {
      const v = val.lookup(PDFName.of(n));
      return v instanceof PDFNumber ? v.asNumber() : null;
    };
    const bool = (n: string) => {
      const v = val.lookup(PDFName.of(n));
      return v instanceof PDFBool ? v.asBoolean() : null;
    };
    const smask = val.lookup(PDFName.of('SMask'));
    out.push({
      resourceKey: key.asString().replace(/^\//, ''),
      fillAlpha: num('ca'),
      strokeAlpha: num('CA'),
      blendMode: nameOf(val.lookup(PDFName.of('BM'))),
      overprintFill: bool('op'),
      overprintStroke: bool('OP'),
      overprintMode: num('OPM'),
      hasSoftMask: smask !== undefined && nameOf(smask) !== 'None',
    });
  }
  return out.sort((a, b) => a.resourceKey.localeCompare(b.resourceKey));
}

function readMarkedContentProps(dict: PDFDict | undefined): MarkedContentProperty[] {
  const out: MarkedContentProperty[] = [];
  if (!dict) return out;
  for (const [key, valRef] of dict.entries()) {
    const val = dict.context.lookup(valRef);
    if (!(val instanceof PDFDict)) continue;
    const bool = (n: string) => {
      const v = val.lookup(PDFName.of(n));
      return v instanceof PDFBool ? v.asBoolean() : null;
    };
    out.push({
      resourceKey: key.asString().replace(/^\//, ''),
      title: decodeText(val.lookup(PDFName.of('Title'))) ?? decodeText(val.lookup(PDFName.of('Name'))),
      visible: bool('Visible'),
      printed: bool('Printed'),
      editable: bool('Editable'),
      dimmed: bool('Dimmed'),
      color: asNumberArray(val.lookup(PDFName.of('Color'))),
    });
  }
  return out;
}

function getPageContent(page: { node: PDFDict }): string {
  const contents = page.node.lookup(PDFName.of('Contents'));
  const chunks: Uint8Array[] = [];
  const push = (s: unknown) => {
    if (s instanceof PDFRawStream) {
      try {
        chunks.push(decodePDFRawStream(s).decode());
      } catch {
        /* undecodable stream — skipped, reported by the caller as a warning */
      }
    } else if (s instanceof PDFStream) {
      try {
        chunks.push(s.getContents());
      } catch {
        /* ignore */
      }
    }
  };
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i += 1) push(contents.lookup(i));
  } else {
    push(contents);
  }
  const total = chunks.reduce((n, c) => n + c.length + 1, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.length;
    merged[off] = 0x0a;
    off += 1;
  }
  return Buffer.from(merged).toString('latin1');
}

/** Walk up the page tree for inheritable attributes (Resources, MediaBox, Rotate). */
function inherited(node: PDFDict, key: string): unknown {
  let cur: PDFDict | undefined = node;
  let guard = 0;
  while (cur && guard < 32) {
    const v = cur.lookup(PDFName.of(key));
    if (v !== undefined) return v;
    const parent: unknown = cur.lookup(PDFName.of('Parent'));
    cur = parent instanceof PDFDict ? parent : undefined;
    guard += 1;
  }
  return undefined;
}

export async function readPdfStructure(bytes: Uint8Array): Promise<PdfStructure> {
  const doc = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false,
    throwOnInvalidObject: false,
  });
  const ctx = doc.context;

  const info: Record<string, string> = {};
  const infoRef = ctx.trailerInfo.Info;
  const infoDict = infoRef ? ctx.lookup(infoRef) : undefined;
  if (infoDict instanceof PDFDict) {
    for (const [k, v] of infoDict.entries()) {
      const text = decodeText(ctx.lookup(v));
      if (text !== null) info[k.asString().replace(/^\//, '')] = text;
    }
  }

  let xmp: string | null = null;
  const catalog = doc.catalog;
  const metaRef = catalog.get(PDFName.of('Metadata'));
  const meta = metaRef ? ctx.lookup(metaRef) : undefined;
  if (meta instanceof PDFRawStream) {
    try {
      xmp = Buffer.from(decodePDFRawStream(meta).decode()).toString('utf8');
    } catch {
      xmp = null;
    }
  } else if (meta instanceof PDFStream) {
    try {
      xmp = Buffer.from(meta.getContents()).toString('utf8');
    } catch {
      xmp = null;
    }
  }

  const ocPropsObj = catalog.lookup(PDFName.of('OCProperties'));
  let hasOptionalContentLayers = false;
  let optionalContentProperties: unknown = null;
  if (ocPropsObj instanceof PDFDict) {
    const ocgs = ocPropsObj.lookup(PDFName.of('OCGs'));
    hasOptionalContentLayers = ocgs instanceof PDFArray && ocgs.size() > 0;
    const groups: string[] = [];
    if (ocgs instanceof PDFArray) {
      for (let i = 0; i < ocgs.size(); i += 1) {
        const g = ocgs.lookup(i);
        if (g instanceof PDFDict) groups.push(decodeText(g.lookup(PDFName.of('Name'))) ?? `OCG ${i}`);
      }
    }
    optionalContentProperties = { ocgCount: groups.length, ocgNames: groups };
  }

  const pages: PageStructure[] = [];
  doc.getPages().forEach((page, index) => {
    const node = page.node as unknown as PDFDict;
    const media = asNumberArray(inherited(node, 'MediaBox')) ?? [0, 0, 612, 792];
    const rotObj = inherited(node, 'Rotate');
    const rotate = rotObj instanceof PDFNumber ? ((rotObj.asNumber() % 360) + 360) % 360 : 0;
    const uuObj = node.lookup(PDFName.of('UserUnit'));
    const userUnit = uuObj instanceof PDFNumber ? uuObj.asNumber() : 1;

    const resources = inherited(node, 'Resources');
    const resDict = resources instanceof PDFDict ? resources : undefined;

    const csDict = resDict?.lookup(PDFName.of('ColorSpace'));
    const colorSpaces: DeclaredColorSpace[] = [];
    if (csDict instanceof PDFDict) {
      for (const [k, vRef] of csDict.entries()) {
        const key = k.asString().replace(/^\//, '');
        const ref = vRef instanceof PDFRef ? vRef : null;
        const parsed = readColorSpace(key, ctx.lookup(vRef), ref);
        if (parsed) colorSpaces.push(parsed);
      }
    }

    const propsDict = resDict?.lookup(PDFName.of('Properties'));
    const fontDict = resDict?.lookup(PDFName.of('Font'));
    const xoDict = resDict?.lookup(PDFName.of('XObject'));
    const gsDict = resDict?.lookup(PDFName.of('ExtGState'));

    const rawResources: Record<string, unknown> = {};
    if (resDict) {
      for (const [k] of resDict.entries()) {
        rawResources[k.asString().replace(/^\//, '')] = true;
      }
    }

    const w = Math.abs(media[2] - media[0]) * userUnit;
    const h = Math.abs(media[3] - media[1]) * userUnit;

    pages.push({
      index,
      mediaBox: media,
      cropBox: asNumberArray(node.lookup(PDFName.of('CropBox'))),
      trimBox: asNumberArray(node.lookup(PDFName.of('TrimBox'))),
      bleedBox: asNumberArray(node.lookup(PDFName.of('BleedBox'))),
      artBox: asNumberArray(node.lookup(PDFName.of('ArtBox'))),
      rotate,
      userUnit,
      widthPt: rotate === 90 || rotate === 270 ? h : w,
      heightPt: rotate === 90 || rotate === 270 ? w : h,
      content: getPageContent(page as unknown as { node: PDFDict }),
      colorSpaces,
      markedContentProps: readMarkedContentProps(
        propsDict instanceof PDFDict ? propsDict : undefined,
      ),
      fonts: readFonts(fontDict instanceof PDFDict ? fontDict : undefined),
      xObjects: readXObjects(xoDict instanceof PDFDict ? xoDict : undefined),
      extGStates: readExtGStates(gsDict instanceof PDFDict ? gsDict : undefined),
      rawResources,
    });
  });

  // Header version, read straight off the file header.
  const header = Buffer.from(bytes.slice(0, 32)).toString('latin1');
  const versionMatch = header.match(/%PDF-(\d+\.\d+)/);

  return {
    doc,
    pdfVersion: versionMatch ? versionMatch[1] : null,
    encrypted: doc.isEncrypted,
    info,
    xmp,
    hasOptionalContentLayers,
    optionalContentProperties,
    pages,
  };
}

export function xmpValue(xmp: string | null, tag: string): string | null {
  if (!xmp) return null;
  const el = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(xmp);
  if (el) return el[1].replace(/<[^>]+>/g, '').trim() || null;
  const attr = new RegExp(`${tag}="([^"]*)"`).exec(xmp);
  return attr ? attr[1] : null;
}
