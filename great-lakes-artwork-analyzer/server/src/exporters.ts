/**
 * Structured and human-readable exports of an analysis.
 */
import { SOURCE_LABELS, STATUS_LABELS, ROLE_LABELS, type AnalysisResult } from './types.js';
import type { JobRow, VersionRow } from './store.js';

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(job: JobRow, version: VersionRow, result: AnalysisResult): string {
  const rows: unknown[][] = [
    [
      'Section',
      'Key',
      'Label',
      'Raw value',
      'Normalized value',
      'Classification',
      'Source',
      'Confidence',
      'Status',
      'Warning',
      'Analyzer version',
    ],
  ];
  const push = (section: string, r: unknown[]) => rows.push([section, ...r]);

  for (const a of result.attributes) {
    push('Attribute', [
      a.key,
      a.label,
      a.rawValue,
      a.normalizedValue,
      a.classification,
      SOURCE_LABELS[a.source] ?? a.source,
      a.confidence,
      STATUS_LABELS[a.status] ?? a.status,
      a.warning,
      result.analyzerVersion,
    ]);
  }
  for (const c of result.channels) {
    push('Colour channel', [
      c.id,
      c.channelName,
      c.channelName,
      c.normalizedName,
      `${c.type} / ${ROLE_LABELS[c.role] ?? c.role}${c.isPressStation ? ' / press station' : ''}`,
      SOURCE_LABELS[c.source] ?? c.source,
      c.confidence,
      STATUS_LABELS[c.status] ?? c.status,
      c.warning,
      result.analyzerVersion,
    ]);
  }
  for (const l of result.layers) {
    push('Production layer', [
      l.id,
      l.name,
      `${l.objectCount} objects`,
      l.classification,
      l.classification,
      SOURCE_LABELS[l.source] ?? l.source,
      l.confidence,
      STATUS_LABELS[l.status] ?? l.status,
      '',
      result.analyzerVersion,
    ]);
  }
  for (const m of result.materials) {
    push('Material / finish', [
      m.key,
      m.label,
      m.rawValue,
      m.normalizedValue,
      m.category,
      SOURCE_LABELS[m.source] ?? m.source,
      m.confidence,
      STATUS_LABELS[m.status] ?? m.status,
      m.warning,
      result.analyzerVersion,
    ]);
  }
  for (const d of result.dimensions) {
    push('Dimension', [
      d.key,
      d.label,
      d.rawValue,
      d.valueIn !== null ? `${d.valueIn} in` : null,
      d.category,
      SOURCE_LABELS[d.source] ?? d.source,
      d.confidence,
      STATUS_LABELS[d.status] ?? d.status,
      d.warning,
      result.analyzerVersion,
    ]);
  }
  for (const p of result.preflight) {
    push('Preflight', [
      p.code,
      p.title,
      p.evidence,
      p.detail,
      p.severity,
      'Preflight check',
      '',
      p.resolved ? 'Resolved' : 'Open',
      p.recommendation,
      result.analyzerVersion,
    ]);
  }
  for (const s of result.separations) {
    push('Separation preview', [
      s.channelId,
      s.channelName,
      s.method,
      `${(s.coverage * 100).toFixed(2)}% page coverage`,
      'Generated separation preview',
      'Derived from rendering',
      '',
      'Generated',
      s.note,
      result.analyzerVersion,
    ]);
  }

  const header = [
    ['Great Lakes Label — Artwork Intelligence & Approval'],
    ['Job', job.job_number],
    ['Customer', job.customer],
    ['Artwork', job.title],
    ['Version', version.version_number],
    ['Revision label', version.revision_label],
    ['Analyzer version', result.analyzerVersion],
    ['Analysed at', result.finishedAt],
    [],
  ];
  return [...header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export function toHtmlReport(
  job: JobRow,
  version: VersionRow,
  result: AnalysisResult,
  extras: { comments: unknown[]; approvals: unknown[]; events: unknown[] },
): string {
  const blocking = result.preflight.filter((p) => p.severity === 'blocking' && !p.resolved);
  const warnings = result.preflight.filter((p) => p.severity === 'warning' && !p.resolved);
  const needsReview = [
    ...result.attributes.filter((a) => a.status === 'needs_review'),
    ...result.materials.filter((m) => m.status === 'needs_review'),
    ...result.dimensions.filter((d) => d.status === 'needs_review'),
    ...result.channels.filter((c) => c.status === 'needs_review'),
  ];

  const row = (cells: unknown[]) => `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`;
  const table = (headers: string[], body: string) =>
    `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Artwork Analysis Report — ${esc(job.job_number)} v${version.version_number}</title>
<style>
 :root { --navy:#122a45; --red:#c8102e; --grey:#5b6672; --line:#d9dee4; }
 * { box-sizing: border-box; }
 body { font: 14px/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color:#1b2430; margin:0; padding:36px; background:#fff; }
 header { border-bottom:4px solid var(--red); padding-bottom:16px; margin-bottom:24px; }
 h1 { margin:0 0 4px; font-size:22px; color:var(--navy); letter-spacing:-.01em; }
 .sub { color:var(--grey); font-size:13px; }
 h2 { font-size:15px; text-transform:uppercase; letter-spacing:.06em; color:var(--navy); margin:28px 0 10px; border-bottom:1px solid var(--line); padding-bottom:6px; }
 table { border-collapse:collapse; width:100%; font-size:12.5px; margin-bottom:8px; }
 th { text-align:left; background:#f4f6f8; color:var(--navy); font-weight:600; }
 th, td { border:1px solid var(--line); padding:6px 8px; vertical-align:top; }
 .kv { display:grid; grid-template-columns:220px 1fr; gap:2px 16px; font-size:13px; }
 .kv dt { color:var(--grey); }
 .kv dd { margin:0; font-weight:600; }
 .pill { display:inline-block; padding:1px 8px; border-radius:10px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
 .blocking { background:#fbe3e6; color:#8e0b20; }
 .warning { background:#fdf1dd; color:#8a5a08; }
 .info { background:#e6eef7; color:#1d4571; }
 .pass { background:#e3f3e8; color:#1c6b36; }
 .note { background:#f7f9fb; border-left:3px solid var(--navy); padding:10px 14px; font-size:12.5px; color:#374252; margin:12px 0; }
 footer { margin-top:36px; border-top:1px solid var(--line); padding-top:12px; color:var(--grey); font-size:11.5px; }
</style></head><body>
<header>
  <h1>Great Lakes Label — Artwork Analysis Report</h1>
  <div class="sub">${esc(job.job_number)} · ${esc(job.customer)} · ${esc(job.title)} · Version ${version.version_number} (${esc(version.revision_label ?? '—')})</div>
</header>

<div class="note">
  Every value below carries its source and confidence. Values marked <strong>Needs review</strong> or
  <strong>Not found</strong> were not established from the file and must be confirmed by prepress before production.
  Separation images referenced by this analysis are generated previews derived from the PDF, not original
  Illustrator layers or output plates.
</div>

<h2>Job information</h2>
<dl class="kv">
  ${result.attributes
    .filter((a) => a.category === 'job' || a.category === 'prepress')
    .map(
      (a) =>
        `<dt>${esc(a.label)}</dt><dd>${esc(a.normalizedValue ?? '—')} <span class="pill ${
          a.status === 'confirmed' ? 'pass' : a.status === 'needs_review' ? 'warning' : 'info'
        }">${esc(STATUS_LABELS[a.status])}</span></dd>`,
    )
    .join('')}
  <dt>File</dt><dd>${esc(result.file.fileName)} · ${(result.file.fileSize / 1024 / 1024).toFixed(2)} MB · ${result.file.pageCount} page(s)</dd>
  <dt>SHA-256</dt><dd style="font-weight:400;font-family:monospace;font-size:11px">${esc(result.file.sha256)}</dd>
