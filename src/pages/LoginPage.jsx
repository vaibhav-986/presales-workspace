import { useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

export default function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('admin@presales.local');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(email, password);
      const requested = searchParams.get('returnTo');
      const safeReturnTo = requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/dashboard';
      navigate(safeReturnTo, { replace: true });
    } catch (requestError) {
      setError(requestError.message || 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-showcase" aria-label="Presales workspace overview">
        <div className="login-brand"><div className="brand-mark brand-mark--large">RBS</div><div><strong>RBS</strong><span>Presales Workspace</span></div></div>
        <div className="login-showcase-copy">
          <p className="eyebrow eyebrow--light">Your presales command center</p>
          <h1>Turn every visit into forward momentum.</h1>
          <p>Keep opportunities, discovery notes, and team performance in one secure workspace.</p>
          <ul>
            <li><CheckCircle2 size={18} /> Track every opportunity from discovery to win</li>
            <li><CheckCircle2 size={18} /> Keep visit intelligence clear and searchable</li>
            <li><CheckCircle2 size={18} /> See pipeline health at a glance</li>
          </ul>
        </div>
        <div className="showcase-orbit" aria-hidden="true"><span /><span /><span /></div>
        <p className="login-security"><ShieldCheck size={17} /> Protected by secure, server-side sessions</p>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="login-lock" aria-hidden="true"><LockKeyhole size={24} /></div>
          <p className="eyebrow">Private workspace</p>
          <h2>Welcome back</h2>
          <p className="login-intro">Sign in to continue to your presales workspace.</p>
          {error && <div className="form-alert" role="alert">{error}</div>}
          <form onSubmit={submit} className="login-form">
            <label className="field"><span>Email address</span><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="you@company.com" /></label>
            <label className="field"><span>Password</span><div className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required placeholder="Enter your password" /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
            <button className="button button--primary button--login" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : <>Sign in securely <ArrowRight size={18} /></>}</button>
          </form>
          {import.meta.env.DEV && (
            <div className="demo-credentials">
              <span>Local demo</span>
              <p><strong>admin@presales.local</strong><br />Password: <code>Presales@2026</code></p>
            </div>
          )}
        </div>
        <p className="login-footer">Authorized access only · Activity is protected</p>
      </section>
    </main>
  );
}
