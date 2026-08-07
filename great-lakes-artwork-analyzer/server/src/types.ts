/**
 * Shared domain types for the Great Lakes Label Artwork Intelligence & Approval app.
 *
 * Nothing in here is specific to any one customer file. The analyzer emits these
 * structures for every PDF it inspects.
 */

/** Where a piece of information came from. Ordered roughly most→least authoritative. */
export type AttributeSource =
  | 'embedded_pdf_colorspace'
  | 'pdf_object'
  | 'illustrator_esko_metadata'
  | 'xmp_metadata'
  | 'proof_text'
  | 'dieline_geometry'
  | 'content_stream_geometry'
  | 'ocr'
  | 'visual_inference'
  | 'manual_entry'
  | 'derived';

export const SOURCE_LABELS: Record<AttributeSource, string> = {
  embedded_pdf_colorspace: 'Embedded PDF color space',
  pdf_object: 'PDF object',
  illustrator_esko_metadata: 'Illustrator / Esko metadata',
  xmp_metadata: 'XMP metadata',
  proof_text: 'Proof text',
  dieline_geometry: 'Dieline geometry',
  content_stream_geometry: 'Content stream geometry',
  ocr: 'OCR',
  visual_inference: 'Visual inference',
  manual_entry: 'Manual user entry',
  derived: 'Derived from other detections',
};

/** Lifecycle of a single detected value. */
export type ConfirmationStatus =
  | 'detected'
  | 'confirmed'
  | 'needs_review'
  | 'not_found'
  | 'not_applicable';

export const STATUS_LABELS: Record<ConfirmationStatus, string> = {
  detected: 'Detected',
  confirmed: 'Confirmed',
  needs_review: 'Needs review',
  not_found: 'Not found',
  not_applicable: 'Not applicable',
};

export type AttributeCategory =
  | 'job'
  | 'color'
  | 'material'
  | 'finish'
  | 'dimension'
  | 'construction'
  | 'file'
  | 'prepress';

export type AttributeDataType = 'string' | 'number' | 'boolean' | 'length_in' | 'enum' | 'json';

/**
 * A single analyzer finding. Never a bare value — always value + provenance so the
 * UI can show what is fact, what is inference, and what still needs a human.
 */
export interface DetectedAttribute {
  key: string;
  label: string;
  category: AttributeCategory;
  dataType: AttributeDataType;
  /** Exactly what came out of the file, before interpretation. */
  rawValue: string | null;
  /** Interpretation used by the rest of the app. */
  normalizedValue: string | null;
  classification: string | null;
  source: AttributeSource;
  /** 0..1 */
  confidence: number;
  status: ConfirmationStatus;
  /** Production warning shown alongside the value, if any. */
  warning: string | null;
  page: number | null;
  /** [x0, y0, x1, y1] in PDF user space (points, y-up), when known. */
  region: [number, number, number, number] | null;
  notes: string | null;
}

/** Raw channel exactly as the PDF declares it. */
export interface RawColorChannel {
  /** Name as written in the PDF (e.g. "PANTONE 214 C", "Cyan"). */
  channelName: string;
  /** Colour space family the channel was found in. */
  colorSpaceFamily:
    | 'DeviceCMYK'
    | 'DeviceRGB'
    | 'DeviceGray'
    | 'Separation'
    | 'DeviceN'
    | 'ICCBased'
    | 'Indexed'
    | 'Lab'
    | 'CalRGB'
    | 'CalGray'
    | 'Pattern';
  /** PDF resource key(s) it was declared under, e.g. /CS0. */
  resourceKeys: string[];
  /** Alternate space solid values at tint = 1. */
  alternateCmyk: [number, number, number, number] | null;
  alternateRgb: [number, number, number] | null;
  /** sRGB hex used for the UI swatch. */
  swatchHex: string;
  /** Does any drawing operator actually paint with it? */
  usedByArtwork: boolean;
  /** How many painting operations referenced it. */
  usageCount: number;
  /** Illustrator/marked-content groups in which it is used. */
  usedInGroups: string[];
  source: AttributeSource;
  confidence: number;
}

