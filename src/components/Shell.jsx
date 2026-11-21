import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3, BriefcaseBusiness, Database, LogOut, Menu, ShieldCheck, Users, X,
} from 'lucide-react';
import { useAuth } from '../AuthContext.jsx';

const navigation = [
  { group: 'Main', label: 'Dashboard', to: '/dashboard', icon: BarChart3 },
  { group: 'Main', label: 'Opportunities', to: '/opportunities', icon: BriefcaseBusiness },
  { group: 'Data', label: 'Import / Export', to: '/import-export', icon: Database },
  { group: 'Settings', label: 'User Profiles', to: '/users', icon: Users, adminOnly: true },
];

function Sidebar({ mobile, onClose }) {
  const { user, logout } = useAuth();
  const groups = [...new Set(navigation.map((item) => item.group))];

  return (
    <aside className={`sidebar ${mobile ? 'sidebar--mobile' : ''}`} aria-label="Workspace navigation">
      <div className="sidebar-brand">
        <div className="brand-mark">RBS</div>
        <div>
          <strong>RBS</strong>
          <span>Presales Workspace</span>
        </div>
        {mobile && <button className="icon-button icon-button--inverse sidebar-close" onClick={onClose} aria-label="Close navigation"><X size={20} /></button>}
      </div>
      <nav className="sidebar-nav" aria-label="Primary">
        {groups.map((group) => {
          const items = navigation.filter((item) => item.group === group && (!item.adminOnly || user?.role === 'admin'));
          if (!items.length) return null;
          return (
            <div className="nav-group" key={group}>
              <p className="nav-group-label">{group}</p>
              {items.map(({ label, to, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={onClose}
                  className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}
                >
                  <Icon size={19} aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="sidebar-account">
        <div className="avatar" aria-hidden="true">{user?.name?.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</div>
        <div className="sidebar-account-copy">
          <strong>{user?.name}</strong>
          <span>{user?.role}</span>
        </div>
        <button className="icon-button icon-button--inverse" onClick={logout} aria-label="Sign out" title="Sign out">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}

export default function Shell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <div className="desktop-sidebar"><Sidebar /></div>
      <header className="mobile-header">
        <button className="icon-button" onClick={() => setMenuOpen(true)} aria-label="Open navigation" aria-expanded={menuOpen}><Menu size={22} /></button>
        <div className="mobile-brand"><div className="brand-mark brand-mark--small">RBS</div><strong>Presales</strong></div>
        <ShieldCheck size={19} className="mobile-secure" aria-label="Secure session" />
      </header>
      {menuOpen && (
        <div className="mobile-nav-layer" role="presentation">
          <button className="nav-backdrop" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />
          <Sidebar mobile onClose={() => setMenuOpen(false)} />
        </div>
      )}
      <main id="main-content" className="workspace" tabIndex="-1">
        <Outlet />
      </main>
    </div>
  );
}
