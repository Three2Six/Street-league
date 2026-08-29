import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import PageBackground from '../components/PageBackground.jsx';

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const referralCode = searchParams.get('ref');
  const [form, setForm] = useState({ nickname: '', email: '', password: '', city: '', state: '', country: '' });
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signup({ ...form, agreedToTerms, referralCode });
      navigate('/map');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <PageBackground image="/backgrounds/auth-nav.png" />
      <form className="auth-form" onSubmit={onSubmit}>
        <img src="/logo-badge.png" alt="Street League" className="auth-logo" />
        <h1>Join Street League</h1>
        <p className="auth-subtitle">Pick a nickname — that's how everyone else sees you.</p>
        {error && <div className="error-banner">{error}</div>}
        <label>
          Nickname
          <input value={form.nickname} onChange={update('nickname')} placeholder="RedlineRiley" required minLength={3} maxLength={20} />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={update('email')} required />
        </label>
        <label>
          Password
          <input type="password" value={form.password} onChange={update('password')} required minLength={8} />
        </label>
        <div className="form-row">
          <label>
            City
            <input value={form.city} onChange={update('city')} placeholder="Austin" />
          </label>
          <label>
            State
            <input value={form.state} onChange={update('state')} placeholder="TX" />
          </label>
          <label>
            Country
            <input value={form.country} onChange={update('country')} placeholder="USA" />
          </label>
        </div>
        <label className="checkbox-label">
          <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} />
          I have read and agree to the <Link to="/disclaimer" target="_blank">Terms &amp; Liability Disclaimer</Link>
        </label>
        <button type="submit" disabled={submitting || !agreedToTerms}>{submitting ? 'Creating account…' : 'Sign up'}</button>
        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
        <p className="auth-switch">
          <Link to="/contact">Contact us</Link> · <Link to="/disclaimer">Disclaimer</Link>
        </p>
      </form>
    </div>
  );
}
