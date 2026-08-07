import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  api,
  fmtBytes,
  fmtDate,
  JOB_STATUS_LABELS,
  ROLE_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  type AnalysisResult,
  type ColorChannel,
  type DetectedAttribute,
  type DimensionRecord,
  type MaterialFinish,
  type PreflightIssue,
  type VersionPayload,
} from '../api';
import { Badge, ConfirmControls, Empty, ErrorNote, Modal, SourceTag, Spinner, StatusBadge } from '../components/ui';
import { ProofViewer } from '../components/ProofViewer';
import { NewAnalysis } from './NewAnalysis';

type TabKey = 'summary' | 'colors' | 'materials' | 'dimensions' | 'preflight' | 'approval' | 'raw';

const TABS: [TabKey, string][] = [
  ['summary', 'Summary'],
  ['colors', 'Colors & Separations'],
  ['materials', 'Materials & Finishes'],
  ['dimensions', 'Dimensions & Construction'],
  ['preflight', 'Preflight'],
  ['approval', 'Approval'],
  ['raw', 'Raw File Data'],
];

export function Workspace() {
  const { versionId = '' } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<VersionPayload | null>(null);
  const [tab, setTab] = useState<TabKey>('summary');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const v = await api.version(versionId);
      setData(v);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [versionId]);

  useEffect(() => {
    setData(null);
    void reload();
  }, [reload]);

  // Keep polling while an analysis is still running.
  useEffect(() => {
    if (data?.run?.state !== 'running') return;
    const timer = setInterval(reload, 900);
    return () => clearInterval(timer);
  }, [data?.run?.state, reload]);

  const act = useCallback(
    async (fn: () => Promise<VersionPayload>, successMessage?: string) => {
      setBusy(true);
      setError(null);
      try {
        const v = await fn();
        setData(v);
        if (successMessage) {
          setToast(successMessage);
          setTimeout(() => setToast(null), 4000);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  if (error && !data) return <ErrorNote error={error} />;
  if (!data)
    return (
      <div className="flex" style={{ padding: 40 }}>
        <Spinner dark /> Loading workspace…
      </div>
    );

  const { version, job, analysis, run, asset } = data;

  if (run?.state === 'running' || run?.state === 'queued') {
    return (
      <div className="card" style={{ maxWidth: 620, margin: '40px auto' }}>
        <div className="card-head">
          <h2>Analysis in progress</h2>
          <Spinner dark />
        </div>
        <div className="card-body">
          <ul className="stage-list">
            {run.stages.map((s) => (
              <li key={s.key}>
                <span className={`stage-dot ${s.status}`} />
                <span>{s.label}</span>
                {s.ms ? <span className="stage-ms">{s.ms} ms</span> : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (run?.state === 'failed' || !analysis) {
    return (
      <div className="stack" style={{ maxWidth: 640, margin: '40px auto' }}>
        <div className="note error">
          <strong>The analyzer could not process this file.</strong>
          <div style={{ marginTop: 6 }}>{run?.error ?? 'No analysis is attached to this version.'}</div>
        </div>
        <div className="btn-row">
          <Link className="btn" to={`/jobs/${job.job.id}`}>
            Back to job
          </Link>
          {asset ? (
            <a className="btn" href={`${asset.url}?download=1`} download>
              Download the uploaded file
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  const confirm = (targetType: string, targetId: string, action: 'confirm' | 'edit' | 'reject', value?: string) =>
    act(() => api.confirm(version.id, { targetType, targetId, action, value: value ?? null, actorName: 'Susan (Prepress)' }));

  return (
    <div className="workspace">
      <ProofViewer
        pdfUrl={asset?.url ?? ''}
        downloadUrl={asset ? `${asset.url}?download=1` : '#'}
        analysis={analysis}
        channels={analysis.channels}
      />

      <div className="analysis-pane">
        <div className="tabs">
          {TABS.map(([key, label]) => (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
              {label}
              {key === 'preflight' && analysis.preflight.some((p) => p.severity === 'blocking' && !p.resolved) ? (
                <span className="badge badge-blocked" style={{ marginLeft: 6 }}>
                  {analysis.preflight.filter((p) => p.severity === 'blocking' && !p.resolved).length}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="tab-body">
          <ErrorNote error={error} />
          {toast ? <div className="note ok">{toast}</div> : null}

          {tab === 'summary' ? (
            <SummaryTab data={data} busy={busy} onConfirm={confirm} />
          ) : tab === 'colors' ? (
            <ColorsTab analysis={analysis} busy={busy} onConfirm={confirm} />
          ) : tab === 'materials' ? (
            <MaterialsTab analysis={analysis} busy={busy} onConfirm={confirm} />
          ) : tab === 'dimensions' ? (
            <DimensionsTab analysis={analysis} busy={busy} onConfirm={confirm} />
          ) : tab === 'preflight' ? (
            <PreflightTab
              analysis={analysis}
              busy={busy}
              onResolve={(issue, resolved) =>
                act(() =>
                  api.resolveIssue(version.id, issue.id, { resolved, actorName: 'Susan (Prepress)' }),
                )
              }
            />
          ) : tab === 'approval' ? (
            <ApprovalTab data={data} busy={busy} act={act} onNavigate={navigate} />
          ) : (
            <RawTab analysis={analysis} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

function AttrRow({
  attr,
  busy,
  onConfirm,
}: {
  attr: DetectedAttribute;
  busy: boolean;
  onConfirm: (t: string, id: string, a: 'confirm' | 'edit' | 'reject', v?: string) => void;
}) {
  return (
    <>
      <dt>{attr.label}</dt>
      <dd>
        <div className="field-row">
          <div style={{ minWidth: 0 }}>
            <div className="flex flex-wrap" style={{ gap: 6 }}>
              <span>{attr.normalizedValue ?? <em className="muted">Not found</em>}</span>
              <StatusBadge status={attr.status} />
            </div>
            <span className="meta">
              <SourceTag source={attr.source} confidence={attr.confidence} />
            </span>
            {attr.rawValue && attr.rawValue !== attr.normalizedValue ? (
              <span className="meta">Raw: {attr.rawValue}</span>
            ) : null}
            {attr.warning ? <span className="meta" style={{ color: 'var(--warn)' }}>⚠ {attr.warning}</span> : null}
            {attr.confirmedBy ? <span className="meta">Confirmed by {attr.confirmedBy}</span> : null}
          </div>
          <ConfirmControls
            value={attr.normalizedValue}
            status={attr.status}
            confirmedBy={attr.confirmedBy}
            busy={busy}
            onConfirm={() => onConfirm('attribute', attr.key, 'confirm')}
            onEdit={(v) => onConfirm('attribute', attr.key, 'edit', v)}
            onReject={() => onConfirm('attribute', attr.key, 'reject')}
          />
        </div>
      </dd>
    </>
  );
}

function SummaryTab({
  data,
  busy,
  onConfirm,
}: {
  data: VersionPayload;
  busy: boolean;
  onConfirm: (t: string, id: string, a: 'confirm' | 'edit' | 'reject', v?: string) => void;
}) {
  const { analysis, version, job, asset } = data;
  if (!analysis) return null;
  const a = (key: string) => analysis.attributes.find((x) => x.key === key);
  const d = (key: string) => analysis.dimensions.find((x) => x.key === key);
  const m = (key: string) => analysis.materials.find((x) => x.key === key);

  const finishedW = d('finished_width');
  const finishedH = d('finished_height');
  const blocking = analysis.preflight.filter((p) => p.severity === 'blocking' && !p.resolved);
  const needsReview = [
    ...analysis.attributes.filter((x) => x.status === 'needs_review'),
    ...analysis.materials.filter((x) => x.status === 'needs_review'),
    ...analysis.dimensions.filter((x) => x.status === 'needs_review'),
    ...analysis.channels.filter((x) => x.status === 'needs_review'),
  ];

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className={`note ${blocking.length ? 'error' : version.prepress_reviewed_at ? 'ok' : ''}`}>
        {blocking.length ? (
          <>
            <strong>Not production ready.</strong> {blocking.length} blocking preflight issue
            {blocking.length === 1 ? '' : 's'} must be resolved.
          </>
        ) : version.prepress_reviewed_at ? (
          <>
            <strong>Prepress reviewed</strong> by {version.prepress_reviewed_by} on {fmtDate(version.prepress_reviewed_at)}.
            {needsReview.length ? ` ${needsReview.length} value(s) are still recorded as needing review.` : ''}
          </>
        ) : (
          <>
            No blocking issues were found, but this analysis is <strong>not production ready until a prepress user
            confirms it</strong>. {needsReview.length} value{needsReview.length === 1 ? '' : 's'} still need review.
          </>
        )}
      </div>

      <div className="section">
        <h3>Job</h3>
        <dl className="kv">
          <dt>Customer</dt>
          <dd>
            {job.job.customer}
            <span className="meta">Job {job.job.job_number}</span>
          </dd>
          {a('product_number') ? <AttrRow attr={a('product_number')!} busy={busy} onConfirm={onConfirm} /> : null}
          {a('artwork_title') ? <AttrRow attr={a('artwork_title')!} busy={busy} onConfirm={onConfirm} /> : null}
          {a('revision') ? <AttrRow attr={a('revision')!} busy={busy} onConfirm={onConfirm} /> : null}
          {a('version') ? <AttrRow attr={a('version')!} busy={busy} onConfirm={onConfirm} /> : null}
          {a('proof_date') ? <AttrRow attr={a('proof_date')!} busy={busy} onConfirm={onConfirm} /> : null}
          {a('initials') ? <AttrRow attr={a('initials')!} busy={busy} onConfirm={onConfirm} /> : null}
          {a('customer') ? <AttrRow attr={a('customer')!} busy={busy} onConfirm={onConfirm} /> : null}
        </dl>
      </div>

      <div className="section">
        <h3>File</h3>
        <dl className="kv">
          <dt>File name</dt>
          <dd>{analysis.file.fileName}</dd>
          <dt>File size</dt>
          <dd>{fmtBytes(analysis.file.fileSize)}</dd>
          <dt>Page count</dt>
          <dd>{analysis.file.pageCount}</dd>
          <dt>App version record</dt>
          <dd>
            Version {version.version_number} — {version.revision_label ?? 'Initial'}
            <span className="meta">Uploaded {fmtDate(asset?.uploadedAt)} by {asset?.uploadedBy}</span>
          </dd>
          <dt>SHA-256</dt>
          <dd className="mono" style={{ fontWeight: 400, wordBreak: 'break-all' }}>
            {analysis.file.sha256}
          </dd>
        </dl>
      </div>

      <div className="section">
        <h3>Production</h3>
        <dl className="kv">
          <dt>Finished dimensions</dt>
          <dd>
            {finishedW?.valueIn && finishedH?.valueIn ? (
              <>
                {finishedW.valueIn}" × {finishedH.valueIn}"
                <span className="meta">
                  <SourceTag source={finishedW.source} confidence={finishedW.confidence} />
                </span>
              </>
            ) : (
              <em className="muted">Not established</em>
            )}
          </dd>
          {a('printing_method') ? <AttrRow attr={a('printing_method')!} busy={busy} onConfirm={onConfirm} /> : null}
          {a('process_print_system') ? (
            <AttrRow attr={a('process_print_system')!} busy={busy} onConfirm={onConfirm} />
          ) : null}
          <dt>Print orientation</dt>
          <dd>
            {m('print_orientation')?.normalizedValue ?? '—'}
            <span className="meta">
              <SourceTag
                source={m('print_orientation')?.source ?? 'derived'}
                confidence={m('print_orientation')?.confidence ?? 0}
              />
            </span>
          </dd>
          <dt>Substrate</dt>
          <dd>
            {m('substrate_color')?.normalizedValue ?? '—'}
            <span className="meta">
              Material: {m('substrate_material')?.normalizedValue ?? 'Not specified'}
            </span>
          </dd>
          <dt>Rewind direction</dt>
          <dd>
            {d('rewind')?.rawValue ?? <em className="muted">Not stated</em>}
            <span className="meta">{d('dispensing_direction')?.rawValue ?? 'Dispensing direction not stated'}</span>
          </dd>
          <dt>Eyemark</dt>
          <dd>
            Size {d('eyemark_size')?.rawValue ?? '—'} · Location {d('eyemark_location')?.rawValue ?? '—'} · Frequency{' '}
            {d('eyemark_frequency')?.rawValue ?? '—'}
          </dd>
        </dl>
      </div>

      <div className="section">
        <h3>Status</h3>
        <dl className="kv">
          <dt>Overall analysis</dt>
          <dd>
            <Badge status="detected">Complete</Badge>
            <span className="meta">
              Analyzer {analysis.analyzerVersion} · {analysis.durationMs} ms · {fmtDate(analysis.finishedAt)}
            </span>
          </dd>
          <dt>Prepress review</dt>
          <dd>
            {version.prepress_reviewed_at ? (
              <>
                <Badge status="prepress_reviewed">Reviewed</Badge>
                <span className="meta">
                  {version.prepress_reviewed_by} · {fmtDate(version.prepress_reviewed_at)}
                </span>
              </>
            ) : (
              <Badge status="needs_prepress_review">Not yet reviewed</Badge>
            )}
          </dd>
          <dt>Approval</dt>
          <dd>
            <Badge status={version.status}>{JOB_STATUS_LABELS[version.status] ?? version.status}</Badge>
          </dd>
        </dl>
      </div>

      {analysis.warnings.length ? (
        <div className="note warn">
          <strong>Analyzer notes</strong>
          <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
            {analysis.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Colors                                                              */
/* ------------------------------------------------------------------ */

function ColorsTab({
  analysis,
  busy,
  onConfirm,
}: {
  analysis: AnalysisResult;
  busy: boolean;
  onConfirm: (t: string, id: string, a: 'confirm' | 'edit' | 'reject', v?: string) => void;
}) {
  const s = analysis.normalizedSummary;
  const sepFor = (c: ColorChannel) => analysis.separations.find((x) => x.channelId === c.id);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="section">
        <h3>Normalized production interpretation</h3>
        <dl className="kv">
          <dt>Printing method</dt>
          <dd>{s.printingMethod ?? <em className="muted">Not established</em>}</dd>
          <dt>Process print system</dt>
          <dd>{s.processPrintSystem ?? <em className="muted">Not established</em>}</dd>
          <dt>Physical press stations</dt>
          <dd>
            {s.pressStationCount ?? '—'}
            <span className="meta">Counts inks that occupy a station on press.</span>
          </dd>
          <dt>Digital match-color targets</dt>
          <dd>
            {s.digitalMatchTargets.length ? s.digitalMatchTargets.join(', ') : <em className="muted">None</em>}
            {s.digitalMatchTargets.length ? (
              <span className="meta">Matched by the process set — not separate press stations.</span>
            ) : null}
          </dd>
          <dt>Spot ink plates</dt>
          <dd>{s.spotInkPlates.length ? s.spotInkPlates.join(', ') : <em className="muted">None</em>}</dd>
          <dt>Structural layers</dt>
          <dd>{s.structuralLayers.length ? s.structuralLayers.join(', ') : <em className="muted">None</em>}</dd>
          <dt>Separate white-ink layer</dt>
          <dd>{s.whiteInkLayer}</dd>
          <dt>Separate varnish layer</dt>
          <dd>{s.varnishLayer}</dd>
          <dt>Foil layer</dt>
          <dd>{s.foilLayer}</dd>
          <dt>Emboss / deboss layer</dt>
          <dd>{s.embossLayer}</dd>
          <dt>Proof-only content</dt>
          <dd>{s.proofOnlyContent.length ? s.proofOnlyContent.join(', ') : <em className="muted">None</em>}</dd>
        </dl>
      </div>

      <div className="section">
        <h3>Normalized separations</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Channel</th>
                <th>Type / role</th>
                <th>Alternate</th>
                <th>Used</th>
                <th>Source</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {analysis.channels.map((c) => {
                const sep = sepFor(c);
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="flex">
                        <span className="swatch swatch-lg" style={{ background: c.swatchHex }} />
                        <div>
                          <div style={{ fontWeight: 700 }}>{c.channelName}</div>
                          <div className="small muted">{c.normalizedName}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-wrap" style={{ gap: 4 }}>
                        <span className="chip">{c.type}</span>
                        <span className={`badge ${c.isPressStation ? 'badge-red' : 'badge-neutral'}`}>
                          {ROLE_LABELS[c.role] ?? c.role}
                        </span>
                      </div>
                      {c.notes ? <div className="small muted" style={{ marginTop: 4 }}>{c.notes}</div> : null}
                      {c.warning ? (
                        <div className="small" style={{ color: 'var(--warn)', marginTop: 4 }}>
                          ⚠ {c.warning}
                        </div>
                      ) : null}
                      {sep ? (
                        <div className="small muted" style={{ marginTop: 4 }}>
                          Preview: {sep.method.replace(/_/g, ' ')} · {(sep.coverage * 100).toFixed(2)}% coverage
                        </div>
                      ) : null}
                    </td>
                    <td className="small mono">
                      {c.alternateCmyk
                        ? `C${Math.round(c.alternateCmyk[0] * 100)} M${Math.round(c.alternateCmyk[1] * 100)} Y${Math.round(
                            c.alternateCmyk[2] * 100,
                          )} K${Math.round(c.alternateCmyk[3] * 100)}`
                        : c.alternateRgb
                          ? `RGB ${c.alternateRgb.join(', ')}`
                          : '—'}
                    </td>
                    <td className="small">
                      {c.usedByArtwork ? (
                        <>
                          <span className="badge badge-ok">Yes</span>
                          <div className="muted" style={{ marginTop: 3 }}>
                            {c.usageCount} ops
                            {c.usedInGroups.length ? ` · ${c.usedInGroups.join(', ')}` : ''}
                          </div>
                        </>
                      ) : (
                        <span className="badge badge-warn">Unused</span>
                      )}
                    </td>
                    <td>
                      <SourceTag source={c.source} confidence={c.confidence} />
                      <div style={{ marginTop: 4 }}>
                        <StatusBadge status={c.status} />
                      </div>
                    </td>
                    <td>
                      <ConfirmControls
                        value={c.normalizedName}
                        status={c.status}
                        confirmedBy={c.confirmedBy}
                        busy={busy}
                        onConfirm={() => onConfirm('channel', c.id, 'confirm')}
                        onEdit={(v) => onConfirm('channel', c.id, 'edit', v)}
                        onReject={() => onConfirm('channel', c.id, 'reject')}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section">
        <h3>Raw detections</h3>
        <p className="small muted">Exactly what the PDF declares, before any production interpretation.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Channel name</th>
                <th>Colour space</th>
                <th>PDF resources</th>
                <th>Solid value at tint 1</th>
                <th>Paint ops</th>
              </tr>
            </thead>
            <tbody>
              {analysis.rawChannels.map((c) => (
                <tr key={c.channelName}>
                  <td>
                    <div className="flex">
                      <span className="swatch" style={{ background: c.swatchHex }} />
                      {c.channelName}
                    </div>
                  </td>
                  <td className="small">{c.colorSpaceFamily}</td>
                  <td className="small mono">{c.resourceKeys.map((k) => `/${k}`).join(', ')}</td>
                  <td className="small mono">
                    {c.alternateCmyk
                      ? c.alternateCmyk.map((v) => `${Math.round(v * 100)}%`).join(' / ')
                      : c.alternateRgb
                        ? c.alternateRgb.join(', ')
                        : '—'}
                  </td>
                  <td className="num">{c.usageCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section">
        <h3>Source groupings</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Group</th>
                <th>Classification</th>
                <th>Objects</th>
                <th>Source</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {analysis.layers.map((l) => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 600 }}>{l.name}</td>
                  <td>
                    <span className={`badge ${l.classification === 'production' ? 'badge-ok' : 'badge-neutral'}`}>
                      {l.classification.replace(/_/g, ' ')}
                    </span>
                    {l.notes ? <div className="small muted" style={{ marginTop: 4 }}>{l.notes}</div> : null}
                  </td>
                  <td className="num">{l.objectCount}</td>
                  <td>
                    <SourceTag source={l.source} confidence={l.confidence} />
                  </td>
                  <td>
                    <ConfirmControls
                      value={l.classification}
                      status={l.status}
                      confirmedBy={l.confirmedBy}
                      busy={busy}
                      onConfirm={() => onConfirm('layer', l.id, 'confirm')}
                      onEdit={(v) => onConfirm('layer', l.id, 'edit', v)}
                      onReject={() => onConfirm('layer', l.id, 'reject')}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!analysis.file.hasOptionalContentLayers ? (
          <div className="note" style={{ marginTop: 10 }}>
            This PDF contains no optional-content groups, so it has no layers a viewer can switch on and off. The
            groupings above are Illustrator marked-content blocks read from the content stream, and every separation
            image in the viewer is a <strong>generated preview</strong> — not an original editable Illustrator layer or
            an output plate.
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Materials, Dimensions                                               */
/* ------------------------------------------------------------------ */

function RecordTable({
  rows,
  targetType,
  busy,
  onConfirm,
  valueOf,
}: {
  rows: (MaterialFinish | DimensionRecord)[];
  targetType: string;
  busy: boolean;
  onConfirm: (t: string, id: string, a: 'confirm' | 'edit' | 'reject', v?: string) => void;
  valueOf: (r: MaterialFinish | DimensionRecord) => string | null;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Value</th>
            <th>Source</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ fontWeight: 600 }}>{r.label}</td>
              <td>
                <div>{valueOf(r) ?? <em className="muted">—</em>}</div>
                {'rawValue' in r && r.rawValue && r.rawValue !== valueOf(r) ? (
                  <div className="small muted">Raw: {r.rawValue}</div>
                ) : null}
                {r.warning ? (
                  <div className="small" style={{ color: 'var(--warn)', marginTop: 3 }}>
                    ⚠ {r.warning}
                  </div>
                ) : null}
                {r.confirmedBy ? <div className="small muted">Confirmed by {r.confirmedBy}</div> : null}
              </td>
              <td>
                <SourceTag source={r.source} confidence={r.confidence} />
                <div style={{ marginTop: 4 }}>
                  <StatusBadge status={r.status} />
                </div>
              </td>
              <td>
                <ConfirmControls
                  value={valueOf(r)}
                  status={r.status}
                  confirmedBy={r.confirmedBy}
                  busy={busy}
                  onConfirm={() => onConfirm(targetType, r.id, 'confirm')}
                  onEdit={(v) => onConfirm(targetType, r.id, 'edit', v)}
                  onReject={() => onConfirm(targetType, r.id, 'reject')}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MaterialsTab({
  analysis,
  busy,
  onConfirm,
}: {
  analysis: AnalysisResult;
  busy: boolean;
  onConfirm: (t: string, id: string, a: 'confirm' | 'edit' | 'reject', v?: string) => void;
}) {
  const groups: [string, string[]][] = [
    ['Substrate', ['substrate', 'adhesive', 'liner', 'laminate']],
    ['Finishes', ['varnish', 'white_ink', 'foil', 'emboss']],
    ['Construction', ['print_orientation', 'construction']],
  ];
  const review = analysis.materials.filter((m) => m.status === 'needs_review');

  return (
    <div className="stack" style={{ gap: 18 }}>
      {review.length ? (
        <div className="note warn">
          <strong>{review.length} material or finish value{review.length === 1 ? '' : 's'} need review.</strong>
          <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
            {review.map((m) => (
              <li key={m.id}>
                {m.label}: {m.warning}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="note ok">Every material and finish value has been established or confirmed.</div>
      )}
      {groups.map(([title, cats]) => {
        const rows = analysis.materials.filter((m) => cats.includes(m.category));
        if (!rows.length) return null;
        return (
          <div className="section" key={title}>
            <h3>{title}</h3>
            <RecordTable
              rows={rows}
              targetType="material"
              busy={busy}
              onConfirm={onConfirm}
              valueOf={(r) => (r as MaterialFinish).normalizedValue}
            />
          </div>
        );
      })}
    </div>
  );
}

function DimensionsTab({
  analysis,
  busy,
  onConfirm,
}: {
  analysis: AnalysisResult;
  busy: boolean;
  onConfirm: (t: string, id: string, a: 'confirm' | 'edit' | 'reject', v?: string) => void;
}) {
  const groups: [string, string[]][] = [
    ['Finished label', ['finished', 'dieline']],
    ['Proof page and PDF boxes', ['page', 'box', 'bleed']],
    ['Dispensing and eyemark', ['dispensing', 'eyemark']],
    ['Construction', ['construction']],
  ];
  const pageVsFinished = analysis.dimensions.find((d) => d.key === 'page_vs_finished');

  return (
    <div className="stack" style={{ gap: 18 }}>
      {pageVsFinished?.warning ? <div className="note warn">{pageVsFinished.warning}</div> : null}
      {groups.map(([title, cats]) => {
        const rows = analysis.dimensions.filter((d) => cats.includes(d.category));
        if (!rows.length) return null;
        return (
          <div className="section" key={title}>
            <h3>{title}</h3>
            <RecordTable
              rows={rows}
              targetType="dimension"
              busy={busy}
              onConfirm={onConfirm}
              valueOf={(r) => {
                const d = r as DimensionRecord;
                return d.valueIn !== null ? `${d.valueIn}"` : d.rawValue;
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Preflight                                                           */
/* ------------------------------------------------------------------ */

function PreflightTab({
  analysis,
  busy,
  onResolve,
}: {
  analysis: AnalysisResult;
  busy: boolean;
  onResolve: (issue: PreflightIssue, resolved: boolean) => void;
}) {
  const order: PreflightIssue['severity'][] = ['blocking', 'warning', 'info', 'pass'];
  const counts = Object.fromEntries(
    order.map((s) => [s, analysis.preflight.filter((p) => p.severity === s && !p.resolved).length]),
  ) as Record<PreflightIssue['severity'], number>;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="flex flex-wrap" style={{ gap: 8 }}>
        <span className="badge badge-blocked">{counts.blocking} blocking</span>
        <span className="badge badge-warn">{counts.warning} warning</span>
        <span className="badge badge-info">{counts.info} informational</span>
        <span className="badge badge-ok">{counts.pass} pass</span>
      </div>
      {counts.blocking > 0 ? (
        <div className="note error">
          This file is <strong>not production ready</strong>. Resolve every blocking issue, then mark the analysis
          prepress reviewed.
        </div>
      ) : (
        <div className="note">
          No unresolved blocking issues. Production readiness still requires a prepress user to confirm the analysis.
        </div>
      )}

      {order.map((sev) => {
        const rows = analysis.preflight.filter((p) => p.severity === sev);
        if (!rows.length) return null;
        return (
          <div className="section" key={sev}>
            <h3>{sev}</h3>
            {rows.map((p) => (
              <div key={p.id} className={`issue ${p.severity}${p.resolved ? ' resolved' : ''}`}>
                <div className="issue-head">
                  <span className="issue-title">{p.title}</span>
                  {p.resolved ? <span className="badge badge-ok">Resolved by {p.resolvedBy}</span> : null}
                  {sev !== 'pass' ? (
                    <button
                      className="btn btn-sm"
                      style={{ marginLeft: 'auto' }}
                      disabled={busy}
                      onClick={() => onResolve(p, !p.resolved)}
                    >
                      {p.resolved ? 'Reopen' : 'Mark resolved'}
                    </button>
                  ) : null}
                </div>
                <p>{p.detail}</p>
                {p.evidence ? <div className="evidence">{p.evidence}</div> : null}
                {p.recommendation ? (
                  <p className="small muted">
                    <strong>Recommended:</strong> {p.recommendation}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Approval                                                            */
/* ------------------------------------------------------------------ */

function ApprovalTab({
  data,
  busy,
  act,
  onNavigate,
}: {
  data: VersionPayload;
  busy: boolean;
  act: (fn: () => Promise<VersionPayload>, msg?: string) => Promise<void>;
  onNavigate: (to: string) => void;
}) {
  const { version, job, analysis, comments, approvals } = data;
  const [modal, setModal] = useState<null | 'send' | 'approve' | 'changes' | 'revision'>(null);
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [signature, setSignature] = useState('');
  const [signatureEmail, setSignatureEmail] = useState('');
  const [decisionComment, setDecisionComment] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [commentAudience, setCommentAudience] = useState<'internal' | 'customer'>('internal');
  const [commentPage, setCommentPage] = useState('');

  const blocking = analysis?.preflight.filter((p) => p.severity === 'blocking' && !p.resolved).length ?? 0;
  const reviewed = Boolean(version.prepress_reviewed_at);
  const status = version.status;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="section">
        <h3>Current state</h3>
        <dl className="kv">
          <dt>Version status</dt>
          <dd>
            <Badge status={status}>{JOB_STATUS_LABELS[status] ?? status}</Badge>
          </dd>
          <dt>Prepress review</dt>
          <dd>
            {reviewed ? (
              <>
                {version.prepress_reviewed_by}
                <span className="meta">{fmtDate(version.prepress_reviewed_at)}</span>
              </>
            ) : (
              <em className="muted">Not yet marked prepress reviewed</em>
            )}
          </dd>
          <dt>Blocking issues</dt>
          <dd>{blocking === 0 ? <span className="badge badge-ok">None</span> : <span className="badge badge-blocked">{blocking}</span>}</dd>
        </dl>
      </div>

      <div className="section">
        <h3>Actions</h3>
        <div className="btn-row">
          <button
            className="btn btn-navy"
            disabled={busy || reviewed || blocking > 0}
            title={blocking > 0 ? 'Resolve blocking preflight issues first' : undefined}
            onClick={() =>
              act(
                () => api.prepressReview(version.id, { actorName: 'Susan (Prepress)' }),
                'Analysis marked prepress reviewed.',
              )
            }
          >
            {reviewed ? 'Prepress reviewed ✓' : 'Mark Prepress Reviewed'}
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !reviewed || status !== 'prepress_reviewed'}
            onClick={() => setModal('send')}
            title={!reviewed ? 'Mark the analysis prepress reviewed first' : undefined}
          >
            Send for Customer Approval
          </button>
          <button className="btn" disabled={busy} onClick={() => setModal('revision')}>
            Upload Revision
          </button>
          <a className="btn" href={`/api/versions/${version.id}/report.html`} target="_blank" rel="noreferrer">
            Analysis report
          </a>
          <a className="btn" href={`/api/versions/${version.id}/export.json`}>
            Export JSON
          </a>
          <a className="btn" href={`/api/versions/${version.id}/export.csv`}>
            Export CSV
          </a>
        </div>
      </div>

      {status === 'sent_for_customer_review' ? (
        <div className="section">
          <h3>Customer decision</h3>
          <div className="note">
            This panel stands in for the customer-facing approval page so the full cycle can be exercised here.
          </div>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn btn-primary" disabled={busy} onClick={() => setModal('approve')}>
              Approve artwork
            </button>
            <button className="btn" disabled={busy} onClick={() => setModal('changes')}>
              Request changes
            </button>
          </div>
        </div>
      ) : null}

      <div className="section">
        <h3>Comments</h3>
        {comments.length === 0 ? (
          <p className="small muted">No comments on this version yet.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className={`comment ${c.audience}`}>
              <div className="comment-head">
                <strong style={{ color: 'var(--navy)' }}>{c.author_name}</strong>
                <span className="badge badge-neutral">{c.audience}</span>
                {c.page ? <span>page {c.page}</span> : null}
                <span style={{ marginLeft: 'auto' }}>{fmtDate(c.created_at)}</span>
              </div>
              <div>{c.body}</div>
            </div>
          ))
        )}
        <div className="stack" style={{ marginTop: 10 }}>
          <textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Add a comment…"
            aria-label="New comment"
          />
          <div className="flex flex-wrap" style={{ gap: 8 }}>
            <select
              value={commentAudience}
              onChange={(e) => setCommentAudience(e.target.value as 'internal' | 'customer')}
              style={{ width: 150 }}
              aria-label="Comment audience"
            >
              <option value="internal">Internal</option>
              <option value="customer">Customer</option>
            </select>
            <input
              value={commentPage}
              onChange={(e) => setCommentPage(e.target.value)}
              placeholder="Page (optional)"
              style={{ width: 140 }}
              aria-label="Page number"
            />
            <button
              className="btn btn-navy"
              disabled={busy || !commentBody.trim()}
              onClick={() =>
                act(
                  () =>
                    api.comment(version.id, {
                      body: commentBody,
                      audience: commentAudience,
                      page: commentPage ? Number(commentPage) : null,
                      actorName: commentAudience === 'customer' ? 'Customer' : 'Susan (Prepress)',
                      actorRole: commentAudience === 'customer' ? 'customer' : 'prepress',
                    }),
                  'Comment added.',
                ).then(() => {
                  setCommentBody('');
                  setCommentPage('');
                })
              }
            >
              Add comment
            </button>
          </div>
        </div>
      </div>

      <div className="section">
        <h3>Approvals</h3>
        {approvals.length === 0 ? (
          <p className="small muted">No approval decision has been recorded on this version.</p>
        ) : (
          approvals.map((a) => (
            <div key={a.id} className="issue info">
              <div className="issue-head">
                <span className="issue-title">{a.decision === 'approved' ? 'Approved' : 'Changes requested'}</span>
                <span className="small muted" style={{ marginLeft: 'auto' }}>
                  {fmtDate(a.decided_at)}
                </span>
              </div>
              <p>
                Signed: <strong>{a.signature_name}</strong>
                {a.signature_email ? ` <${a.signature_email}>` : ''}
              </p>
              {a.comment ? <p>{a.comment}</p> : null}
            </div>
          ))
        )}
      </div>

      <div className="section">
        <h3>Version history</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Version</th>
                <th>Label</th>
                <th>Status</th>
                <th>Uploaded</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {job.versions.map((v) => (
                <tr key={v.id}>
                  <td className="num">{v.version_number}</td>
                  <td>{v.revision_label ?? '—'}</td>
                  <td>
                    <Badge status={v.status}>{JOB_STATUS_LABELS[v.status] ?? v.status}</Badge>
                  </td>
                  <td className="small muted nowrap">{fmtDate(v.created_at)}</td>
                  <td className="right">
                    {v.id === version.id ? (
                      <span className="small muted">Viewing</span>
                    ) : (
                      <button className="btn btn-sm" onClick={() => onNavigate(`/workspace/${v.id}`)}>
                        Open
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section">
        <h3>Notification history</h3>
        {job.notifications.length === 0 ? (
          <p className="small muted">No notifications have been sent for this job.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sent</th>
                  <th>Kind</th>
                  <th>Recipient</th>
                  <th>Subject</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {job.notifications.map((n) => (
                  <tr key={n.id}>
                    <td className="small muted nowrap">{fmtDate(n.created_at)}</td>
                    <td className="small">
                      {n.kind.replace(/_/g, ' ')}
                      {n.is_resend ? <span className="badge badge-neutral" style={{ marginLeft: 4 }}>resend</span> : null}
                    </td>
                    <td className="small">{n.recipient}</td>
                    <td className="small">{n.subject}</td>
                    <td className="right">
                      <button
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() =>
                          api
                            .resendNotification(n.id, { actorName: 'Susan (Prepress)' })
                            .then(() => act(() => api.version(version.id), 'Notification resent.'))
                        }
                      >
                        Resend
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="section">
        <h3>Audit trail</h3>
        <ul className="timeline">
          {job.events.map((e) => (
            <li key={e.id}>
              <div className="when">{fmtDate(e.created_at)}</div>
              <div className="what">
                {e.from_status ? `${JOB_STATUS_LABELS[e.from_status] ?? e.from_status} → ` : ''}
                {JOB_STATUS_LABELS[e.to_status] ?? e.to_status}
              </div>
              <div className="detail">
                {e.actor} ({e.actor_role}){e.detail ? ` — ${e.detail}` : ''}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {modal === 'send' ? (
        <Modal
          title="Send for customer approval"
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={busy || !recipient.trim()}
                onClick={() =>
                  act(
                    () =>
                      api.sendForReview(version.id, {
                        recipient,
                        message,
                        actorName: 'Susan (Prepress)',
                      }),
                    `Sent to ${recipient}.`,
                  ).then(() => setModal(null))
                }
              >
                Send
              </button>
            </>
          }
        >
          <div>
            <label htmlFor="recipient">Customer contact</label>
            <input
              id="recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="name@customer.example"
            />
          </div>
          <div>
            <label htmlFor="msg">Message</label>
            <textarea id="msg" value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <div className="note">
            The notification is recorded in this application's notification history. No email leaves this machine.
          </div>
        </Modal>
      ) : null}

      {modal === 'approve' || modal === 'changes' ? (
        <Modal
          title={modal === 'approve' ? 'Approve artwork' : 'Request changes'}
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={busy || !signature.trim() || (modal === 'changes' && !decisionComment.trim())}
                onClick={() =>
                  act(
                    () =>
                      modal === 'approve'
                        ? api.approve(version.id, {
                            signatureName: signature,
                            signatureEmail,
                            comment: decisionComment,
                          })
                        : api.requestChanges(version.id, {
                            signatureName: signature,
                            signatureEmail,
                            comment: decisionComment,
                          }),
                    modal === 'approve' ? 'Artwork approved.' : 'Changes requested.',
                  ).then(() => setModal(null))
                }
              >
                {modal === 'approve' ? 'Approve' : 'Request changes'}
              </button>
            </>
          }
        >
          <div>
            <label htmlFor="sig">Approval signature (name)</label>
            <input id="sig" value={signature} onChange={(e) => setSignature(e.target.value)} />
          </div>
          <div>
            <label htmlFor="sigmail">Email (optional)</label>
            <input id="sigmail" value={signatureEmail} onChange={(e) => setSignatureEmail(e.target.value)} />
          </div>
          <div>
            <label htmlFor="dcom">{modal === 'approve' ? 'Comment (optional)' : 'What needs to change?'}</label>
            <textarea id="dcom" value={decisionComment} onChange={(e) => setDecisionComment(e.target.value)} />
          </div>
        </Modal>
      ) : null}

      {modal === 'revision' ? (
        <Modal title="Upload revision" onClose={() => setModal(null)}>
          <div className="note">
            A revision creates a new immutable version. The current version, its analysis, comments and approvals are
            kept and marked superseded.
          </div>
          <NewAnalysis
            jobId={job.job.id}
            onDone={(newVersionId) => {
              setModal(null);
              onNavigate(`/workspace/${newVersionId}`);
            }}
          />
        </Modal>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Raw data                                                            */
/* ------------------------------------------------------------------ */

function RawTab({ analysis }: { analysis: AnalysisResult }) {
  const raw = analysis.rawFileData as Record<string, unknown>;
  const sections: [string, unknown][] = [
    ['Document information dictionary', raw.info],
    ['Page boxes', raw.pageBoxes],
    ['Colour space resources', raw.colorSpaceResources],
    ['Marked-content properties (Illustrator groups)', raw.markedContentProperties],
    ['Font resources', raw.fontResources],
    ['XObject resources', raw.xObjectResources],
    ['ExtGState resources', raw.extGStateResources],
    ['Optional content properties', raw.optionalContentProperties],
    ['Content stream statistics', raw.contentStreamStats],
  ];
  const [open, setOpen] = useState<string>('Document information dictionary');

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="section">
        <h3>File characteristics</h3>
        <dl className="kv">
          <dt>PDF version</dt>
          <dd>{analysis.file.pdfVersion ?? '—'}</dd>
          <dt>Creator</dt>
          <dd>{analysis.file.creator ?? '—'}</dd>
          <dt>Producer</dt>
          <dd>{analysis.file.producer ?? '—'}</dd>
          <dt>Created / modified</dt>
          <dd>
            {analysis.file.creationDate ?? '—'}
            <span className="meta">{analysis.file.modificationDate ?? '—'}</span>
          </dd>
          <dt>Built in Illustrator</dt>
          <dd>
            {analysis.file.createdInIllustrator ? `Yes — ${analysis.file.illustratorVersion ?? 'version unknown'}` : 'No'}
          </dd>
          <dt>Esko metadata</dt>
          <dd>{analysis.file.hasEskoMetadata ? 'Present' : 'Not present'}</dd>
          <dt>Optional content layers</dt>
          <dd>{analysis.file.hasOptionalContentLayers ? 'Present' : 'None — separation previews are generated'}</dd>
          <dt>Artwork composition</dt>
          <dd>
            {analysis.file.primarilyVector ? 'Primarily vector' : 'Contains substantial raster content'}
            <span className="meta">
              {analysis.file.vectorOperationCount} path ops · {analysis.file.textOperationCount} text ops ·{' '}
              {analysis.file.imageOperationCount} image placements
            </span>
          </dd>
          <dt>Transparency</dt>
          <dd>{analysis.file.hasTransparency ? 'Live transparency present' : 'None'}</dd>
        </dl>
      </div>

      <div className="section">
        <h3>Fonts</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Resource</th>
                <th>Base font</th>
                <th>Type</th>
                <th>Embedded</th>
                <th>Encoding</th>
              </tr>
            </thead>
            <tbody>
              {analysis.file.fonts.map((f) => (
                <tr key={f.resourceKey + f.baseFont}>
                  <td className="mono">/{f.resourceKey}</td>
                  <td>
                    {f.baseFont}
                    {f.subset ? <span className="badge badge-neutral" style={{ marginLeft: 6 }}>subset</span> : null}
                  </td>
                  <td className="small">{f.subtype}</td>
                  <td>
                    <span className={`badge ${f.embedded ? 'badge-ok' : 'badge-blocked'}`}>
                      {f.embedded ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="small">{f.encoding ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {analysis.file.images.length ? (
        <div className="section">
          <h3>Placed images</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Pixels</th>
                  <th>Colour space</th>
                  <th>Filter</th>
                  <th>Effective PPI</th>
                </tr>
              </thead>
              <tbody>
                {analysis.file.images.map((i) => (
                  <tr key={i.resourceKey}>
                    <td className="mono">/{i.resourceKey}</td>
                    <td className="small">
                      {i.width} × {i.height}
                    </td>
                    <td className="small">{i.colorSpace}</td>
                    <td className="small">{i.filter}</td>
                    <td className="small">
                      {i.effectivePpiX !== null ? `${i.effectivePpiX} × ${i.effectivePpiY}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="section">
        <h3>PDF objects</h3>
        <div className="flex flex-wrap" style={{ gap: 6, marginBottom: 10 }}>
          {sections.map(([name]) => (
            <button
              key={name}
              className={`btn btn-sm${open === name ? ' btn-navy' : ''}`}
              onClick={() => setOpen(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <pre className="raw">{JSON.stringify(sections.find(([n]) => n === open)?.[1] ?? null, null, 2)}</pre>
      </div>

      <div className="section">
        <h3>Extracted text lines</h3>
        <pre className="raw">
          {(raw.textLines as { page: number; x: number; y: number; text: string; group: string | null }[])
            .map((l) => `p${l.page} y=${l.y.toFixed(1).padStart(7)} x=${l.x.toFixed(1).padStart(7)} [${l.group ?? '-'}] ${l.text}`)
            .join('\n')}
        </pre>
      </div>

      <div className="section">
        <h3>XMP metadata</h3>
        <pre className="raw">{(raw.xmpExcerpt as string) ?? 'No XMP packet in this file.'}</pre>
      </div>
    </div>
  );
}
