import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { AnalysisResult, ColorChannel } from '../api';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type BaseView = { key: string; label: string; file: string | null; description: string };

export interface ProofViewerProps {
  pdfUrl: string;
  downloadUrl: string;
  analysis: AnalysisResult | null;
  channels: ColorChannel[];
}

const FIT = -1;

export function ProofViewer({ pdfUrl, downloadUrl, analysis, channels }: ProofViewerProps) {
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<number>(FIT);
  const [renderedScale, setRenderedScale] = useState(1);
  const [pageSize, setPageSize] = useState<{ w: number; h: number }>({ w: 612, h: 792 });
  const [baseKey, setBaseKey] = useState('composite');
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [isolated, setIsolated] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const renderTask = useRef<pdfjs.RenderTask | null>(null);

  /* ---------------- document ---------------- */

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const task = pdfjs.getDocument({ url: pdfUrl, isEvalSupported: false });
    task.promise.then(
      (d) => {
        if (cancelled) {
          d.destroy();
          return;
        }
        setDoc(d);
        setPage(1);
        setLoading(false);
      },
      (err: Error) => {
        if (cancelled) return;
        setError(`The PDF could not be opened for display: ${err.message}`);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
      task.destroy().catch(() => undefined);
    };
  }, [pdfUrl]);

  /* ---------------- views ---------------- */

  const baseViews: BaseView[] = useMemo(() => {
    const views: BaseView[] = [
      {
        key: 'composite',
        label: 'Original composite (live PDF)',
        file: null,
        description: 'The supplied PDF rendered live in the browser.',
      },
    ];
    if (!analysis) return views;
    for (const v of analysis.views) {
      const [kind, ...rest] = v.key.split(':');
      const pageNo = Number(rest[rest.length - 1]);
      if (pageNo !== page) continue;
      if (kind === 'composite') continue;
      views.push({ key: v.key, label: v.label.replace(/ — page \d+$/, ''), file: v.file, description: v.description });
    }
    views.push({
      key: 'separations',
      label: 'Separations on white',
      file: null,
      description: 'Only the separation previews you switch on, composited on white.',
    });
    return views;
  }, [analysis, page]);

  useEffect(() => {
    if (!baseViews.some((v) => v.key === baseKey)) setBaseKey('composite');
  }, [baseViews, baseKey]);

  const separationsByChannel = useMemo(() => {
    const map = new Map<string, { file: string; method: string; coverage: number; note: string }>();
    for (const s of analysis?.separations ?? []) {
      map.set(s.channelId, { file: s.file, method: s.method, coverage: s.coverage, note: s.note });
    }
    return map;
  }, [analysis]);

  const toggleable = channels.filter((c) => separationsByChannel.has(c.id));

  const isSeparationBase = baseKey === 'separations';
  // Isolating a separation hides the artwork behind it — the point is to see that
  // ink on its own, the way a plate would look.
  const solo = isolated !== null || isSeparationBase;
  const activeChannels = toggleable.filter((c) => (isolated ? c.id === isolated : (visible[c.id] ?? isSeparationBase)));

  /* ---------------- rendering ---------------- */

  const fitScale = useCallback(
    (w: number, h: number) => {
      const stage = stageRef.current;
      if (!stage) return 1;
      const availW = stage.clientWidth - 40;
      const availH = stage.clientHeight - 40;
      if (availW <= 0 || availH <= 0) return 1;
      return Math.max(0.1, Math.min(availW / w, availH / h));
    },
    [],
  );

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await doc.getPage(page);
        if (cancelled) return;
        const base = p.getViewport({ scale: 1 });
        setPageSize({ w: base.width, h: base.height });
        const scale = zoom === FIT ? fitScale(base.width, base.height) : zoom;
        setRenderedScale(scale);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = p.getViewport({ scale: scale * dpr });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        renderTask.current?.cancel();
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        const task = p.render({ canvasContext: ctx, viewport });
        renderTask.current = task;
        await task.promise;
      } catch (err) {
        const e = err as Error & { name?: string };
        if (!cancelled && e.name !== 'RenderingCancelledException') {
          setError(`Page ${page} could not be rendered: ${e.message}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, page, zoom, fitScale]);

  // Re-fit when the pane resizes.
  useEffect(() => {
    if (zoom !== FIT) return;
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setRenderedScale(fitScale(pageSize.w, pageSize.h)));
    ro.observe(stage);
    return () => ro.disconnect();
  }, [zoom, pageSize, fitScale]);

  /* ---------------- pan ---------------- */

  const panState = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const onMouseDown = (e: React.MouseEvent) => {
    const stage = stageRef.current;
    if (!stage) return;
    panState.current = { x: e.clientX, y: e.clientY, left: stage.scrollLeft, top: stage.scrollTop };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const stage = stageRef.current;
    const start = panState.current;
    if (!stage || !start) return;
    stage.scrollLeft = start.left - (e.clientX - start.x);
    stage.scrollTop = start.top - (e.clientY - start.y);
  };
  const endPan = () => {
    panState.current = null;
  };

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!fullscreen) return;
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const currentBase = baseViews.find((v) => v.key === baseKey) ?? baseViews[0];
  const displayW = pageSize.w * renderedScale;
  const displayH = pageSize.h * renderedScale;
  const pageCount = doc?.numPages ?? analysis?.file.pageCount ?? 1;

  const body = (
    <div className={`viewer-pane${fullscreen ? ' fullscreen' : ''}`}>
      <div className="viewer-toolbar">
        <button className="tool" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
          ‹ Prev
        </button>
        <span className="zoom">
          {page} / {pageCount}
        </span>
        <button className="tool" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>
          Next ›
        </button>
        <span className="sep" />
        <button className="tool" onClick={() => setZoom((z) => Math.max(0.15, (z === FIT ? renderedScale : z) - 0.2))}>
          −
        </button>
        <span className="zoom">{Math.round(renderedScale * 100)}%</span>
        <button className="tool" onClick={() => setZoom((z) => Math.min(6, (z === FIT ? renderedScale : z) + 0.2))}>
          +
        </button>
        <button className={`tool${zoom === FIT ? ' active' : ''}`} onClick={() => setZoom(FIT)}>
          Fit
        </button>
        <button className="tool" onClick={() => setZoom(1)}>
          100%
        </button>
        <span className="sep" />
        <select
          value={baseKey}
          onChange={(e) => {
            // Choosing a base view is a request to look at that view, so any
            // active isolation is cleared rather than silently overriding it.
            setIsolated(null);
            setBaseKey(e.target.value);
          }}
          aria-label="View mode"
        >
          {baseViews.map((v) => (
            <option key={v.key} value={v.key}>
              {v.label}
            </option>
          ))}
        </select>
        <span className="sep" />
        <button
          className={`tool${isolated ? ' active' : ''}`}
          onClick={() => setIsolated(null)}
          disabled={!isolated}
          title="Clear isolation"
        >
          {isolated ? 'Clear isolate' : 'No isolate'}
        </button>
        <button
          className="tool"
          onClick={() => {
            setVisible({});
            setIsolated(null);
          }}
        >
          Reset overlays
        </button>
        <span className="sep" />
        <button className="tool" onClick={() => setFullscreen((f) => !f)}>
          {fullscreen ? 'Exit full screen' : 'Full screen'}
        </button>
        <a className="tool" href={downloadUrl} download style={{ textDecoration: 'none' }}>
          Download original
        </a>
      </div>

      <div
        className="viewer-stage"
        ref={stageRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endPan}
        onMouseLeave={endPan}
        style={{ cursor: panState.current ? 'grabbing' : 'grab' }}
      >
        {error ? (
          <div className="note error" style={{ maxWidth: 520, alignSelf: 'center' }}>
            {error}
          </div>
        ) : loading ? (
          <div style={{ color: '#cfdbe6', alignSelf: 'center' }} className="flex">
            <span className="spinner" /> Loading proof…
          </div>
        ) : (
          <div className="page-stack" style={{ width: displayW, height: displayH }}>
            <canvas
              ref={canvasRef}
              className="base"
              style={{
                width: displayW,
                height: displayH,
                visibility: currentBase.key === 'composite' && !solo ? 'visible' : 'hidden',
              }}
            />
            {currentBase.file && !solo ? (
              <img className="base" src={currentBase.file} alt={currentBase.label} style={{ width: displayW, height: displayH }} />
            ) : null}
            {solo ? <div style={{ position: 'absolute', inset: 0, background: '#fff' }} /> : null}
            {activeChannels.map((c) => {
              const sep = separationsByChannel.get(c.id)!;
              return (
                <img
                  key={c.id}
                  className="overlay"
                  src={sep.file}
                  alt={`${c.channelName} separation preview`}
                  style={{ width: displayW, height: displayH, mixBlendMode: solo ? 'normal' : 'multiply' }}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="legend">
        <strong style={{ color: '#fff', fontSize: 12 }}>Separations</strong>
        {toggleable.length === 0 ? (
          <span className="small">No separation previews were generated for this page.</span>
        ) : (
          toggleable.map((c) => {
            const on = isolated ? c.id === isolated : (visible[c.id] ?? isSeparationBase);
            const sep = separationsByChannel.get(c.id)!;
            return (
              <span key={c.id} className={`legend-item${on ? ' on' : ''}`}>
                <span className="swatch" style={{ background: c.swatchHex }} />
                <button
                  type="button"
                  className="legend-name"
                  onClick={() => {
                    setIsolated(null);
                    setVisible((v) => ({ ...v, [c.id]: !on }));
                  }}
                  title={`${on ? 'Hide' : 'Overlay'} ${c.channelName}. ${sep.note} Coverage ${(sep.coverage * 100).toFixed(2)}% of the page.`}
                >
                  {on ? '☑' : '☐'} {c.channelName}
                </button>
                <button
                  type="button"
                  className={`legend-solo${isolated === c.id ? ' active' : ''}`}
                  onClick={() => setIsolated(isolated === c.id ? null : c.id)}
                  title={`Isolate ${c.channelName} — show this separation alone on white`}
                >
                  Isolate
                </button>
              </span>
            );
          })
        )}
        <span className="small" style={{ marginLeft: 'auto', color: '#93a7bd' }}>
          {solo ? 'Isolated view on white' : 'Overlay onto the proof'} · generated previews, not original Illustrator
          layers
        </span>
      </div>
    </div>
  );

  return fullscreen ? body : body;
}