</dl>

<h2>Normalized production interpretation</h2>
<dl class="kv">
  <dt>Printing method</dt><dd>${esc(result.normalizedSummary.printingMethod ?? 'Not established')}</dd>
  <dt>Process print system</dt><dd>${esc(result.normalizedSummary.processPrintSystem ?? 'Not established')}</dd>
  <dt>Physical press stations</dt><dd>${esc(result.normalizedSummary.pressStationCount ?? '—')}</dd>
  <dt>Digital match-colour targets</dt><dd>${esc(result.normalizedSummary.digitalMatchTargets.join(', ') || 'None')}</dd>
  <dt>Spot ink plates</dt><dd>${esc(result.normalizedSummary.spotInkPlates.join(', ') || 'None')}</dd>
  <dt>Structural layers</dt><dd>${esc(result.normalizedSummary.structuralLayers.join(', ') || 'None')}</dd>
  <dt>Separate white-ink layer</dt><dd>${esc(result.normalizedSummary.whiteInkLayer)}</dd>
  <dt>Separate varnish layer</dt><dd>${esc(result.normalizedSummary.varnishLayer)}</dd>
  <dt>Foil layer</dt><dd>${esc(result.normalizedSummary.foilLayer)}</dd>
  <dt>Emboss / deboss layer</dt><dd>${esc(result.normalizedSummary.embossLayer)}</dd>
  <dt>Proof-only content</dt><dd>${esc(result.normalizedSummary.proofOnlyContent.join(', ') || 'None')}</dd>
</dl>

<h2>Raw colour channels</h2>
${table(
  ['Channel', 'Colour space', 'Alternate CMYK', 'Used by artwork', 'Paint ops', 'Groups'],
  result.rawChannels
    .map((c) =>
      row([
        c.channelName,
        c.colorSpaceFamily,
        c.alternateCmyk ? c.alternateCmyk.map((v) => `${Math.round(v * 100)}%`).join(' / ') : '—',
        c.usedByArtwork ? 'Yes' : 'No',
        c.usageCount,
        c.usedInGroups.join(', ') || '—',
      ]),
    )
    .join(''),
)}

