import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';
import { useWs } from '../context/WsContext.jsx';
import { trialDaysLeft } from '../access.js';
import { api } from '../api.js';
import Logo from './Logo.jsx';
import AvatarPicker from './AvatarPicker.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';

export default function NavBar() {
  const { t } = useTranslation();
  const { user, logout, setVisible } = useAuth();
  const { connected } = useWs();
  const [toggling, setToggling] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const daysLeft = trialDaysLeft(user);

  const upgrade = async () => {
    setUpgrading(true);
    try {
      const { url } = await api('/billing/checkout', { method: 'POST' });
      window.location.href = url;
    } catch {
      setUpgrading(false);
    }
  };

  const toggleVisibility = async () => {
    setToggling(true);
    try {
      await setVisible(!user.visible);
    } catch {
      // transient network hiccup — leave the switch as-is, the user can just try again
    } finally {
      setToggling(false);
    }
  };

  return (
    <nav className="navbar">
      <Logo />
      <div className="navbar-links">
        <NavLink to="/map" className={({ isActive }) => (isActive ? 'active' : '')}>{t('nav.map')}</NavLink>
        <NavLink to="/challenges" className={({ isActive }) => (isActive ? 'active' : '')}>{t('nav.challenges')}</NavLink>
        <NavLink to="/cruises" className={({ isActive }) => (isActive ? 'active' : '')}>{t('nav.cruises')}</NavLink>
        <NavLink to="/leaderboard" className={({ isActive }) => (isActive ? 'active' : '')}>{t('nav.leaderboard')}</NavLink>
        <NavLink to="/chat" className={({ isActive }) => (isActive ? 'active' : '')}>{t('nav.chat')}</NavLink>
        <NavLink to="/contact" className={({ isActive }) => (isActive ? 'active' : '')}>{t('nav.contact')}</NavLink>
      </div>
      <div className="navbar-user">
        {!user.paid_at && (
          <button className="trial-badge" onClick={upgrade} disabled={upgrading}>
            {upgrading ? t('nav.redirecting') : t('nav.trialBadge', { days: daysLeft })}
          </button>
        )}
        <button
          className={`visibility-toggle ${user.visible ? 'on' : 'off'}`}
          onClick={toggleVisibility}
          disabled={toggling}
          title={user.visible ? t('nav.visibilityOnTitle') : t('nav.visibilityOffTitle')}
        >
          <span className="visibility-dot" />
          {user.visible ? t('nav.inGame') : t('nav.offGrid')}
        </button>
        <span className={`status-dot ${connected ? 'online' : 'offline'}`} title={connected ? t('nav.live') : t('nav.reconnecting')} />
        <AvatarPicker />
        <LanguageSwitcher className="navbar-language" />
        <span>{user.nickname}</span>
        <span className="points-badge">{user.points} pts</span>
        <button onClick={logout} className="link-button">{t('nav.logout')}</button>
      </div>
    </nav>
  );
}
