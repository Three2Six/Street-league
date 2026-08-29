import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageBackground from '../components/PageBackground.jsx';

const FEATURES = [
  {
    title: 'Live Map',
    blurb: "See every driver near you, right now.",
    icon: <path d="M12 21s-7-7.2-7-12a7 7 0 0 1 14 0c0 4.8-7 12-7 12z M12 9v.01" />,
  },
  {
    title: 'Challenges',
    blurb: 'Point-to-point or roll race. Timed. Ranked.',
    icon: <path d="M5 21V4 M5 5h12l-2.2 4L17 13H5" />,
  },
  {
    title: 'Cruises',
    blurb: 'Plan the meet, location drops day-of.',
    icon: <path d="M3 20 9 4M18 20 12 4 M8.2 13h3.6" />,
  },
  {
    title: 'Chat',
    blurb: "Your city line, plus global. Know who's out.",
    icon: <path d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4 8.3 8.3 0 0 1-3.8-.9L3 21l1.9-5.8a8.3 8.3 0 0 1-.9-3.8A8.4 8.4 0 0 1 12.6 3a8.4 8.4 0 0 1 8.4 8.4z" />,
  },
  {
    title: 'SOS',
    blurb: 'One tap alerts every driver within 10 miles.',
    icon: <path d="M12 9v4.5M12 17h.01 M10.6 3.9-8.5 14A1.8 1.8 0 0 0 3.7 20.7h16.6a1.8 1.8 0 0 0 1.6-2.8l-8.5-14a1.8 1.8 0 0 0-3.1 0z" />,
  },
];

export default function LandingPage() {
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
      <div className="landing-content">
        <img src="/logo-badge.png" alt="Street League" className="landing-logo" />

        <div className="landing-badge">BETA &middot; FREE WEEK-LONG ACCESS</div>

        <h1 className="landing-headline">
          Pull Up. <span className="landing-accent">Throw Down.</span> Run The Board.
        </h1>

        {signups != null && signups > 0 && (
          <div className="landing-counter">{signups} driver{signups === 1 ? '' : 's'} already in the beta</div>
        )}

        <div className="landing-features">
          {FEATURES.map((f) => (
            <div className="landing-feature-row" key={f.title}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ff5a36" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {f.icon}
              </svg>
              <div>
                <strong>{f.title}</strong>
                <span className="muted"> &mdash; {f.blurb}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="landing-points">
          <div className="landing-points-title">Every Race Counts</div>
          <div>
            Win a challenge, win a cruise &mdash; stack points and climb the board.
            <strong> City &rarr; State &rarr; Country &rarr; World.</strong>
          </div>
        </div>

        <div className="landing-cta">
          <Link to="/signup" className="landing-cta-button">Join The Beta &mdash; Free</Link>
          <p className="auth-switch">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
          <p className="auth-switch">
            <Link to="/contact">Contact us</Link> &middot; <Link to="/disclaimer">Disclaimer</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
