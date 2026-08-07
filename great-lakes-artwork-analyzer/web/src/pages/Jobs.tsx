import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fmtDate, type JobListItem } from '../api';
import { Badge, Empty, ErrorNote, Spinner } from '../components/ui';

const TITLES: Record<string, { title: string; blurb: string; empty: string }> = {
  all: { title: 'Artwork Jobs', blurb: 'Every artwork job and its current version.', empty: 'No artwork jobs yet.' },
  approval_queue: {
    title: 'Approval Queue',
    blurb: 'Artwork sent to a customer and waiting on their decision.',
    empty: 'Nothing is waiting on a customer right now.',
  },
  needs_review: {
    title: 'Needs Review',
    blurb: 'Analyses with values or preflight issues that need a prepress decision.',
    empty: 'No artwork is waiting on prepress review.',
  },
  approved: { title: 'Approved Artwork', blurb: 'Artwork the customer has approved.', empty: 'No approved artwork yet.' },
};

export function Jobs({ filter }: { filter: string }) {
  const [jobs, setJobs] = useState<JobListItem[] | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const meta = TITLES[filter] ?? TITLES.all;

  useEffect(() => {
    let alive = true;
    setJobs(null);
    const load = () =>
      api
        .jobs(filter, q)
        .then((d) => alive && setJobs(d))
        .catch((e: Error) => alive && setError(e.message));
    load();
    const timer = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [filter, q]);

  return (
    <div className="stack">
      <ErrorNote error={error} />
      <div className="card">
        <div className="card-head">
          <div>
            <h2>{meta.title}</h2>
            <div className="small muted">{meta.blurb}</div>
          </div>
          <div style={{ width: 250 }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search job, customer, product…"
              aria-label="Search artwork jobs"
            />
          </div>
        </div>
        <div className="card-body tight">
          {jobs === null ? (
            <div className="flex" style={{ padding: 32 }}>
              <Spinner dark /> Loading…
            </div>
          ) : jobs.length === 0 ? (
            <Empty title={meta.empty}>
              <Link to="/new">Analyze new artwork</Link> to get started.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Customer</th>
                    <th>Artwork</th>
                    <th>Product #</th>
                    <th>Versions</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id}>
                      <td className="nowrap">
                        <Link to={`/jobs/${j.id}`}>{j.job_number}</Link>
                      </td>
                      <td>{j.customer}</td>
                      <td>{j.title}</td>
                      <td className="mono">{j.product_number ?? '—'}</td>
                      <td className="num">{j.versionCount}</td>
                      <td>
                        <Badge status={j.status}>{j.statusLabel}</Badge>
                      </td>
                      <td className="nowrap small muted">{fmtDate(j.updated_at)}</td>
                      <td className="right nowrap">
                        {j.currentVersionId && j.runState === 'complete' ? (
                          <button
                            className="btn btn-sm"
                            onClick={() => navigate(`/workspace/${j.currentVersionId}`)}
                          >
                            Open workspace
                          </button>
                        ) : (
                          <Link className="btn btn-sm" to={`/jobs/${j.id}`}>
                            Open job
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {filter === 'all' && jobs?.some((j) => j.seeded === 1) ? (
        <div className="note">
          Jobs marked as demonstration records exist only to populate the queues. They carry no analyzer output — every
          analysis in this app comes from a real uploaded PDF.
        </div>
      ) : null}
    </div>
  );
}