export type ProductionRole =
  | 'process_print_channel'
  | 'spot_ink_plate'
  | 'digital_match_target'
  | 'structural_layer'
  | 'finish'
  | 'proof_only'
  | 'unclassified';

export const ROLE_LABELS: Record<ProductionRole, string> = {
  process_print_channel: 'Process print channel',
  spot_ink_plate: 'Spot ink plate',
  digital_match_target: 'Digital match-color target',
  structural_layer: 'Structural layer',
  finish: 'Finish',
  proof_only: 'Proof-only content',
  unclassified: 'Unclassified',
};

/** Normalized production interpretation of a raw channel. */
export interface ColorChannel {
  id: string;
  channelName: string;
  normalizedName: string;
  /** Semantic type: process | spot | white | varnish | dieline | foil | emboss | deboss | cut | registration | technical */
  type: string;
  role: ProductionRole;
  swatchHex: string;
  alternateCmyk: [number, number, number, number] | null;
  alternateRgb: [number, number, number] | null;
  source: AttributeSource;
  confidence: number;
  usedByArtwork: boolean;
  usageCount: number;
  usedInGroups: string[];
  /** True when the channel becomes a physical press station in the normalized read. */
  isPressStation: boolean;
  status: ConfirmationStatus;
  warning: string | null;
  /** Populated after separation previews are generated. */
  previewAvailable: boolean;
  notes: string | null;
}

/** An Illustrator layer / marked-content group found in the file. */
export interface ProductionLayer {
  id: string;
  name: string;
  /** production | proof_annotation | dimension | unknown */
  classification: string;
  source: AttributeSource;
  confidence: number;
  /** True only for real PDF optional content (OCG/OCMD). */
  isOptionalContent: boolean;
  printed: boolean | null;
  visible: boolean | null;
  objectCount: number;
  bbox: [number, number, number, number] | null;
  status: ConfirmationStatus;
  notes: string | null;
}

export interface MaterialFinish {
  id: string;
  key: string;
  label: string;
  /** substrate | adhesive | liner | laminate | varnish | white_ink | foil | emboss | construction | print_orientation */
  category: string;
  rawValue: string | null;
  normalizedValue: string | null;
  source: AttributeSource;
  confidence: number;
  status: ConfirmationStatus;
  warning: string | null;
}

export interface DimensionRecord {
  id: string;
  key: string;
  label: string;
  rawValue: string | null;
  valueIn: number | null;
  /** finished | dieline | page | box | bleed | construction | eyemark | dispensing */
  category: string;
  source: AttributeSource;
  confidence: number;
  status: ConfirmationStatus;
  warning: string | null;
}

export type PreflightSeverity = 'pass' | 'info' | 'warning' | 'blocking';

