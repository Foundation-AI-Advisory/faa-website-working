import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, type DashboardPayload } from './api';
import { Dashboard } from './pages/Dashboard';
import { NewAnalysis } from './pages/NewAnalysis';
import { Jobs } from './pages/Jobs';
import { JobDetail } from './pages/JobDetail';
import { Workspace } from './pages/Workspace';

const PAGE_META: [RegExp, string, string][] = [
  [/^\/$/, 'Dashboard', 'Artwork pipeline at a glance'],
  [/^\/new/, 'New Analysis', 'Upload a customer artwork proof for deterministic analysis'],
  [/^\/jobs\/[^/]+$/, 'Artwork Job', 'Versions, audit timeline and notifications'],
  [/^\/jobs/, 'Artwork Jobs', 'Every artwork job in the system'],
  [/^\/queue/, 'Approval Queue', 'Waiting on a customer decision'],
  [/^\/review/, 'Needs Review', 'Values and preflight issues awaiting prepress'],
  [/^\/approved/, 'Approved Artwork', 'Released artwork'],
  [/^\/workspace/, 'Artwork Analysis Workspace', 'Proof viewer and structured analysis'],
];

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [counts, setCounts] = useState<DashboardPayload['counts'] | null>(null);
  const isWorkspace = location.pathname.startsWith('/workspace');

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .dashboard()
        .then((d) => alive && setCounts(d.counts))
        .catch(() => undefined);
    load();
    const t = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [location.pathname]);

  const meta = PAGE_META.find(([re]) => re.test(location.pathname));

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          {/* Temporary wordmark — replace with the approved Great Lakes Label logo asset. */}
          <div className="wordmark">
            <div className="wordmark-mark" aria-hidden="true">GL</div>
            <div>
              <div className="wordmark-text">Great Lakes Label</div>
              <div className="wordmark-sub">Prepress</div>
            </div>
          </div>
          <div className="app-title">Artwork Intelligence &amp; Approval</div>
        </div>
        <nav className="nav">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/new">New Analysis</NavLink>
          <NavLink to="/jobs">
            Artwork Jobs {counts ? <span className="nav-count">{counts.total}</span> : null}
          </NavLink>
          <NavLink to="/queue">
            Approval Queue {counts ? <span className="nav-count">{counts.awaitingCustomer}</span> : null}
          </NavLink>
          <NavLink to="/review">
            Needs Review {counts ? <span className="nav-count">{counts.needsPrepressReview + counts.changesRequested}</span> : null}
          </NavLink>
          <NavLink to="/approved">
            Approved Artwork {counts ? <span className="nav-count">{counts.approved}</span> : null}
          </NavLink>
        </nav>
        <div className="sidebar-foot">
          Files are analysed locally.<br />No artwork leaves this machine.
        </div>
      </aside>

      <div className={`main${isWorkspace ? ' fixed' : ''}`}>
        <header className="topbar">
          <div className="topbar-titles">
            <h1>{meta?.[1] ?? 'Artwork Intelligence & Approval'}</h1>
            <div className="topbar-sub">{meta?.[2] ?? ''}</div>
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/new')}>
            Analyze New Artwork
          </button>
        </header>
        <main className={`content${isWorkspace ? ' flush' : ''}`}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/new" element={<NewAnalysis />} />
            <Route path="/jobs" element={<Jobs filter="all" />} />
            <Route path="/jobs/:jobId" element={<JobDetail />} />
            <Route path="/queue" element={<Jobs filter="approval_queue" />} />
            <Route path="/review" element={<Jobs filter="needs_review" />} />
            <Route path="/approved" element={<Jobs filter="approved" />} />
            <Route path="/workspace/:versionId" element={<Workspace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
