/**
 * A PDF content-stream scanner.
 *
 * This is the deterministic geometry engine: it walks every operator on the page,
 * maintains the graphics state, and records where each colour space is actually
 * painted, what the vector geometry looks like, and which Illustrator
 * marked-content group each object belongs to.
 */

export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function mul(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

export function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export type BBox = [number, number, number, number];

function emptyBox(): BBox {
  return [Infinity, Infinity, -Infinity, -Infinity];
}

function grow(box: BBox, x: number, y: number): void {
  if (x < box[0]) box[0] = x;
  if (y < box[1]) box[1] = y;
  if (x > box[2]) box[2] = x;
  if (y > box[3]) box[3] = y;
}

function isRealBox(b: BBox): boolean {
  return Number.isFinite(b[0]) && Number.isFinite(b[1]) && b[2] >= b[0] && b[3] >= b[1];
}

/* ------------------------------------------------------------------ */
/* Tokenizer                                                           */
/* ------------------------------------------------------------------ */

type Token =
  | { t: 'num'; v: number }
  | { t: 'name'; v: string }
  | { t: 'str'; v: string }
  | { t: 'arr'; v: Token[] }
  | { t: 'dict'; v: Record<string, Token> }
  | { t: 'op'; v: string };

const WS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

class Lexer {
  private i = 0;

  constructor(private readonly s: string) {}

  get pos(): number {
    return this.i;
  }

  private code(k = 0): number {
    return this.s.charCodeAt(this.i + k);
  }

  private skipWs(): void {
    while (this.i < this.s.length) {
      const c = this.code();
      if (WS.has(c)) {
        this.i += 1;
      } else if (c === 0x25) {
        // comment
        while (this.i < this.s.length && this.code() !== 0x0a && this.code() !== 0x0d) this.i += 1;
      } else {
        return;
      }
    }
  }

  /** Skip the binary payload of an inline image (BI ... ID <data> EI). */
  skipInlineImage(): void {
    const idx = this.s.indexOf('ID', this.i);
    if (idx < 0) {
      this.i = this.s.length;
      return;
    }
    let p = idx + 3;
    while (p < this.s.length - 1) {
      if (this.s.charCodeAt(p) === 0x45 && this.s.charCodeAt(p + 1) === 0x49) {
        const before = this.s.charCodeAt(p - 1);
        const after = p + 2 < this.s.length ? this.s.charCodeAt(p + 2) : 0x20;
        if (WS.has(before) && (WS.has(after) || DELIM.has(after))) {
          this.i = p + 2;
          return;
        }
      }
      p += 1;
    }
    this.i = this.s.length;
  }

  next(): Token | null {
    this.skipWs();
    if (this.i >= this.s.length) return null;
    const c = this.code();

    if (c === 0x2f) {
      // name
      this.i += 1;
      const start = this.i;
      while (this.i < this.s.length && !WS.has(this.code()) && !DELIM.has(this.code())) this.i += 1;
      const raw = this.s.slice(start, this.i);
      return { t: 'name', v: raw.replace(/#([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) };
    }

    if (c === 0x28) {
      // literal string
      this.i += 1;
      let depth = 1;
      let out = '';
      while (this.i < this.s.length) {
        const ch = this.code();
        if (ch === 0x5c) {
          const nx = this.code(1);
          this.i += 2;
          switch (nx) {
            case 0x6e: out += '\n'; break;
            case 0x72: out += '\r'; break;
            case 0x74: out += '\t'; break;
            case 0x62: out += '\b'; break;
            case 0x66: out += '\f'; break;
            case 0x0a: break;
            case 0x0d: if (this.code() === 0x0a) this.i += 1; break;
            default: {
              if (nx >= 0x30 && nx <= 0x37) {
                let oct = String.fromCharCode(nx);
                for (let k = 0; k < 2; k += 1) {
                  const d = this.code();
                  if (d >= 0x30 && d <= 0x37) {
                    oct += String.fromCharCode(d);
                    this.i += 1;
                  } else break;
                }
                out += String.fromCharCode(parseInt(oct, 8));
              } else {
                out += String.fromCharCode(nx);
              }
            }
          }
          continue;
        }
        if (ch === 0x28) depth += 1;
        if (ch === 0x29) {
          depth -= 1;
          if (depth === 0) {
            this.i += 1;
            return { t: 'str', v: out };
          }
        }
        out += String.fromCharCode(ch);
        this.i += 1;
      }
      return { t: 'str', v: out };
    }

    if (c === 0x3c && this.code(1) === 0x3c) {
      this.i += 2;
      const d: Record<string, Token> = {};
      for (;;) {
        this.skipWs();
        if (this.i >= this.s.length) break;
        if (this.code() === 0x3e && this.code(1) === 0x3e) {
          this.i += 2;
          break;
        }
        const k = this.next();
        if (!k) break;
        if (k.t !== 'name') continue;
        const v = this.next();
        if (!v) break;
        d[k.v] = v;
      }
      return { t: 'dict', v: d };
    }

    if (c === 0x3c) {
      // hex string
      this.i += 1;
      let hex = '';
      while (this.i < this.s.length && this.code() !== 0x3e) {
        const ch = this.s[this.i];
        if (/[0-9A-Fa-f]/.test(ch)) hex += ch;
        this.i += 1;
      }
      this.i += 1;
      if (hex.length % 2) hex += '0';
      let out = '';
      for (let k = 0; k < hex.length; k += 2) out += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16));
      return { t: 'str', v: out };
    }

    if (c === 0x5b) {
      this.i += 1;
      const arr: Token[] = [];
      for (;;) {
        this.skipWs();
        if (this.i >= this.s.length) break;
        if (this.code() === 0x5d) {
          this.i += 1;
          break;
        }
        const v = this.next();
        if (!v) break;
        arr.push(v);
      }
      return { t: 'arr', v: arr };
    }

    if (c === 0x5d || c === 0x3e || c === 0x29 || c === 0x7b || c === 0x7d) {
      this.i += 1;
      return this.next();
    }

    const start = this.i;
    while (this.i < this.s.length && !WS.has(this.code()) && !DELIM.has(this.code())) this.i += 1;
    if (this.i === start) this.i += 1;
    const word = this.s.slice(start, this.i);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) return { t: 'num', v: parseFloat(word) };
    return { t: 'op', v: word };
  }
}

