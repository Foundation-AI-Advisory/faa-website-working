import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmtBytes, type AnalysisResult } from '../api';
import { ErrorNote, Spinner } from '../components/ui';

type Phase = 'idle' | 'uploading' | 'analyzing' | 'failed';

const MAX_BYTES = 100 * 1024 * 1024;

export function NewAnalysis({ jobId, onDone }: { jobId?: string; onDone?: (versionId: string) => void } = {}) {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [customer, setCustomer] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [over, setOver] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [stages, setStages] = useState<AnalysisResult['stages']>([]);
  const [versionId, setVersionId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const accept = (f: File | null | undefined) => {
    setError(null);
    if (!f) return;
    if (!/\.pdf$/i.test(f.name)) {
      setError(`"${f.name}" is not a PDF. The analyzer reads PDF objects directly, so only PDF proofs can be processed.`);
      return;
    }
    if (f.size === 0) {
      setError('That file is empty.');
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`"${f.name}" is ${fmtBytes(f.size)}, over the 100 MB limit.`);
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.pdf$/i, ''));
  };

  const submit = async () => {
    if (!file) {
      setError('Choose a PDF proof first.');
      return;
    }
    setPhase('uploading');
    setError(null);
    const form = new FormData();
    form.append('file', file);
    form.append('customer', customer);
    form.append('title', title);
    form.append('notes', notes);
    form.append('actorName', 'Susan (Prepress)');
    try {
      const res = jobId ? await api.uploadRevision(jobId, form) : await api.upload(form);
      setVersionId(res.versionId);
      setPhase('analyzing');
    } catch (e) {
      setError((e as Error).message);
      setPhase('failed');
    }
  };

  // Poll the analysis run so the progress screen shows real stages.
  useEffect(() => {
    if (phase !== 'analyzing' || !versionId) return;
    let alive = true;
    const timer = setInterval(async () => {
      try {
        const v = await api.version(versionId);
        if (!alive) return;
        if (v.run) setStages(v.run.stages);
        if (v.run?.state === 'complete') {
          clearInterval(timer);
          if (onDone) onDone(versionId);
          else navigate(`/workspace/${versionId}`);
        }
        if (v.run?.state === 'failed') {
          clearInterval(timer);
          setError(v.run.error ?? 'The analyzer failed on this file.');
          setPhase('failed');
        }
      } catch (e) {
        clearInterval(timer);
        if (!alive) return;
        setError((e as Error).message);
        setPhase('failed');
      }
    }, 700);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [phase, versionId, navigate, onDone]);

  if (phase === 'analyzing') {
    return (
      <div className="card" style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="card-head">
          <h2>Analyzing artwork</h2>
          <Spinner dark />
        </div>
        <div className="card-body">
          <p className="small muted">
            Deterministic PDF inspection is running on <strong>{file?.name}</strong>. Nothing is sent to an external
            service.
          </p>
          <ul className="stage-list">
            {stages.length === 0 ? (
              <li>
                <span className="stage-dot running" /> Starting analysis…
              </li>
            ) : (
              stages.map((s) => (
                <li key={s.key}>
                  <span className={`stage-dot ${s.status}`} />
                  <span>{s.label}</span>
                  {s.ms ? <span className="stage-ms">{s.ms} ms</span> : null}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 720, margin: '0 auto', gap: 16 }}>
      <ErrorNote error={error} />

      <div
        className={`dropzone${over ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          accept(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
      >
        <h3>{file ? file.name : 'Drop a customer artwork proof here'}</h3>
        <p>
          {file
            ? `${fmtBytes(file.size)} — ready to analyze`
            : 'PDF only, up to 100 MB. Or click to choose a file.'}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => accept(e.target.files?.[0])}
        />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>{jobId ? 'Revision details' : 'Job details'}</h2>
        </div>
        <div className="card-body stack">
          {!jobId ? (
            <>
              <div>
                <label htmlFor="customer">Customer</label>
                <input
                  id="customer"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  placeholder="Leave blank to use the customer detected on the proof"
                />
              </div>
              <div>
                <label htmlFor="title">Artwork title</label>
                <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="From the file name" />
              </div>
            </>
          ) : null}
          <div>
            <label htmlFor="notes">Notes (optional)</label>
            <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="note">
            The uploaded PDF is stored unchanged as the immutable original for this version. A revision never overwrites
            an earlier file, analysis, comment or approval.
          </div>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={submit} disabled={!file || phase === 'uploading'}>
              {phase === 'uploading' ? (
                <>
                  <Spinner /> Uploading…
                </>
              ) : jobId ? (
                'Upload revision'
              ) : (
                'Analyze New Artwork'
              )}
            </button>
            {file ? (
              <button className="btn" onClick={() => setFile(null)} disabled={phase === 'uploading'}>
                Clear file
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
