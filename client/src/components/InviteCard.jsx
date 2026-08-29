import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function InviteCard() {
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api('/auth/referral').then(setData).catch(() => {});
  }, []);

  if (!data) return null;

  const link = `${window.location.origin}/signup?ref=${data.code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard permission denied — the link is still selectable/visible in the input
    }
  };

  return (
    <div className="invite-card">
      <div className="invite-card-title">Invite friends, earn points</div>
      <p className="muted">Every driver who joins with your link earns you bonus points.</p>
      <div className="invite-link-row">
        <input readOnly value={link} onFocus={(e) => e.target.select()} />
        <button type="button" onClick={copy}>{copied ? 'Copied!' : 'Copy link'}</button>
      </div>
      {data.referredCount > 0 && (
        <div className="muted invite-stats">
          {data.referredCount} driver{data.referredCount === 1 ? '' : 's'} joined via your link · {data.pointsEarned} pts earned
        </div>
      )}
    </div>
  );
}