export interface PreflightIssue {
  id: string;
  code: string;
  title: string;
  severity: PreflightSeverity;
  detail: string;
  /** What the analyzer actually observed, so a prepress user can verify it. */
  evidence: string | null;
  recommendation: string | null;
  page: number | null;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export interface SeparationPreview {
  channelId: string;
  channelName: string;
  /** exact_separation_isolate | process_channel_decomposition | layer_isolate | composite */
  method: string;
  file: string;
  /** Fraction of the page area carrying this ink. */
  coverage: number;
  /** Honest label shown in the UI. */
  generated: boolean;
  note: string;
}

export interface RenderedView {
  key: string;
  label: string;
  file: string;
  description: string;
}

/** Everything one analysis run produced. */
export interface AnalysisResult {
  analyzerVersion: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  stages: AnalysisStage[];
  file: FileCharacteristics;
  attributes: DetectedAttribute[];
  rawChannels: RawColorChannel[];
  channels: ColorChannel[];
  layers: ProductionLayer[];
  materials: MaterialFinish[];
  dimensions: DimensionRecord[];
  preflight: PreflightIssue[];
  separations: SeparationPreview[];
  views: RenderedView[];
  normalizedSummary: NormalizedSummary;
  rawFileData: RawFileData;
  warnings: string[];
}

export interface AnalysisStage {
  key: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  ms: number;
  detail: string | null;
}

export interface FileCharacteristics {
  fileName: string;
  fileSize: number;
  sha256: string;
  pageCount: number;
  pdfVersion: string | null;
  producer: string | null;
  creator: string | null;
  creationDate: string | null;
  modificationDate: string | null;
  title: string | null;
  createdInIllustrator: boolean;
  illustratorVersion: string | null;
  hasEskoMetadata: boolean;
  hasOptionalContentLayers: boolean;
  fonts: FontInfo[];
  images: ImageInfo[];
  vectorOperationCount: number;
  textOperationCount: number;
  imageOperationCount: number;
  primarilyVector: boolean;
  hasTransparency: boolean;
  encrypted: boolean;
}

export interface FontInfo {
  resourceKey: string;
  baseFont: string;
  subtype: string;
  embedded: boolean;
  subset: boolean;
  encoding: string | null;
}

export interface ImageInfo {
  resourceKey: string;
  width: number;
  height: number;
  colorSpace: string;
  filter: string;
  bitsPerComponent: number | null;
  /** Effective PPI once the placement matrix is applied. */
  effectivePpiX: number | null;
  effectivePpiY: number | null;
  isMask: boolean;
}

export interface NormalizedSummary {
  printingMethod: string | null;
  printingMethodSource: AttributeSource | null;
  printingMethodConfidence: number;
  processPrintSystem: string | null;
  pressStationCount: number | null;
  digitalMatchTargets: string[];
  spotInkPlates: string[];
  structuralLayers: string[];
  finishes: string[];
  whiteInkLayer: string;
  varnishLayer: string;
  foilLayer: string;
  embossLayer: string;
  proofOnlyContent: string[];
}

export interface RawFileData {
  info: Record<string, string>;
  xmpExcerpt: string | null;
  pageBoxes: Record<string, Record<string, number[]>>;
  colorSpaceResources: Record<string, unknown>;
  markedContentProperties: Record<string, unknown>;
  fontResources: Record<string, unknown>;
  xObjectResources: Record<string, unknown>;
  extGStateResources: Record<string, unknown>;
  optionalContentProperties: unknown;
  contentStreamStats: Record<string, number>;
  textLines: { page: number; y: number; x: number; text: string; group: string | null }[];
}

/* ------------------------------------------------------------------ */
/* Workflow                                                            */
/* ------------------------------------------------------------------ */

export type JobStatus =
  | 'uploaded'
  | 'analyzing'
  | 'analysis_complete'
  | 'needs_prepress_review'
  | 'prepress_reviewed'
  | 'sent_for_customer_review'
  | 'changes_requested'
  | 'revision_uploaded'
  | 'approved'
  | 'superseded';

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  uploaded: 'Uploaded',
  analyzing: 'Analyzing',
  analysis_complete: 'Analysis Complete',
  needs_prepress_review: 'Needs Prepress Review',
  prepress_reviewed: 'Prepress Reviewed',
  sent_for_customer_review: 'Sent for Customer Review',
  changes_requested: 'Changes Requested',
  revision_uploaded: 'Revision Uploaded',
  approved: 'Approved',
  superseded: 'Superseded',
};

/**
 * Allowed status moves. Anything not listed here is rejected by the API, so the
 * workflow cannot be driven into an impossible state by a stray client call.
 */
export const ALLOWED_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  uploaded: ['analyzing', 'superseded'],
  analyzing: ['analysis_complete', 'needs_prepress_review', 'uploaded'],
  analysis_complete: ['needs_prepress_review', 'prepress_reviewed', 'revision_uploaded', 'superseded'],
  needs_prepress_review: ['prepress_reviewed', 'revision_uploaded', 'superseded'],
  prepress_reviewed: ['sent_for_customer_review', 'needs_prepress_review', 'revision_uploaded', 'superseded'],
  sent_for_customer_review: ['approved', 'changes_requested', 'revision_uploaded', 'superseded'],
  changes_requested: ['revision_uploaded', 'needs_prepress_review', 'superseded'],
  revision_uploaded: ['analyzing', 'analysis_complete', 'superseded'],
  approved: ['revision_uploaded', 'superseded'],
  superseded: [],
};
