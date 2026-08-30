import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import PageBackground from '../components/PageBackground.jsx';

export default function PaywallPage() {
  const { t } = useTranslation();
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
        <h1>{t('paywall.title')}</h1>
        <p className="auth-subtitle">{t('paywall.subtitle')}</p>
        {error && <div className="error-banner">{error}</div>}
        {promo && (
          <div className="founder-promo-banner">
            {t('paywall.promoPrefix')} <strong>{promo.code}</strong>{' '}
            {t('paywall.promoSuffix', { date: new Date(promo.expiresAt).toLocaleDateString() })}
          </div>
        )}
        <button disabled={submitting} onClick={upgrade}>
          {submitting ? t('paywall.redirecting') : t('paywall.unlock')}
        </button>
        <p className="auth-switch">
          <button className="link-button" onClick={logout}>{t('paywall.logout')}</button>
        </p>
      </div>
    </div>
  );
}
