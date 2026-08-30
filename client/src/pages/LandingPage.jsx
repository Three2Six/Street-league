import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageBackground from '../components/PageBackground.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';

const FEATURES = [
  {
    key: 'liveMap',
    icon: <path d="M12 21s-7-7.2-7-12a7 7 0 0 1 14 0c0 4.8-7 12-7 12z M12 9v.01" />,
  },
  {
    key: 'challenges',
    icon: <path d="M5 21V4 M5 5h12l-2.2 4L17 13H5" />,
  },
  {
    key: 'cruises',
    icon: <path d="M3 20 9 4M18 20 12 4 M8.2 13h3.6" />,
  },
  {
    key: 'chat',
    icon: <path d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4 8.3 8.3 0 0 1-3.8-.9L3 21l1.9-5.8a8.3 8.3 0 0 1-.9-3.8A8.4 8.4 0 0 1 12.6 3a8.4 8.4 0 0 1 8.4 8.4z" />,
  },
  {
    key: 'sos',
    icon: <path d="M12 9v4.5M12 17h.01 M10.6 3.9-8.5 14A1.8 1.8 0 0 0 3.7 20.7h16.6a1.8 1.8 0 0 0 1.6-2.8l-8.5-14a1.8 1.8 0 0 0-3.1 0z" />,
  },
];

export default function LandingPage() {
  const { t } = useTranslation();
  const [signups, setSignups] = useState(null);

  useEffect(() => {
    fetch('/api/stats/public')
      .then((r) => r.json())
      .then((d) => setSignups(d.signups))
      .catch(() => {});
  }, []);

  return (
    <div className="landing-page">
      <PageBackground image="/backgrounds/cruises-lineup.png" dim="light" />
      <LanguageSwitcher className="landing-language" />
      <div className="landing-content">
        <img src="/logo-badge.png" alt="Street League" className="landing-logo" />

        <div className="landing-badge">{t('landing.badge')}</div>

        <h1 className="landing-headline">
          {t('landing.headline1')} <span className="landing-accent">{t('landing.headline2')}</span> {t('landing.headline3')}
        </h1>

        {signups != null && signups > 0 && (
          <div className="landing-counter">{t('landing.counter', { count: signups })}</div>
        )}

        <div className="landing-features">
          {FEATURES.map((f) => (
            <div className="landing-feature-row" key={f.key}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ff5a36" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {f.icon}
              </svg>
              <div>
                <strong>{t(`landing.features.${f.key}.title`)}</strong>
                <span className="muted"> &mdash; {t(`landing.features.${f.key}.blurb`)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="landing-points">
          <div className="landing-points-title">{t('landing.pointsTitle')}</div>
          <div>
            {t('landing.pointsBody')}
            <strong> {t('landing.pointsBold')}</strong>
          </div>
        </div>

        <div className="landing-cta">
          <Link to="/signup" className="landing-cta-button">{t('landing.cta')}</Link>
          <p className="auth-switch">
            {t('landing.alreadyHave')} <Link to="/login">{t('landing.login')}</Link>
          </p>
          <p className="auth-switch">
            <Link to="/contact">{t('landing.contactUs')}</Link> &middot; <Link to="/disclaimer">{t('landing.disclaimer')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
