import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageBackground from '../components/PageBackground.jsx';

export default function ContactPage() {
  const { t } = useTranslation();
  return (
    <div className="auth-page">
      <PageBackground image="/backgrounds/contact-1.jpg" />
      <div className="auth-form">
        <h1>{t('contact.title')}</h1>
        <p className="auth-subtitle">{t('contact.subtitle')}</p>
        <p>
          {t('contact.emailLabel')} <a href="mailto:support@streetleague.app">support@streetleague.app</a>
        </p>
        <p className="auth-switch">
          <Link to="/login">{t('contact.backToLogin')}</Link> · <Link to="/disclaimer">{t('contact.disclaimer')}</Link>
        </p>
      </div>
    </div>
  );
}
