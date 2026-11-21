import { useCallback, useEffect, useRef, useState } from 'react';
import { Mail, Plus, Search, ShieldCheck, UserCheck, UserRoundPlus, UserX, X } from 'lucide-react';
import { useAuth } from '../AuthContext.jsx';

const dateFormat = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' });

function AddUserDialog({ onClose, onSaved }) {
  const { api } = useAuth();
  const ref = useRef(null);
  const [form, setForm] = useState({ name: '', email: '', title: '', role: 'member', password: '' });
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setFields({});
    try {
      const response = await api('/api/users', { method: 'POST', body: JSON.stringify(form) });
      onSaved(response.data);
    } catch (requestError) {
      setError(requestError.message);
      setFields(requestError.fields || {});
    } finally {
      setSaving(false);
    }
  }

  function change(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); }

  return (
    <dialog ref={ref} className="dialog user-dialog" aria-labelledby="add-user-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === ref.current) onClose(); }}>
      <form className="dialog-card" onSubmit={submit}>
        <div className="dialog-header"><div><p className="eyebrow">Workspace access</p><h2 id="add-user-title">Add user profile</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button></div>
        <div className="dialog-body">
          {error && <div className="form-alert" role="alert">{error}</div>}
          <div className="user-dialog-illustration"><UserRoundPlus size={26} /><div><strong>Create a secure account</strong><p>The user can sign in immediately with the temporary password.</p></div></div>
          <div className="form-grid">
            <label className="field"><span>Full name <b>*</b></span><input name="name" value={form.name} onChange={change} required placeholder="e.g. Asha Patel" aria-invalid={Boolean(fields.name)} />{fields.name && <span className="field-error">{fields.name}</span>}</label>
            <label className="field"><span>Email address <b>*</b></span><input type="email" name="email" value={form.email} onChange={change} required placeholder="asha@company.com" aria-invalid={Boolean(fields.email)} />{fields.email && <span className="field-error">{fields.email}</span>}</label>
            <label className="field"><span>Job title</span><input name="title" value={form.title} onChange={change} placeholder="Solutions Consultant" /></label>
            <label className="field"><span>Role <b>*</b></span><select name="role" value={form.role} onChange={change}><option value="viewer">Viewer</option><option value="member">Member</option><option value="manager">Manager</option><option value="admin">Admin</option></select></label>
          </div>
          <label className="field"><span>Temporary password <b>*</b></span><input type="password" name="password" value={form.password} onChange={change} required minLength="10" autoComplete="new-password" placeholder="At least 10 characters" aria-invalid={Boolean(fields.password)} />{fields.password && <span className="field-error">{fields.password}</span>}<small>Share it through a secure channel. The password is never displayed again.</small></label>
        </div>
        <div className="dialog-footer"><p>Admin actions take effect immediately.</p><div><button type="button" className="button button--ghost" onClick={onClose}>Cancel</button><button className="button button--primary" disabled={saving}>{saving ? 'Creating…' : 'Create user'}</button></div></div>
      </form>
    </dialog>
  );
}

export default function UsersPage() {
  const { user: currentUser, api } = useAuth();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api('/api/users');
      setUsers(response.data);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const visible = users.filter((item) => `${item.name} ${item.email} ${item.title}`.toLowerCase().includes(search.toLowerCase()));
  const activeCount = users.filter((item) => item.status === 'active').length;

  async function updateUser(id, patch) {
    try {
      await api(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      load();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className="page">
      <header className="page-header"><div><p className="breadcrumbs">Workspace <span>/</span> Settings</p><h1>User profiles.</h1><p>Manage who can access the workspace and what they can do.</p></div><button className="button button--primary" onClick={() => setShowAdd(true)}><Plus size={18} /> Add user</button></header>

      <section className="user-kpis" aria-label="User summary">
        <div><span className="user-kpi-icon"><UserCheck size={20} /></span><p>Active users<strong>{activeCount}</strong></p></div>
        <div><span className="user-kpi-icon user-kpi-icon--navy"><ShieldCheck size={20} /></span><p>Administrators<strong>{users.filter((item) => item.role === 'admin' && item.status === 'active').length}</strong></p></div>
        <div><span className="user-kpi-icon user-kpi-icon--gold"><Mail size={20} /></span><p>Total profiles<strong>{users.length}</strong></p></div>
      </section>

      <section className="content-card users-card">
        <div className="card-heading users-heading"><div><p className="eyebrow">Workspace directory</p><h2>People and access</h2></div><div className="search-box search-box--small"><Search size={17} /><label className="sr-only" htmlFor="user-search">Search users</label><input id="user-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users" /></div></div>
        {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={load}>Dismiss</button></div>}
        {loading ? <div className="list-loading" role="status"><span className="loader-ring" /> Loading user profiles…</div> : (
          <div className="table-scroll" tabIndex="0" aria-label="User profiles table">
            <table>
              <thead><tr><th scope="col">User</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Last login</th><th scope="col">Access</th></tr></thead>
              <tbody>{visible.map((item) => (
                <tr key={item.id}>
                  <th scope="row"><span className="property-cell"><span className="avatar avatar--table">{item.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><span><strong>{item.name}{item.id === currentUser.id && <em> You</em>}</strong><small>{item.email}{item.title ? ` · ${item.title}` : ''}</small></span></span></th>
                  <td><label><span className="sr-only">Role for {item.name}</span><select className="table-select" value={item.role} onChange={(event) => updateUser(item.id, { role: event.target.value })} disabled={item.id === currentUser.id}><option value="viewer">Viewer</option><option value="member">Member</option><option value="manager">Manager</option><option value="admin">Admin</option></select></label></td>
                  <td><span className={`user-status user-status--${item.status}`}>{item.status}</span></td>
                  <td>{item.lastLoginAt ? dateFormat.format(new Date(item.lastLoginAt)) : 'Never'}</td>
                  <td>{item.id === currentUser.id ? <span className="current-user-label">Current session</span> : <button className={`button button--small ${item.status === 'active' ? 'button--danger-ghost' : 'button--secondary'}`} onClick={() => updateUser(item.id, { status: item.status === 'active' ? 'disabled' : 'active' })}>{item.status === 'active' ? <><UserX size={15} /> Disable</> : <><UserCheck size={15} /> Enable</>}</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      {showAdd && <AddUserDialog onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}
