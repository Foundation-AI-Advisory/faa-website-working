import { type ReactNode, useEffect, useState } from 'react';
import { SOURCE_LABELS, STATUS_LABELS, statusBadgeClass, type ConfirmationStatus } from '../api';

export function Badge({ status, children }: { status: string; children?: ReactNode }) {
  return <span className={`badge ${statusBadgeClass(status)}`}>{children ?? status}</span>;
}

export function StatusBadge({ status }: { status: ConfirmationStatus }) {
  return <span className={`badge ${statusBadgeClass(status)}`}>{STATUS_LABELS[status] ?? status}</span>;
}

export function SourceTag({ source, confidence }: { source: string; confidence: number }) {
  const pct = Math.round(confidence * 100);
  return (
    <span className="flex small muted" style={{ gap: 6 }}>
      <span>{SOURCE_LABELS[source] ?? source}</span>
      <span className={`meter ${confidence < 0.6 ? 'low' : ''}`} title={`Confidence ${pct}%`}>
        <span style={{ width: `${Math.max(3, pct)}%` }} />
      </span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
    </span>
  );
}

export function Spinner({ dark = false }: { dark?: boolean }) {
  return <span className={`spinner${dark ? ' dark' : ''}`} aria-label="Loading" />;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <div className="small">{children}</div>
    </div>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="note error" role="alert">
      {error}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn btn-sm" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Inline confirm / edit control used on every detected value. */
export function ConfirmControls({
  value,
  status,
  confirmedBy,
  busy,
  onConfirm,
  onEdit,
  onReject,
}: {
  value: string | null;
  status: ConfirmationStatus;
  confirmedBy?: string | null;
  busy: boolean;
  onConfirm: () => void;
  onEdit: (next: string) => void;
  onReject: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  if (editing) {
    return (
      <div className="flex" style={{ gap: 4, marginTop: 4 }}>
        <input
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onEdit(draft);
              setEditing(false);
            }
            if (e.key === 'Escape') setEditing(false);
          }}
          aria-label="Corrected value"
        />
        <button
          className="btn btn-sm btn-navy"
          disabled={busy}
          onClick={() => {
            onEdit(draft);
            setEditing(false);
          }}
        >
          Save
        </button>
        <button className="btn btn-sm" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="field-actions">
      {status !== 'confirmed' ? (
        <button className="btn btn-sm" disabled={busy} onClick={onConfirm} title="Confirm this value">
          Confirm
        </button>
      ) : (
        <span className="badge badge-ok" title={confirmedBy ? `Confirmed by ${confirmedBy}` : undefined}>
          Confirmed
        </span>
      )}
      <button className="btn btn-sm" disabled={busy} onClick={() => setEditing(true)} title="Correct this value">
        Edit
      </button>
      {status === 'confirmed' ? (
        <button className="btn btn-sm" disabled={busy} onClick={onReject} title="Reopen for review">
          Reopen
        </button>
      ) : null}
    </div>
  );
}
