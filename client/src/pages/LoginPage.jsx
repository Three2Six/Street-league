import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';
import PageBackground from '../components/PageBackground.jsx';

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(form);
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
        <img src="/logo-badge.png" alt="Redline League" className="auth-logo" />
        <h1>{t('login.title')}</h1>
        {error && <div className="error-banner">{error}</div>}
        <label>
          {t('login.emailLabel')}
          <input type="email" value={form.email} onChange={update('email')} required />
        </label>
        <label>
          {t('login.passwordLabel')}
          <input type="password" value={form.password} onChange={update('password')} required />
        </label>
        <button type="submit" disabled={submitting}>{submitting ? t('login.submitting') : t('login.submit')}</button>
        <p className="auth-switch">
          {t('login.newHere')} <Link to="/signup">{t('login.createAccount')}</Link>
        </p>
        <p className="auth-switch">
          <Link to="/contact">{t('login.contactUs')}</Link> · <Link to="/disclaimer">{t('login.disclaimer')}</Link>
        </p>
      </form>
    </div>
  );
}
