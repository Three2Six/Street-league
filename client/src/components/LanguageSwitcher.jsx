import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../i18n/index.js';

export default function LanguageSwitcher({ className }) {
  const { i18n } = useTranslation();

  return (
    <select
      className={`language-switcher ${className || ''}`}
      value={i18n.resolvedLanguage || 'en'}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      aria-label="Language"
    >
      {SUPPORTED_LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
