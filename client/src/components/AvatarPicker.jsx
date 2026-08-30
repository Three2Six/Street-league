import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';
import { STANDARD_AVATARS, FOUNDER_AVATARS } from '../avatars.js';

const FOUNDER_AVATAR_LABEL_KEYS = { '👻': 'avatar.ghost', '🐌': 'avatar.snail' };

// A small popover on the navbar letting a driver pick which car/vehicle marks them on the map.
export default function AvatarPicker() {
  const { t } = useTranslation();
  const { user, setAvatar } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const pick = async (avatar) => {
    if (avatar === user.avatar) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await setAvatar(avatar);
      setOpen(false);
    } catch {
      // transient network hiccup — picker stays open so the driver can just try again
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="avatar-picker">
      <button className="avatar-picker-trigger" onClick={() => setOpen((o) => !o)} title={t('avatar.chooseMarker')}>
        {user.avatar || '🚗'}
      </button>
      {open && (
        <>
          <div className="avatar-picker-backdrop" onClick={() => setOpen(false)} />
          <div className="avatar-picker-menu">
            {STANDARD_AVATARS.map((a) => (
              <button
                key={a}
                className={`avatar-option ${a === user.avatar ? 'active' : ''}`}
                disabled={busy}
                onClick={() => pick(a)}
              >
                {a}
              </button>
            ))}
            {user.founder && (
              <>
                <div className="avatar-picker-divider">{t('avatar.founderExclusive')}</div>
                {FOUNDER_AVATARS.map((a) => (
                  <button
                    key={a}
                    className={`avatar-option founder ${a === user.avatar ? 'active' : ''}`}
                    disabled={busy}
                    onClick={() => pick(a)}
                    title={t(FOUNDER_AVATAR_LABEL_KEYS[a])}
                  >
                    {a}
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