/* ------------------------------------------------------------------ */
/* Scan results                                                        */
/* ------------------------------------------------------------------ */

/** A single paint action, attributed to a colour space and a layer group. */
export interface PaintEvent {
  /** 'fill' | 'stroke' | 'image' | 'shading' | 'text' */
  kind: string;
  /** Resource key of a named colour space (e.g. CS0), or a device space label. */
  colorSpaceKey: string;
  /** Device space components when the colour came from k/K/rg/RG/g/G. */
  deviceComponents: number[] | null;
  /** Tint values passed to scn/SCN for named spaces. */
  tint: number[] | null;
  group: string | null;
  bbox: BBox | null;
  /** True when the paint had a non-zero area (rules out empty paths). */
  hasArea: boolean;
}

export interface SegmentRecord {
  kind: 'line' | 'rect' | 'curve';
  bbox: BBox;
  painted: 'stroke' | 'fill' | 'both' | 'none';
  colorSpaceKey: string;
  deviceComponents: number[] | null;
  group: string | null;
  /** Straight-line endpoints in user space, for diagonal/tick detection. */
  points: [number, number][];
  /** Corner-arc radii for rounded rectangles, in points. */
  cornerRadii?: [number, number][];
  strokeWidth: number;
}

export interface ShowTextRecord {
  /** Origin of the text-showing operator in user space. */
  x: number;
  y: number;
  fontKey: string | null;
  fontSize: number;
  group: string | null;
  /** Raw byte codes of the shown string(s). */
  codes: number[];
  raw: string;
}

export interface ImagePlacement {
  resourceKey: string;
  ctm: Matrix;
  group: string | null;
  widthPt: number;
  heightPt: number;
}

