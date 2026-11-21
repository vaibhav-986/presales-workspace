import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Edit3, MapPin, MoreHorizontal, Plus, Search, Trash2 } from 'lucide-react';
import { useAuth } from '../AuthContext.jsx';
import OpportunityModal from '../components/OpportunityModal.jsx';

const STAGES = ['Discovery', 'Demo', 'Proposal', 'Negotiation', 'Won', 'Lost'];
const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' });

export default function OpportunitiesPage() {
  const { user, api } = useAuth();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState(null);
  const canEdit = ['admin', 'manager', 'member'].includes(user?.role);
  const canDelete = ['admin', 'manager'].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (stage) params.set('stage', stage);
      const response = await api(`/api/opportunities?${params}`);
      setItems(response.data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [api, search, stage]);

  useEffect(() => {
    const timeout = setTimeout(load, 180);
    return () => clearTimeout(timeout);
  }, [load]);

  const pipelineValue = useMemo(() => items.filter((item) => !['Won', 'Lost'].includes(item.stage)).reduce((sum, item) => sum + item.wonAmount, 0), [items]);

  async function remove(item) {
    if (!window.confirm(`Delete the ${item.propertyName} opportunity? This cannot be undone.`)) return;
    try {
      await api(`/api/opportunities/${item.id}`, { method: 'DELETE' });
      load();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div><p className="breadcrumbs">Workspace <span>/</span> Opportunities</p><h1>Opportunities.</h1><p>Every property visit, conversation, and next move in one place.</p></div>
        {canEdit && <button className="button button--primary" onClick={() => setEditor({ mode: 'create' })}><Plus size={18} /> Add opportunity</button>}
      </header>

      <div className="opportunity-summary" aria-label="Opportunity summary">
        <div><span>Visible records</span><strong>{items.length}</strong></div>
        <div><span>Active pipeline</span><strong>{currency.format(pipelineValue)}</strong></div>
        <div><span>Showing</span><strong>{stage || 'All stages'}</strong></div>
      </div>

      <section className="content-card opportunity-list-card">
        <div className="list-toolbar">
          <div className="search-box"><Search size={18} aria-hidden="true" /><label className="sr-only" htmlFor="opportunity-search">Search opportunities</label><input id="opportunity-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search property, location, or presaler" /></div>
          <label className="select-filter"><span className="sr-only">Filter by stage</span><select value={stage} onChange={(event) => setStage(event.target.value)}><option value="">All stages</option>{STAGES.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={load}>Try again</button></div>}
        {loading ? <div className="list-loading" role="status"><span className="loader-ring" /> Loading opportunities…</div> : items.length === 0 ? (
          <div className="empty-state empty-state--compact"><div className="empty-illustration"><Search size={26} /></div><h3>{search || stage ? 'No matching opportunities' : 'Your pipeline is ready'}</h3><p>{search || stage ? 'Try another search or clear the stage filter.' : 'Create your first opportunity to begin tracking the presales journey.'}</p>{!search && !stage && canEdit && <button className="button button--primary" onClick={() => setEditor({ mode: 'create' })}><Plus size={17} /> Add opportunity</button>}</div>
        ) : (
          <>
            <div className="table-scroll opportunities-table" tabIndex="0" aria-label="Opportunities table">
              <table>
                <caption className="sr-only">Presales opportunities</caption>
                <thead><tr><th scope="col">Property</th><th scope="col">Visit</th><th scope="col">Presaler</th><th scope="col">Stage</th><th scope="col">Software</th><th scope="col" className="align-right">Value</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>{items.map((item) => (
                  <tr key={item.id}>
                    <th scope="row"><span className="property-cell"><span className="property-avatar">{item.propertyName.slice(0, 2).toUpperCase()}</span><span><strong>{item.propertyName}</strong><small><MapPin size={12} /> {item.propertyLocation}</small></span></span></th>
                    <td>{dateFormat.format(new Date(`${item.visitDate}T00:00:00`))}<small className="table-subtext">{item.startTime}–{item.endTime}</small></td>
                    <td>{item.presalerName}</td>
                    <td><span className={`stage-pill stage-pill--${item.stage.toLowerCase()}`}>{item.stage}</span></td>
                    <td>{item.softwareType}</td>
                    <td className="align-right table-value">{currency.format(item.wonAmount)}</td>
                    <td><div className="row-actions">{canEdit && <button className="icon-button" onClick={() => setEditor({ mode: 'edit', item })} aria-label={`Edit ${item.propertyName}`} title="Edit"><Edit3 size={17} /></button>}{canDelete && <button className="icon-button icon-button--danger" onClick={() => remove(item)} aria-label={`Delete ${item.propertyName}`} title="Delete"><Trash2 size={17} /></button>}{!canEdit && <MoreHorizontal size={17} />}</div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="opportunity-cards">{items.map((item) => (
              <article className="mobile-record-card" key={item.id}>
                <div className="mobile-record-top"><div className="property-avatar">{item.propertyName.slice(0, 2).toUpperCase()}</div><div><h3>{item.propertyName}</h3><p><MapPin size={13} /> {item.propertyLocation}</p></div><span className={`stage-pill stage-pill--${item.stage.toLowerCase()}`}>{item.stage}</span></div>
                <div className="mobile-record-meta"><span><Calendar size={14} /> {dateFormat.format(new Date(`${item.visitDate}T00:00:00`))}</span><span>{item.presalerName}</span></div>
                <div className="mobile-record-footer"><strong>{currency.format(item.wonAmount)}</strong>{canEdit && <button className="button button--secondary button--small" onClick={() => setEditor({ mode: 'edit', item })}>Edit</button>}</div>
              </article>
            ))}</div>
          </>
        )}
      </section>
      {editor && <OpportunityModal opportunity={editor.mode === 'edit' ? editor.item : undefined} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load(); }} />}
    </div>
  );
}
