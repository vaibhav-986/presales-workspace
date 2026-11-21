import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, BriefcaseBusiness, CalendarDays, CircleDollarSign, Plus, Target, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import OpportunityModal from '../components/OpportunityModal.jsx';

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const shortCurrency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' });

function LoadingDashboard() {
  return <div className="dashboard-skeleton" aria-label="Loading dashboard" role="status"><div /><div /><div /><div className="skeleton-wide" /></div>;
}

function StageChart({ stages }) {
  const active = stages.filter((item) => item.count > 0);
  const max = Math.max(1, ...active.map((item) => item.count));
  if (!active.length) return <div className="mini-empty"><Target size={28} /><p>Stage mix appears after your first opportunity.</p></div>;
  return (
    <div className="stage-chart" aria-label="Opportunities by stage">
      {active.map((item) => (
        <div className="stage-row" key={item.stage} title={`${item.stage}: ${item.count} opportunities, ${currency.format(item.amount)}`}>
          <div className="stage-label"><span>{item.stage}</span><strong>{item.count}</strong></div>
          <div className="stage-track"><span style={{ width: `${Math.max(9, (item.count / max) * 100)}%` }} /></div>
          <span className="stage-amount">{shortCurrency.format(item.amount)}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { user, api } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const canCreate = ['admin', 'manager', 'member'].includes(user?.role);

  const load = useCallback(async () => {
    setError('');
    try {
      const response = await api('/api/dashboard');
      setData(response.data);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const quarter = useMemo(() => {
    if (!data?.range?.from) return 'Current quarter';
    const start = new Date(`${data.range.from}T00:00:00Z`);
    return `Q${Math.floor(start.getUTCMonth() / 3) + 1} ${start.getUTCFullYear()}`;
  }, [data]);

  return (
    <div className="page dashboard-page">
      <header className="page-header">
        <div>
          <p className="breadcrumbs">Workspace <span>/</span> Dashboard</p>
          <h1>Presales overview.</h1>
          <p>Welcome back, {user?.name?.split(' ')[0]}. Here is what is moving this quarter.</p>
        </div>
        {canCreate && <button className="button button--primary" onClick={() => setModalOpen(true)}><Plus size={18} /> Add opportunity</button>}
      </header>

      {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={load}>Try again</button></div>}
      {!data ? <LoadingDashboard /> : (
        <>
          <section className="kpi-grid" aria-label="Quarterly summary">
            <article className="kpi-card kpi-card--feature">
              <div className="kpi-top"><span className="kpi-icon"><Trophy size={19} /></span><span className="kpi-period">{quarter}</span></div>
              <p>Won this quarter</p>
              <strong>{currency.format(data.wonThisQuarter.amount)}</strong>
              <span>{data.wonThisQuarter.count} {data.wonThisQuarter.count === 1 ? 'deal' : 'deals'} closed</span>
              <ArrowUpRight className="kpi-watermark" size={70} aria-hidden="true" />
            </article>
            <article className="kpi-card">
              <div className="kpi-top"><span className="kpi-icon kpi-icon--blue"><BriefcaseBusiness size={19} /></span><span className="status-dot">Live</span></div>
              <p>Active opportunities</p>
              <strong>{data.activeOpportunities.count}</strong>
              <span>{shortCurrency.format(data.activeOpportunities.amount)} in active pipeline</span>
              <div className="kpi-line"><span style={{ width: `${Math.min(100, data.activeOpportunities.count * 10)}%` }} /></div>
            </article>
            <article className="kpi-card">
              <div className="kpi-top"><span className="kpi-icon kpi-icon--gold"><CircleDollarSign size={19} /></span><span className="kpi-period">{quarter}</span></div>
              <p>Win rate</p>
              <strong>{data.winRate}%</strong>
              <span>Across closed opportunities</span>
              <div className="kpi-line kpi-line--gold"><span style={{ width: `${data.winRate}%` }} /></div>
            </article>
            <article className="kpi-card">
              <div className="kpi-top"><span className="kpi-icon kpi-icon--violet"><Target size={19} /></span><span className="kpi-period">All time</span></div>
              <p>Total visits</p>
              <strong>{data.totalCount}</strong>
              <span>Presales visits recorded</span>
              <div className="kpi-line kpi-line--violet"><span style={{ width: `${Math.min(100, data.totalCount * 8)}%` }} /></div>
            </article>
          </section>

          <section className="dashboard-grid">
            <article className="content-card pipeline-card">
              <div className="card-heading"><div><p className="eyebrow">Pipeline mix</p><h2>Opportunities by stage</h2></div><Link to="/opportunities" className="text-link">View all <ArrowUpRight size={15} /></Link></div>
              <StageChart stages={data.stages} />
            </article>
            <article className="content-card pulse-card">
              <div className="card-heading"><div><p className="eyebrow">This quarter</p><h2>Performance pulse</h2></div><CalendarDays size={20} /></div>
              <div className="pulse-metric"><span>Open pipeline</span><strong>{currency.format(data.activeOpportunities.amount)}</strong></div>
              <div className="pulse-metric"><span>Closed value</span><strong>{currency.format(data.wonThisQuarter.amount)}</strong></div>
              <div className="pulse-note"><Target size={18} /><p><strong>Keep the next action clear.</strong><br />Strong discovery notes make follow-up faster.</p></div>
            </article>
          </section>

          <section className="content-card recent-card">
            <div className="card-heading"><div><p className="eyebrow">Recent visits</p><h2>Latest opportunity activity</h2></div>{data.recent.length > 0 && <Link to="/opportunities" className="button button--secondary button--small">Open pipeline</Link>}</div>
            {data.recent.length === 0 ? (
              <div className="empty-state">
                <div className="empty-illustration"><BriefcaseBusiness size={28} /></div>
                <h3>No visits recorded yet</h3>
                <p>{canCreate ? 'Add your first opportunity to start tracking property visits and pipeline progress.' : 'Opportunity activity will appear here when your team adds its first record.'}</p>
                {canCreate && <button className="button button--primary" onClick={() => setModalOpen(true)}><Plus size={17} /> Add your first opportunity</button>}
              </div>
            ) : (
              <div className="table-scroll" tabIndex="0" aria-label="Recent opportunities table">
                <table>
                  <thead><tr><th scope="col">Property</th><th scope="col">Visit date</th><th scope="col">Presaler</th><th scope="col">Stage</th><th scope="col" className="align-right">Value</th></tr></thead>
                  <tbody>{data.recent.map((item) => <tr key={item.id}><th scope="row"><span className="property-cell"><span className="property-avatar">{item.propertyName.slice(0, 2).toUpperCase()}</span><span><strong>{item.propertyName}</strong><small>{item.propertyLocation}</small></span></span></th><td>{dateFormat.format(new Date(`${item.visitDate}T00:00:00`))}</td><td>{item.presalerName}</td><td><span className={`stage-pill stage-pill--${item.stage.toLowerCase()}`}>{item.stage}</span></td><td className="align-right table-value">{currency.format(item.wonAmount)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {modalOpen && <OpportunityModal onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); load(); }} />}
    </div>
  );
}
