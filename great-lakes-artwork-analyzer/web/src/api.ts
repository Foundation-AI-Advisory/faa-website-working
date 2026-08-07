/** Typed client for the analysis API. */

export type ConfirmationStatus = 'detected' | 'confirmed' | 'needs_review' | 'not_found' | 'not_applicable';
export type PreflightSeverity = 'pass' | 'info' | 'warning' | 'blocking';

export const STATUS_LABELS: Record<ConfirmationStatus, string> = {
  detected: 'Detected',
  confirmed: 'Confirmed',
  needs_review: 'Needs review',
  not_found: 'Not found',
  not_applicable: 'Not applicable',
};

export const SOURCE_LABELS: Record<string, string> = {
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
  derived: 'Derived',
};

export const ROLE_LABELS: Record<string, string> = {
  process_print_channel: 'Process print channel',
  spot_ink_plate: 'Spot ink plate',
  digital_match_target: 'Digital match-color target',
  structural_layer: 'Structural layer',
  finish: 'Finish',
  proof_only: 'Proof-only content',
  unclassified: 'Unclassified',
};

export const JOB_STATUS_LABELS: Record<string, string> = {
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

export interface DetectedAttribute {
  key: string;
  label: string;
  category: string;
  dataType: string;
  rawValue: string | null;
  normalizedValue: string | null;
  classification: string | null;
  source: string;
  confidence: number;
  status: ConfirmationStatus;
  warning: string | null;
  page: number | null;
  notes: string | null;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
}

export interface ColorChannel {
  id: string;
  channelName: string;
  normalizedName: string;
  type: string;
  role: string;
  swatchHex: string;
  alternateCmyk: number[] | null;
  alternateRgb: number[] | null;
  source: string;
  confidence: number;
  usedByArtwork: boolean;
  usageCount: number;
  usedInGroups: string[];
  isPressStation: boolean;
  status: ConfirmationStatus;
  warning: string | null;
  previewAvailable: boolean;
  notes: string | null;
  confirmedBy?: string | null;
}

export interface RawColorChannel {
  channelName: string;
  colorSpaceFamily: string;
  resourceKeys: string[];
  alternateCmyk: number[] | null;
  alternateRgb: number[] | null;
  swatchHex: string;
  usedByArtwork: boolean;
  usageCount: number;
  usedInGroups: string[];
  source: string;
  confidence: number;
}

export interface ProductionLayer {
  id: string;
  name: string;
  classification: string;
  source: string;
  confidence: number;
  isOptionalContent: boolean;
  printed: boolean | null;
  visible: boolean | null;
  objectCount: number;
  bbox: number[] | null;
  status: ConfirmationStatus;
  notes: string | null;
  confirmedBy?: string | null;
}

export interface MaterialFinish {
  id: string;
  key: string;
  label: string;
  category: string;
  rawValue: string | null;
  normalizedValue: string | null;
  source: string;
  confidence: number;
  status: ConfirmationStatus;
  warning: string | null;
  confirmedBy?: string | null;
}

export interface DimensionRecord {
  id: string;
  key: string;
  label: string;
  rawValue: string | null;
  valueIn: number | null;
  category: string;
  source: string;
  confidence: number;
  status: ConfirmationStatus;
  warning: string | null;
  confirmedBy?: string | null;
}

export interface PreflightIssue {
  id: string;
  code: string;
  title: string;
  severity: PreflightSeverity;
  detail: string;
  evidence: string | null;
  recommendation: string | null;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export interface SeparationPreview {
  channelId: string;
  channelName: string;
  method: string;
  file: string;
  coverage: number;
  generated: boolean;
  note: string;
}

export interface RenderedView {
  key: string;
  label: string;
  file: string;
  description: string;
}

export interface AnalysisResult {
  analyzerVersion: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  stages: { key: string; label: string; status: string; ms: number; detail: string | null }[];
  file: {
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
    fonts: { resourceKey: string; baseFont: string; subtype: string; embedded: boolean; subset: boolean; encoding: string | null }[];
    images: { resourceKey: string; width: number; height: number; colorSpace: string; filter: string; effectivePpiX: number | null; effectivePpiY: number | null; isMask: boolean }[];
    vectorOperationCount: number;
    textOperationCount: number;
    imageOperationCount: number;
    primarilyVector: boolean;
    hasTransparency: boolean;
    encrypted: boolean;
  };
  attributes: DetectedAttribute[];
  rawChannels: RawColorChannel[];
  channels: ColorChannel[];
  layers: ProductionLayer[];
  materials: MaterialFinish[];
  dimensions: DimensionRecord[];
  preflight: PreflightIssue[];
  separations: SeparationPreview[];
  views: RenderedView[];
  normalizedSummary: {
    printingMethod: string | null;
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
  };
  rawFileData: Record<string, unknown>;
  warnings: string[];
}

export interface VersionRow {
  id: string;
  job_id: string;
  version_number: number;
  revision_label: string | null;
  file_asset_id: string;
  status: string;
  prepress_reviewed_at: string | null;
  prepress_reviewed_by: string | null;
  superseded_at: string | null;
  notes: string | null;
  created_at: string;
  created_by: string;
}

export interface JobRow {
  id: string;
  job_number: string;
  customer: string;
  product_number: string | null;
  title: string;
  status: string;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  seeded: number;
}

export interface StatusEvent {
  id: string;
  job_id: string;
  version_id: string | null;
  from_status: string | null;
  to_status: string;
  actor: string;
  actor_role: string;
  detail: string | null;
  created_at: string;
}

export interface CommentRow {
  id: string;
  version_id: string;
  audience: string;
  author_name: string;
  author_role: string;
  body: string;
  page: number | null;
  created_at: string;
}

export interface ApprovalRow {
  id: string;
  version_id: string;
  decision: string;
  signature_name: string;
  signature_email: string | null;
  comment: string | null;
  decided_at: string;
}

export interface NotificationRow {
  id: string;
  kind: string;
  recipient: string;
  subject: string;
  body: string;
  channel: string;
  delivery_state: string;
  is_resend: number;
  created_at: string;
}

export interface JobPayload {
  job: JobRow;
  statusLabel: string;
  versions: (VersionRow & { runState: string | null; analyzedAt: string | null })[];
  events: StatusEvent[];
  notifications: NotificationRow[];
}

export interface VersionPayload {
  version: VersionRow;
  asset: { id: string; originalName: string; byteSize: number; sha256: string; uploadedAt: string; uploadedBy: string; url: string } | null;
  run: { id: string; state: string; analyzerVersion: string; startedAt: string; finishedAt: string | null; durationMs: number | null; error: string | null; stages: AnalysisResult['stages'] } | null;
  analysis: AnalysisResult | null;
  blockingIssues: number;
  comments: CommentRow[];
  approvals: ApprovalRow[];
  job: JobPayload;
}

export interface DashboardPayload {
  counts: {
    awaitingAnalysis: number;
    needsPrepressReview: number;
    awaitingCustomer: number;
    changesRequested: number;
    approved: number;
    total: number;
  };
  averageApprovalHours: number | null;
  approvedCount: number;
  recentActivity: (StatusEvent & { job_number: string; title: string; customer: string })[];
  jobs: (JobRow & { statusLabel: string })[];
}

export interface JobListItem extends JobRow {
  statusLabel: string;
  versionCount: number;
  currentVersionId: string | null;
  currentVersionNumber: number | null;
  runState: string | null;
}

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError('Could not reach the analysis server. Check that it is running and try again.');
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error ?? `Request failed (${res.status}).`;
    throw new ApiError(message);
  }
  return body as T;
}