export interface GroupRecord {
  /** Marked-content property resource key, e.g. MC0. */
  key: string;
  /** Byte offsets of the BDC..EMC block inside the content stream. */
  start: number;
  end: number;
  objectCount: number;
  bbox: BBox | null;
}

export interface ContentScan {
  paints: PaintEvent[];
  segments: SegmentRecord[];
  texts: ShowTextRecord[];
  images: ImagePlacement[];
  groups: GroupRecord[];
  /** Per-colour-space-key usage counts, split by paint type. */
  colorUsage: Map<string, { fill: number; stroke: number; groups: Set<string> }>;
  /** Device colour operator usage: which of c/m/y/k/gray/rgb ever carried ink. */
  deviceInk: { c: number; m: number; y: number; k: number; gray: number; rgb: number };
  deviceCmykValues: Set<string>;
  deviceRgbValues: Set<string>;
  counts: {
    pathOps: number;
    paintOps: number;
    textShowOps: number;
    imageOps: number;
    shadingOps: number;
    total: number;
  };
  usesTransparency: boolean;
  /** ExtGState resource keys referenced by `gs`. */
  usedExtGStates: Set<string>;
  /** ExtGState keys that were active while white was painted (overprint check). */
  whiteOverprintCandidates: number;
  errors: string[];
}

interface GState {
  ctm: Matrix;
  fillCs: string;
  strokeCs: string;
  fillComponents: number[] | null;
  strokeComponents: number[] | null;
  fillTint: number[] | null;
  strokeTint: number[] | null;
  lineWidth: number;
  gsKey: string | null;
  overprint: boolean;
}

function cloneGs(g: GState): GState {
  return { ...g, ctm: [...g.ctm] as Matrix };
}

export interface ScanOptions {
  /** Maps marked-content resource keys (MC0) to human titles (Layer 1). */
  groupTitles?: Record<string, string>;
  /** ExtGState keys whose fill alpha is below 1, used for transparency detection. */
  softGStates?: Set<string>;
  /** ExtGState keys that switch overprint on. */
  overprintGStates?: Set<string>;
}

