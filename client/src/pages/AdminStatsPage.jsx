import { useState } from 'react';

// Gated by a shared key (ADMIN_KEY on the server) rather than real user auth — this is a
// solo-operator view, not a feature for signed-in drivers, so it lives outside RequireAuth.
export default function AdminStatsPage() {
  const [key, setKey] = useState('');
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/stats?key=${encodeURIComponent(key)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load stats');
      setStats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h2>Beta stats</h2>
      <form className="create-challenge" style={{ maxWidth: 320 }} onSubmit={load}>
        <label>
          Admin key
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        {error && <div className="error-banner">{error}</div>}
        <button type="submit" disabled={loading}>{loading ? 'Loading…' : 'Load stats'}</button>
      </form>

      {stats && (
        <>
          <div className="records-row" style={{ marginTop: 20 }}>
            <div className="record-card">
              <div className="record-label">Signups</div>
              <div className="record-value">{stats.totalSignups}</div>
            </div>
            <div className="record-card">
              <div className="record-label">Unique visitors</div>
              <div className="record-value">{stats.totalVisitors}</div>
            </div>
            <div className="record-card">
              <div className="record-label">Total page views</div>
              <div className="record-value">{stats.totalPageViews}</div>
            </div>
          </div>

          <h3 className="trophy-case-heading">Last 14 days</h3>
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Unique visitors</th>
                <th>Page views</th>
              </tr>
            </thead>
            <tbody>
              {stats.daily.map((d) => (
                <tr key={d.day}>
                  <td>{d.day}</td>
                  <td>{d.visitors}</td>
                  <td>{d.views}</td>
                </tr>
              ))}
              {stats.daily.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">No visits recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
