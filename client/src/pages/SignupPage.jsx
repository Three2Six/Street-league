import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';
import PageBackground from '../components/PageBackground.jsx';

export default function SignupPage() {
  const { t } = useTranslation();
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
        <h1>{t('signup.title')}</h1>
        <p className="auth-subtitle">{t('signup.subtitle')}</p>
        {error && <div className="error-banner">{error}</div>}
        <label>
          {t('signup.nicknameLabel')}
          <input value={form.nickname} onChange={update('nickname')} placeholder="RedlineRiley" required minLength={3} maxLength={20} />
        </label>
        <label>
          {t('signup.emailLabel')}
          <input type="email" value={form.email} onChange={update('email')} required />
        </label>
        <label>
          {t('signup.passwordLabel')}
          <input type="password" value={form.password} onChange={update('password')} required minLength={8} />
        </label>
        <div className="form-row">
          <label>
            {t('signup.cityLabel')}
            <input value={form.city} onChange={update('city')} placeholder="Austin" />
          </label>
          <label>
            {t('signup.stateLabel')}
            <input value={form.state} onChange={update('state')} placeholder="TX" />
          </label>
          <label>
            {t('signup.countryLabel')}
            <input value={form.country} onChange={update('country')} placeholder="USA" />
          </label>
        </div>
        <label className="checkbox-label">
          <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} />
          {t('signup.agreePrefix')} <Link to="/disclaimer" target="_blank">{t('signup.termsLink')}</Link>
        </label>
        <button type="submit" disabled={submitting || !agreedToTerms}>{submitting ? t('signup.submitting') : t('signup.submit')}</button>
        <p className="auth-switch">
          {t('signup.alreadyHave')} <Link to="/login">{t('signup.login')}</Link>
        </p>
        <p className="auth-switch">
          <Link to="/contact">{t('signup.contactUs')}</Link> · <Link to="/disclaimer">{t('signup.disclaimer')}</Link>
        </p>
      </form>
    </div>
  );
}