export function scanContentStream(content: string, opts: ScanOptions = {}): ContentScan {
  const lex = new Lexer(content);
  const scan: ContentScan = {
    paints: [],
    segments: [],
    texts: [],
    images: [],
    groups: [],
    colorUsage: new Map(),
    deviceInk: { c: 0, m: 0, y: 0, k: 0, gray: 0, rgb: 0 },
    deviceCmykValues: new Set(),
    deviceRgbValues: new Set(),
    counts: { pathOps: 0, paintOps: 0, textShowOps: 0, imageOps: 0, shadingOps: 0, total: 0 },
    usesTransparency: false,
    usedExtGStates: new Set(),
    whiteOverprintCandidates: 0,
    errors: [],
  };

  const stack: GState[] = [];
  let gs: GState = {
    ctm: [...IDENTITY] as Matrix,
    fillCs: 'DeviceGray',
    strokeCs: 'DeviceGray',
    fillComponents: [0],
    strokeComponents: [0],
    fillTint: null,
    strokeTint: null,
    lineWidth: 1,
    gsKey: null,
    overprint: false,
  };

  const mcStack: { key: string; start: number; count: number; bbox: BBox }[] = [];
  const groupByKey = new Map<string, GroupRecord>();

  // Current path, in user space.
  let pathBox = emptyBox();
  let pathPoints: [number, number][] = [];
  let subPathStart: [number, number] | null = null;
  let current: [number, number] | null = null;
  let pathKind: 'line' | 'rect' | 'curve' = 'line';
  let sawCurve = false;
  let sawRect = false;
  const cornerRadii: [number, number][] = [];
  let curveStarts: [number, number][] = [];

  // Text state.
  let tm: Matrix = [...IDENTITY] as Matrix;
  let tlm: Matrix = [...IDENTITY] as Matrix;
  let fontKey: string | null = null;
  let fontSize = 0;
  let leading = 0;

  const operands: Token[] = [];

  const nums = (n: number): number[] => {
    const out: number[] = [];
    const slice = operands.slice(-n);
    for (const t of slice) out.push(t.t === 'num' ? t.v : 0);
    while (out.length < n) out.unshift(0);
    return out;
  };

  const currentGroup = (): string | null => {
    for (let i = mcStack.length - 1; i >= 0; i -= 1) {
      const key = mcStack[i].key;
      const title = opts.groupTitles?.[key];
      if (title) return title;
    }
    return mcStack.length ? mcStack[mcStack.length - 1].key : null;
  };

  const bumpGroup = (box: BBox | null) => {
    for (const m of mcStack) {
      m.count += 1;
      if (box && isRealBox(box)) {
        grow(m.bbox, box[0], box[1]);
        grow(m.bbox, box[2], box[3]);
      }
    }
  };

  const noteColorUse = (key: string, type: 'fill' | 'stroke') => {
    let rec = scan.colorUsage.get(key);
    if (!rec) {
      rec = { fill: 0, stroke: 0, groups: new Set<string>() };
      scan.colorUsage.set(key, rec);
    }
    rec[type] += 1;
    const g = currentGroup();
    if (g) rec.groups.add(g);
  };

  const resetPath = () => {
    pathBox = emptyBox();
    pathPoints = [];
    subPathStart = null;
    current = null;
    sawCurve = false;
    sawRect = false;
    pathKind = 'line';
    cornerRadii.length = 0;
    curveStarts = [];
  };

  const moveTo = (x: number, y: number) => {
    const p = apply(gs.ctm, x, y);
    grow(pathBox, p[0], p[1]);
    pathPoints.push(p);
    subPathStart = p;
    current = p;
  };

  const lineTo = (x: number, y: number) => {
    const p = apply(gs.ctm, x, y);
    grow(pathBox, p[0], p[1]);
    pathPoints.push(p);
    current = p;
  };

  const curveTo = (pts: number[]) => {
    sawCurve = true;
    const from = current;
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const p = apply(gs.ctm, pts[i], pts[i + 1]);
      grow(pathBox, p[0], p[1]);
      if (i + 2 >= pts.length) {
        // Endpoint of the curve — the corner-arc measure is |end - start|.
        if (from) {
          cornerRadii.push([Math.abs(p[0] - from[0]), Math.abs(p[1] - from[1])]);
          curveStarts.push(from);
        }
        current = p;
        pathPoints.push(p);
      }
    }
  };

  const paint = (mode: 'stroke' | 'fill' | 'both' | 'none') => {
    scan.counts.paintOps += 1;
    const box: BBox | null = isRealBox(pathBox) ? ([...pathBox] as BBox) : null;
    const area = box ? (box[2] - box[0]) * (box[3] - box[1]) : 0;

    if (mode !== 'none') {
      if (mode === 'fill' || mode === 'both') {
        noteColorUse(gs.fillCs, 'fill');
        scan.paints.push({
          kind: 'fill',
          colorSpaceKey: gs.fillCs,
          deviceComponents: gs.fillComponents,
          tint: gs.fillTint,
          group: currentGroup(),
          bbox: box,
          hasArea: area > 0,
        });
        recordDeviceInk(gs.fillCs, gs.fillComponents);
      }
      if (mode === 'stroke' || mode === 'both') {
        noteColorUse(gs.strokeCs, 'stroke');
        scan.paints.push({
          kind: 'stroke',
          colorSpaceKey: gs.strokeCs,
          deviceComponents: gs.strokeComponents,
          tint: gs.strokeTint,
          group: currentGroup(),
          bbox: box,
          hasArea: true,
        });
        recordDeviceInk(gs.strokeCs, gs.strokeComponents);
      }
    }

    if (box) {
      const isStroke = mode === 'stroke' || mode === 'both';
      scan.segments.push({
        kind: sawRect ? 'rect' : sawCurve ? 'curve' : 'line',
        bbox: box,
        painted: mode,
        colorSpaceKey: isStroke ? gs.strokeCs : gs.fillCs,
        deviceComponents: isStroke ? gs.strokeComponents : gs.fillComponents,
        group: currentGroup(),
        points: pathPoints.slice(0, 64),
        cornerRadii: cornerRadii.length ? cornerRadii.slice(0, 16) : undefined,
        strokeWidth: gs.lineWidth * Math.hypot(gs.ctm[0], gs.ctm[1]),
      });
      // Clip paths (`n`) define no marks, so they must not enlarge a group's bbox.
      if (mode !== 'none') bumpGroup(box);
    }
    resetPath();
  };

  function recordDeviceInk(cs: string, comps: number[] | null): void {
    if (!comps) return;
    if (cs === 'DeviceCMYK' && comps.length >= 4) {
      const [c, m, y, k] = comps;
      if (c > 0.001) scan.deviceInk.c += 1;
      if (m > 0.001) scan.deviceInk.m += 1;
      if (y > 0.001) scan.deviceInk.y += 1;
      if (k > 0.001) scan.deviceInk.k += 1;
      scan.deviceCmykValues.add(comps.slice(0, 4).map((v) => v.toFixed(4)).join(','));
      if (c <= 0.001 && m <= 0.001 && y <= 0.001 && k <= 0.001 && gs.overprint) {
        scan.whiteOverprintCandidates += 1;
      }
    } else if (cs === 'DeviceRGB' && comps.length >= 3) {
      scan.deviceInk.rgb += 1;
      scan.deviceRgbValues.add(comps.slice(0, 3).map((v) => v.toFixed(4)).join(','));
    } else if (cs === 'DeviceGray' && comps.length >= 1) {
      if (comps[0] < 0.999) scan.deviceInk.gray += 1;
    }
  }

  let tok: Token | null;
  let guard = 0;
  while ((tok = lex.next()) !== null) {
    guard += 1;
    if (guard > 8_000_000) {
      scan.errors.push('Content stream scan aborted after 8,000,000 tokens.');
      break;
    }
    if (tok.t !== 'op') {
      operands.push(tok);
      if (operands.length > 64) operands.shift();
      continue;
    }
    scan.counts.total += 1;
    const op = tok.v;

    switch (op) {
      case 'q':
        stack.push(cloneGs(gs));
        break;
      case 'Q': {
        const p = stack.pop();
        if (p) gs = p;
        break;
      }
      case 'cm': {
        const [a, b, c, d, e, f] = nums(6);
        gs.ctm = mul([a, b, c, d, e, f], gs.ctm);
        break;
      }
      case 'w':
        gs.lineWidth = nums(1)[0];
        break;
      case 'gs': {
        const nm = operands[operands.length - 1];
        if (nm && nm.t === 'name') {
          gs.gsKey = nm.v;
          scan.usedExtGStates.add(nm.v);
          if (opts.softGStates?.has(nm.v)) scan.usesTransparency = true;
          if (opts.overprintGStates) gs.overprint = opts.overprintGStates.has(nm.v);
        }
        break;
      }

      /* colour ------------------------------------------------------- */
      case 'cs':
      case 'CS': {
        const nm = operands[operands.length - 1];
        const key = nm && nm.t === 'name' ? nm.v : 'DeviceGray';
        if (op === 'cs') {
          gs.fillCs = key;
          gs.fillComponents = null;
          gs.fillTint = null;
        } else {
          gs.strokeCs = key;
          gs.strokeComponents = null;
          gs.strokeTint = null;
        }
        break;
      }
      case 'sc':
      case 'scn':
      case 'SC':
      case 'SCN': {
        const vals: number[] = [];
        for (const t of operands) if (t.t === 'num') vals.push(t.v);
        const tail = vals.slice(-4);
        const isFill = op === 'sc' || op === 'scn';
        if (isFill) gs.fillTint = tail.length ? tail : null;
        else gs.strokeTint = tail.length ? tail : null;
        break;
      }
      case 'g':
      case 'G': {
        const v = nums(1);
        if (op === 'g') {
          gs.fillCs = 'DeviceGray';
          gs.fillComponents = v;
        } else {
          gs.strokeCs = 'DeviceGray';
          gs.strokeComponents = v;
        }
        break;
      }
      case 'rg':
      case 'RG': {
        const v = nums(3);
        if (op === 'rg') {
          gs.fillCs = 'DeviceRGB';
          gs.fillComponents = v;
        } else {
          gs.strokeCs = 'DeviceRGB';
          gs.strokeComponents = v;
        }
        break;
      }
      case 'k':
      case 'K': {
        const v = nums(4);
        if (op === 'k') {
          gs.fillCs = 'DeviceCMYK';
          gs.fillComponents = v;
        } else {
          gs.strokeCs = 'DeviceCMYK';
          gs.strokeComponents = v;
        }
        break;
      }

      /* path --------------------------------------------------------- */
      case 'm': {
        const [x, y] = nums(2);
        moveTo(x, y);
        scan.counts.pathOps += 1;
        break;
      }
      case 'l': {
        const [x, y] = nums(2);
        lineTo(x, y);
        scan.counts.pathOps += 1;
        break;
      }
      case 'c':
        curveTo(nums(6));
        scan.counts.pathOps += 1;
        break;
      case 'v':
      case 'y':
        curveTo(nums(4));
        scan.counts.pathOps += 1;
        break;
      case 'h':
        if (subPathStart) {
          pathPoints.push(subPathStart);
          current = subPathStart;
        }
        break;
      case 're': {
        const [x, y, w, h] = nums(4);
        sawRect = true;
        const corners: [number, number][] = [
          apply(gs.ctm, x, y),
          apply(gs.ctm, x + w, y),
          apply(gs.ctm, x + w, y + h),
          apply(gs.ctm, x, y + h),
        ];
        for (const c of corners) {
          grow(pathBox, c[0], c[1]);
          pathPoints.push(c);
        }
        subPathStart = corners[0];
        current = corners[0];
        scan.counts.pathOps += 1;
        break;
      }

      /* painting ----------------------------------------------------- */
      case 'S':
      case 's':
        paint('stroke');
        break;
      case 'f':
      case 'F':
      case 'f*':
        paint('fill');
        break;
      case 'B':
      case 'B*':
      case 'b':
      case 'b*':
        paint('both');
        break;
      case 'n':
        paint('none');
        break;
      case 'W':
      case 'W*':
        break;

      /* text --------------------------------------------------------- */
      case 'BT':
        tm = [...IDENTITY] as Matrix;
        tlm = [...IDENTITY] as Matrix;
        break;
      case 'ET':
        break;
      case 'Tf': {
        const nm = operands[operands.length - 2];
        fontKey = nm && nm.t === 'name' ? nm.v : fontKey;
        fontSize = nums(1)[0];
        break;
      }
      case 'TL':
        leading = nums(1)[0];
        break;
      case 'Td': {
        const [tx, ty] = nums(2);
        tlm = mul([1, 0, 0, 1, tx, ty], tlm);
        tm = [...tlm] as Matrix;
        break;
      }
      case 'TD': {
        const [tx, ty] = nums(2);
        leading = -ty;
        tlm = mul([1, 0, 0, 1, tx, ty], tlm);
        tm = [...tlm] as Matrix;
        break;
      }
      case 'Tm': {
        const [a, b, c, d, e, f] = nums(6);
        tlm = [a, b, c, d, e, f];
        tm = [...tlm] as Matrix;
        break;
      }
      case 'T*':
        tlm = mul([1, 0, 0, 1, 0, -leading], tlm);
        tm = [...tlm] as Matrix;
        break;
      case 'Tj':
      case "'":
      case '"':
      case 'TJ': {
        if (op === "'" || op === '"') {
          tlm = mul([1, 0, 0, 1, 0, -leading], tlm);
          tm = [...tlm] as Matrix;
        }
        const full = mul(tm, gs.ctm);
        const origin = apply(full, 0, 0);
        const codes: number[] = [];
        let raw = '';
        const last = operands[operands.length - 1];
        const collect = (t: Token | undefined) => {
          if (!t) return;
          if (t.t === 'str') {
            raw += t.v;
            for (let i = 0; i < t.v.length; i += 1) codes.push(t.v.charCodeAt(i));
          } else if (t.t === 'arr') {
            for (const e of t.v) collect(e);
          }
        };
        collect(last);
        const effSize = fontSize * Math.hypot(full[0], full[1]);
        scan.texts.push({
          x: origin[0],
          y: origin[1],
          fontKey,
          fontSize: effSize,
          group: currentGroup(),
          codes,
          raw,
        });
        scan.counts.textShowOps += 1;
        noteColorUse(gs.fillCs, 'fill');
        recordDeviceInk(gs.fillCs, gs.fillComponents);
        scan.paints.push({
          kind: 'text',
          colorSpaceKey: gs.fillCs,
          deviceComponents: gs.fillComponents,
          tint: gs.fillTint,
          group: currentGroup(),
          bbox: [origin[0], origin[1], origin[0] + effSize * raw.length * 0.5, origin[1] + effSize],
          hasArea: true,
        });
        bumpGroup([origin[0], origin[1], origin[0] + effSize * raw.length * 0.5, origin[1] + effSize]);
        break;
      }

      /* XObjects, shading, marked content ---------------------------- */
      case 'Do': {
        const nm = operands[operands.length - 1];
        const key = nm && nm.t === 'name' ? nm.v : '?';
        const p0 = apply(gs.ctm, 0, 0);
        const p1 = apply(gs.ctm, 1, 0);
        const p2 = apply(gs.ctm, 0, 1);
        const box: BBox = emptyBox();
        for (const [px, py] of [
          apply(gs.ctm, 0, 0),
          apply(gs.ctm, 1, 0),
          apply(gs.ctm, 1, 1),
          apply(gs.ctm, 0, 1),
        ]) grow(box, px, py);
        scan.images.push({
          resourceKey: key,
          ctm: [...gs.ctm] as Matrix,
          group: currentGroup(),
          widthPt: Math.hypot(p1[0] - p0[0], p1[1] - p0[1]),
          heightPt: Math.hypot(p2[0] - p0[0], p2[1] - p0[1]),
        });
        scan.counts.imageOps += 1;
        bumpGroup(box);
        break;
      }
      case 'sh':
        scan.counts.shadingOps += 1;
        break;
      case 'BI':
        lex.skipInlineImage();
        scan.counts.imageOps += 1;
        break;
      case 'BDC':
      case 'BMC': {
        let key = 'unnamed';
        if (op === 'BDC') {
          const prop = operands[operands.length - 1];
          if (prop && prop.t === 'name') key = prop.v;
          else if (prop && prop.t === 'dict') {
            const t = prop.v['Title'] ?? prop.v['Name'];
            key = t && t.t === 'str' ? t.v : 'inline';
          }
        }
        mcStack.push({ key, start: lex.pos, count: 0, bbox: emptyBox() });
        break;
      }
      case 'EMC': {
        const m = mcStack.pop();
        if (m) {
          const existing = groupByKey.get(m.key);
          const box = isRealBox(m.bbox) ? ([...m.bbox] as BBox) : null;
          if (existing) {
            existing.objectCount += m.count;
            existing.end = lex.pos;
            if (box && existing.bbox) {
              existing.bbox = [
                Math.min(existing.bbox[0], box[0]),
                Math.min(existing.bbox[1], box[1]),
                Math.max(existing.bbox[2], box[2]),
                Math.max(existing.bbox[3], box[3]),
              ];
            } else if (box) existing.bbox = box;
          } else {
            groupByKey.set(m.key, {
              key: m.key,
              start: m.start,
              end: lex.pos,
              objectCount: m.count,
              bbox: box,
            });
          }
        }
        break;
      }
      default:
        break;
    }
    operands.length = 0;
  }

  scan.groups = [...groupByKey.values()];
  return scan;
}
