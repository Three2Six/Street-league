import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { mpsToMph } from '../geo.js';

const SCOPES = [
  { key: 'world', label: 'World' },
  { key: 'country', label: 'Country' },
  { key: 'state', label: 'State' },
  { key: 'city', label: 'City' },
];

function formatElapsed(seconds) {
  return `${Number(seconds).toFixed(2)}s`;
}

function formatMph(mps) {
  const mph = mpsToMph(mps);
  return mph == null ? null : `${Math.round(mph)} mph`;
}

function RecordCard({ emoji, label, record, valueLabel }) {
  return (
    <div className="record-card">
      <div className="record-label">{emoji} {label}</div>
      {record ? (
        <>
          <div className="record-value">{valueLabel}</div>
          <div className="muted">{record.nickname} · {record.challenge_name}</div>
        </>
      ) : (
        <div className="muted">No record set yet — be the first.</div>
      )}
    </div>
  );
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [scope, setScope] = useState('world');
  const [value, setValue] = useState(user.city || '');
  const [rows, setRows] = useState([]);
  const [records, setRecords] = useState(null);
  const [wins, setWins] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (scope === 'city') setValue(user.city || '');
    if (scope === 'state') setValue(user.state || '');
    if (scope === 'country') setValue(user.country || '');
  }, [scope, user]);

  useEffect(() => {
    api('/trophies/mine')
      .then(({ wins }) => setWins(wins))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setError('');
    if (scope !== 'world' && !value) {
      setRows([]);
      setRecords(null);
      return;
    }
    const params = new URLSearchParams({ scope });
    if (scope !== 'world') params.set('value', value);
    api(`/leaderboard?${params}`)
      .then(({ leaderboard }) => setRows(leaderboard))
      .catch((err) => setError(err.message));
    api(`/trophies/records?${params}`)
      .then(setRecords)
      .catch(() => setRecords(null));
  }, [scope, value]);

  return (
    <div className="page leaderboard-page">
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

      {records && (
        <div className="records-row">
          <RecordCard
            emoji="⏱️"
            label="Fastest Roll"
            record={records.fastest_roll}
            valueLabel={records.fastest_roll ? formatElapsed(records.fastest_roll.elapsed_seconds) : null}
          />
          <RecordCard
            emoji="🚀"
            label="Top Speed"
            record={records.top_speed}
            valueLabel={records.top_speed ? formatMph(records.top_speed.top_speed_mps) : null}
          />
        </div>
      )}

      <table className="leaderboard-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Driver</th>
            <th>Points</th>
            <th>Wins</th>
            <th>Location</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className={r.id === user.id ? 'me' : ''}>
              <td>{i + 1}</td>
              <td>{r.nickname}</td>
              <td>{r.points}</td>
              <td>{Number(r.wins) > 0 ? `🏆 ${r.wins}` : '—'}</td>
              <td className="muted">{[r.city, r.state, r.country].filter(Boolean).join(', ')}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">No drivers here yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h3 className="trophy-case-heading">Your trophy case</h3>
      {wins.length === 0 ? (
        <p className="muted">No wins yet — take 1st in a challenge and it'll show up here.</p>
      ) : (
        <div className="trophy-list">
          {wins.map((w) => (
            <div key={w.challenge_id} className="trophy-item">
              <span className="trophy-icon">🏆</span>
              <div>
                <div className="trophy-name">{w.challenge_name}</div>
                <div className="muted">
                  {w.mode === 'roll' ? 'Roll race' : 'Point-to-point'} · beat {Math.max(0, w.participant_count - 1)} other
                  {w.participant_count - 1 === 1 ? '' : 's'} · {new Date(w.finished_at).toLocaleDateString()}
                  {w.top_speed_mps != null && ` · ${formatMph(w.top_speed_mps)} top speed`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
