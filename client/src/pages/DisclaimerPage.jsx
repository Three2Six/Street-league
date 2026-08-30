import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageBackground from '../components/PageBackground.jsx';

const SECTIONS = ['risk', 'legal', 'liability', 'location', 'conduct', 'beta'];

export default function DisclaimerPage() {
  const { t } = useTranslation();
  return (
    <div className="auth-page">
      <PageBackground image="/backgrounds/contact-1.jpg" dim="light" />
      <div className="auth-form disclaimer-form">
        <h1>{t('disclaimer.title')}</h1>

        {SECTIONS.map((key) => (
          <div key={key}>
            <h3>{t(`disclaimer.${key}.title`)}</h3>
            <p>{t(`disclaimer.${key}.body`)}</p>
          </div>
        ))}

        <p className="auth-switch">
          <Link to="/contact">{t('disclaimer.contactUs')}</Link> · <Link to="/login">{t('disclaimer.backToLogin')}</Link>
        </p>
      </div>
    </div>
  );
}