const json = (data: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});

export const api = {
  dashboard: () => request<DashboardPayload>('/dashboard'),
  jobs: (filter = 'all', q = '') =>
    request<JobListItem[]>(`/jobs?filter=${encodeURIComponent(filter)}&q=${encodeURIComponent(q)}`),
  job: (jobId: string) => request<JobPayload>(`/jobs/${jobId}`),
  version: (versionId: string) => request<VersionPayload>(`/versions/${versionId}`),
  run: (runId: string) =>
    request<{ id: string; versionId: string; state: string; error: string | null; stages: AnalysisResult['stages'] }>(
      `/runs/${runId}`,
    ),
  upload: (form: FormData) => request<{ jobId: string; versionId: string }>('/jobs', { method: 'POST', body: form }),
  uploadRevision: (jobId: string, form: FormData) =>
    request<{ jobId: string; versionId: string }>(`/jobs/${jobId}/revisions`, { method: 'POST', body: form }),
  confirm: (versionId: string, payload: Record<string, unknown>) =>
    request<VersionPayload>(`/versions/${versionId}/confirm`, json(payload)),
  resolveIssue: (versionId: string, issueId: string, payload: Record<string, unknown>) =>
    request<VersionPayload>(`/versions/${versionId}/preflight/${issueId}/resolve`, json(payload)),
  prepressReview: (versionId: string, payload: Record<string, unknown>) =>
    request<VersionPayload>(`/versions/${versionId}/prepress-review`, json(payload)),
  sendForReview: (versionId: string, payload: Record<string, unknown>) =>
    request<VersionPayload>(`/versions/${versionId}/send-for-review`, json(payload)),
  approve: (versionId: string, payload: Record<string, unknown>) =>
    request<VersionPayload>(`/versions/${versionId}/approve`, json(payload)),
  requestChanges: (versionId: string, payload: Record<string, unknown>) =>
    request<VersionPayload>(`/versions/${versionId}/request-changes`, json(payload)),
  comment: (versionId: string, payload: Record<string, unknown>) =>
    request<VersionPayload>(`/versions/${versionId}/comments`, json(payload)),
  resendNotification: (notificationId: string, payload: Record<string, unknown>) =>
    request<{ id: string }>(`/notifications/${notificationId}/resend`, json(payload)),
};

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'approved':
    case 'prepress_reviewed':
    case 'confirmed':
      return 'badge-ok';
    case 'changes_requested':
    case 'needs_review':
    case 'needs_prepress_review':
      return 'badge-warn';
    case 'sent_for_customer_review':
    case 'analyzing':
    case 'detected':
      return 'badge-info';
    case 'superseded':
    case 'not_applicable':
      return 'badge-neutral';
    case 'not_found':
      return 'badge-red';
    default:
      return 'badge-neutral';
  }
}