<h2>Normalized separations</h2>
${table(
  ['Channel', 'Normalized', 'Type', 'Production role', 'Press station', 'Status', 'Note'],
  result.channels
    .map((c) =>
      row([
        c.channelName,
        c.normalizedName,
        c.type,
        ROLE_LABELS[c.role] ?? c.role,
        c.isPressStation ? 'Yes' : 'No',
        STATUS_LABELS[c.status],
        c.warning ?? c.notes ?? '',
      ]),
    )
    .join(''),
)}

<h2>Materials and finishes</h2>
${table(
  ['Item', 'Value', 'Source', 'Status', 'Review note'],
  result.materials
    .map((m) =>
      row([
        m.label,
        m.normalizedValue ?? '—',
        SOURCE_LABELS[m.source] ?? m.source,
        STATUS_LABELS[m.status],
        m.warning ?? '',
      ]),
    )
    .join(''),
)}

<h2>Dimensions and construction</h2>
${table(
  ['Item', 'Value', 'Inches', 'Source', 'Status', 'Note'],
  result.dimensions
    .map((d) =>
      row([
        d.label,
        d.rawValue ?? '—',
        d.valueIn ?? '',
        SOURCE_LABELS[d.source] ?? d.source,
        STATUS_LABELS[d.status],
        d.warning ?? '',
      ]),
    )
    .join(''),
)}

<h2>Preflight</h2>
${table(
  ['Severity', 'Check', 'Detail', 'Evidence', 'Recommendation', 'State'],
  result.preflight
    .map((p) =>
      `<tr><td><span class="pill ${p.severity}">${esc(p.severity)}</span></td><td>${esc(p.title)}</td><td>${esc(
        p.detail,
      )}</td><td>${esc(p.evidence ?? '')}</td><td>${esc(p.recommendation ?? '')}</td><td>${
        p.resolved ? `Resolved by ${esc(p.resolvedBy)}` : 'Open'
      }</td></tr>`,
    )
    .join(''),
)}

<h2>Production readiness</h2>
<div class="note">
  ${
    blocking.length
      ? `<strong>Not production ready.</strong> ${blocking.length} blocking issue(s) are unresolved: ${esc(
          blocking.map((b) => b.title).join('; '),
        )}.`
      : version.prepress_reviewed_at
        ? `No blocking issues remain and prepress review was completed by ${esc(
            version.prepress_reviewed_by,
          )} on ${esc(version.prepress_reviewed_at)}. ${warnings.length} warning(s) and ${needsReview.length} unconfirmed value(s) remain for reference.`
        : `No blocking issues were found, but this analysis has not been marked prepress-reviewed. Production readiness requires prepress confirmation.`
  }
</div>

<h2>Generated separation previews</h2>
${table(
  ['Channel', 'Method', 'Page coverage', 'Note'],
  result.separations
    .map((s) => row([s.channelName, s.method, `${(s.coverage * 100).toFixed(2)}%`, s.note]))
    .join(''),
)}

<h2>Audit trail</h2>
${table(
  ['When', 'Actor', 'From', 'To', 'Detail'],
  (extras.events as Record<string, string>[])
    .map((e) => row([e.created_at, `${e.actor} (${e.actor_role})`, e.from_status ?? '—', e.to_status, e.detail ?? '']))
    .join(''),
)}

<h2>Comments</h2>
${
  (extras.comments as Record<string, string>[]).length
    ? table(
        ['When', 'Audience', 'Author', 'Comment'],
        (extras.comments as Record<string, string>[])
          .map((c) => row([c.created_at, c.audience, `${c.author_name} (${c.author_role})`, c.body]))
          .join(''),
      )
    : '<p style="color:#5b6672;font-size:13px">No comments recorded on this version.</p>'
}

<h2>Approvals</h2>
${
  (extras.approvals as Record<string, string>[]).length
    ? table(
        ['When', 'Decision', 'Signature', 'Comment'],
        (extras.approvals as Record<string, string>[])
          .map((a) => row([a.decided_at, a.decision, `${a.signature_name}${a.signature_email ? ` <${a.signature_email}>` : ''}`, a.comment ?? '']))
          .join(''),
      )
    : '<p style="color:#5b6672;font-size:13px">No approval decision recorded on this version.</p>'
}

<footer>
  Analyzer ${esc(result.analyzerVersion)} · analysis completed ${esc(result.finishedAt)} in ${result.durationMs} ms ·
  report generated ${esc(new Date().toISOString())}.<br>
  Deterministic PDF inspection was used for colour spaces, geometry, metadata and layer structure. Proof text was used
  for values the PDF structure cannot express. No content was sent to an external service.
</footer>
</body></html>`;
}
