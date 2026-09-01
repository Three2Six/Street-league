import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Stripe redirects here right after a successful checkout. The webhook that actually marks the
// account paid can land a beat after this page loads, so poll refreshMe briefly instead of
// trusting a single fetch.
export default function BillingSuccessPage() {
  const { refreshMe } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      await refreshMe();
      attempts += 1;
      if (!cancelled && attempts < 6) setTimeout(tick, 1000);
    };
    tick();
    const redirect = setTimeout(() => !cancelled && navigate('/map'), 4000);
    return () => {
      cancelled = true;
      clearTimeout(redirect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="centered">
      <p>Payment received — unlocking Redline League…</p>
    </div>
  );
}
