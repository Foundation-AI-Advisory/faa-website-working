import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate, JOB_STATUS_LABELS, type DashboardPayload } from '../api';
import { Badge, Empty, ErrorNote, Spinner } from '../components/ui';

export function Dashboard() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .dashboard()
        .then((d) => alive && setData(d))
        .catch((e: Error) => alive && setError(e.message));
    load();
    const timer = setInterval(load, 6000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (error) return <ErrorNote error={error} />;
  if (!data)
    return (
      <div className="flex" style={{ padding: 40 }}>
        <Spinner dark /> Loading dashboard…
      </div>
    );

  const cards: { label: string; value: number; note: string; accent?: boolean }[] = [
    { label: 'Awaiting analysis', value: data.counts.awaitingAnalysis, note: 'Uploaded or analyzing' },
    { label: 'Needs prepress review', value: data.counts.needsPrepressReview, note: 'Values to confirm', accent: true },
    { label: 'Awaiting customer', value: data.counts.awaitingCustomer, note: 'Sent for approval' },
    { label: 'Changes requested', value: data.counts.changesRequested, note: 'Revision required', accent: true },
    { label: 'Approved', value: data.counts.approved, note: 'Released artwork' },
  ];

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid grid-stats">
        {cards.map((c) => (
          <div key={c.label} className={`stat${c.accent && c.value > 0 ? ' accent' : ''}`}>
            <div className="stat-label">{c.label}</div>
            <div className="stat-value">{c.value}</div>
            <div className="stat-note">{c.note}</div>
          </div>
        ))}
        <div className="stat">
          <div className="stat-label">Avg. approval cycle</div>
          <div className="stat-value">
            {data.averageApprovalHours === null ? '—' : `${data.averageApprovalHours.toFixed(1)}h`}
          </div>
          <div className="stat-note">
            {data.approvedCount === 0
              ? 'No approvals recorded yet'
              : `Upload → approval, across ${data.approvedCount} approval${data.approvedCount === 1 ? '' : 's'}`}
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-head">
            <h2>Artwork jobs</h2>
            <Link className="btn btn-sm" to="/jobs">
              View all
            </Link>
          </div>
          <div className="card-body tight">
            {data.jobs.length === 0 ? (
              <Empty title="No artwork jobs yet">
                Start with <Link to="/new">Analyze New Artwork</Link>.
              </Empty>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Customer</th>
                      <th>Artwork</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.jobs.map((j) => (
                      <tr key={j.id}>
                        <td className="nowrap">
                          <Link to={`/jobs/${j.id}`}>{j.job_number}</Link>
                        </td>
                        <td>{j.customer}</td>
                        <td>{j.title}</td>
                        <td>
                          <Badge status={j.status}>{j.statusLabel}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Recent activity</h2>
          </div>
          <div className="card-body">
            {data.recentActivity.length === 0 ? (
              <Empty title="No activity yet">Actions on artwork jobs appear here.</Empty>
            ) : (
              <ul className="timeline">
                {data.recentActivity.slice(0, 12).map((e) => (
                  <li key={e.id}>
                    <div className="when">{fmtDate(e.created_at)}</div>
                    <div className="what">
                      {e.job_number} · {JOB_STATUS_LABELS[e.to_status] ?? e.to_status}
                    </div>
                    <div className="detail">
                      {e.actor} — {e.detail ?? e.title}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
