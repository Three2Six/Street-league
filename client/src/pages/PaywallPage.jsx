import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import PageBackground from '../components/PageBackground.jsx';

export default function PaywallPage() {
  const { user, logout } = useAuth();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [promo, setPromo] = useState(null);

  useEffect(() => {
    if (!user?.founder) return;
    api('/billing/founder-promo')
      .then((data) => setPromo(data.available ? data : null))
      .catch(() => {});
  }, [user]);

  const upgrade = async () => {
    setSubmitting(true);
    setError('');
    try {
      const { url } = await api('/billing/checkout', { method: 'POST' });
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <PageBackground image="/backgrounds/auth-nav.png" />
      <div className="auth-form">
        <h1>Your free trial has ended</h1>
        <p className="auth-subtitle">
          Unlock Street League for good — one payment, no recurring charges.
        </p>
        {error && <div className="error-banner">{error}</div>}
        {promo && (
          <div className="founder-promo-banner">
            Beta founder thank-you: use code <strong>{promo.code}</strong> at checkout for 50% off —
            expires {new Date(promo.expiresAt).toLocaleDateString()}.
          </div>
        )}
        <button disabled={submitting} onClick={upgrade}>
          {submitting ? 'Redirecting…' : 'Unlock for $9.99'}
        </button>
        <p className="auth-switch">
          <button className="link-button" onClick={logout}>Log out</button>
        </p>
      </div>
    </div>
  );
}
