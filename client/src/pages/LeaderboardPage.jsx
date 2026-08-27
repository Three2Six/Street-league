import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

const SCOPES = [
  { key: 'world', label: 'World' },
  { key: 'country', label: 'Country' },
  { key: 'state', label: 'State' },
  { key: 'city', label: 'City' },
];

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [scope, setScope] = useState('world');
  const [value, setValue] = useState(user.city || '');
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (scope === 'city') setValue(user.city || '');
    if (scope === 'state') setValue(user.state || '');
    if (scope === 'country') setValue(user.country || '');
  }, [scope, user]);

  useEffect(() => {
    setError('');
    if (scope !== 'world' && !value) {
      setRows([]);
      return;
    }
    const params = new URLSearchParams({ scope });
    if (scope !== 'world') params.set('value', value);
    api(`/leaderboard?${params}`)
      .then(({ leaderboard }) => setRows(leaderboard))
      .catch((err) => setError(err.message));
  }, [scope, value]);

  return (
    <div className="page">
      <h2>Scoreboard</h2>
      <div className="scope-tabs">
        {SCOPES.map((s) => (
          <button key={s.key} className={scope === s.key ? 'active' : ''} onClick={() => setScope(s.key)}>
            {s.label}
          </button>
        ))}
      </div>
      {scope !== 'world' && (
        <input
          className="scope-value-input"
          placeholder={`${SCOPES.find((s) => s.key === scope).label} name`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      )}
      {error && <div className="error-banner">{error}</div>}
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Driver</th>
            <th>Points</th>
            <th>Location</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className={r.id === user.id ? 'me' : ''}>
              <td>{i + 1}</td>
              <td>{r.nickname}</td>
              <td>{r.points}</td>
              <td className="muted">{[r.city, r.state, r.country].filter(Boolean).join(', ')}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">No drivers here yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
