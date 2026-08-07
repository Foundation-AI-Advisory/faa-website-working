import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fmtDate, JOB_STATUS_LABELS, type JobPayload } from '../api';
import { Badge, ErrorNote, Modal, Spinner } from '../components/ui';
import { NewAnalysis } from './NewAnalysis';

export function JobDetail() {
  const { jobId = '' } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<JobPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRevision, setShowRevision] = useState(false);

  const load = useCallback(
    () =>
      api
        .job(jobId)
        .then(setData)
        .catch((e: Error) => setError(e.message)),
    [jobId],
  );

  useEffect(() => {
    void load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  if (error) return <ErrorNote error={error} />;
  if (!data)
    return (
      <div className="flex" style={{ padding: 40 }}>
        <Spinner dark /> Loading job…
      </div>
    );

  const { job, versions, events, notifications } = data;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card">
        <div className="card-head">
          <div>
            <h2>
              {job.job_number} — {job.title}
            </h2>
            <div className="small muted">
              {job.customer} · Product {job.product_number ?? '—'} · Created {fmtDate(job.created_at)} by {job.created_by}
            </div>
          </div>
          <div className="flex" style={{ gap: 8 }}>
            <Badge status={job.status}>{data.statusLabel}</Badge>
            <button className="btn btn-primary btn-sm" onClick={() => setShowRevision(true)}>
              Upload revision
            </button>
          </div>
        </div>
        {job.seeded === 1 ? (
          <div className="card-body">
            <div className="note">
              This is a demonstration record used to populate the dashboard queues. It has no analyzer output attached.
              Upload a PDF to run the real analyzer on this job.
            </div>
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Versions</h2>
          <span className="small muted">Every version is kept — a revision never overwrites an earlier file.</span>
        </div>
        <div className="card-body tight">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Label</th>
                  <th>Status</th>
                  <th>Analysis</th>
                  <th>Uploaded</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id}>
                    <td className="num">{v.version_number}</td>
                    <td>{v.revision_label ?? '—'}</td>
                    <td>
                      <Badge status={v.status}>{JOB_STATUS_LABELS[v.status] ?? v.status}</Badge>
                    </td>
                    <td className="small">
                      {v.runState === 'complete' ? (
                        <span className="badge badge-ok">Analyzed</span>
                      ) : v.runState === 'running' ? (
                        <span className="badge badge-info">Running</span>
                      ) : v.runState === 'failed' ? (
                        <span className="badge badge-blocked">Failed</span>
                      ) : (
                        <span className="badge badge-neutral">None</span>
                      )}
                    </td>
                    <td className="small muted nowrap">{fmtDate(v.created_at)}</td>
                    <td className="right">
                      {v.runState ? (
                        <Link className="btn btn-sm" to={`/workspace/${v.id}`}>
                          Open workspace
                        </Link>
                      ) : (
                        <span className="small muted">No analysis</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-head">
            <h2>Audit timeline</h2>
          </div>
          <div className="card-body">
            <ul className="timeline">
              {events.map((e) => (
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
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Notifications</h2>
          </div>
          <div className="card-body">
            {notifications.length === 0 ? (
              <p className="small muted">No notifications sent.</p>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className="issue info">
                  <div className="issue-head">
                    <span className="issue-title">{n.subject}</span>
                    <span className="small muted" style={{ marginLeft: 'auto' }}>
                      {fmtDate(n.created_at)}
                    </span>
                  </div>
                  <p className="small muted">
                    {n.kind.replace(/_/g, ' ')} → {n.recipient}
                    {n.is_resend ? ' (resend)' : ''}
                  </p>
                  <p>{n.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showRevision ? (
        <Modal title="Upload revision" onClose={() => setShowRevision(false)}>
          <NewAnalysis
            jobId={job.id}
            onDone={(versionId) => {
              setShowRevision(false);
              navigate(`/workspace/${versionId}`);
            }}
          />
        </Modal>
      ) : null}
    </div>
  );
}
