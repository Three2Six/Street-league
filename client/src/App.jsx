import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { hasActiveAccess } from './access.js';
import { trackPageView } from './track.js';
import NavBar from './components/NavBar.jsx';
import RollRaceWatcher from './components/RollRaceWatcher.jsx';
import SignupPage from './pages/SignupPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import MapPage from './pages/MapPage.jsx';
import ChallengesPage from './pages/ChallengesPage.jsx';
import CruisesPage from './pages/CruisesPage.jsx';
import LeaderboardPage from './pages/LeaderboardPage.jsx';
import ChatPage from './pages/ChatPage.jsx';
import ContactPage from './pages/ContactPage.jsx';
import PaywallPage from './pages/PaywallPage.jsx';
import BillingSuccessPage from './pages/BillingSuccessPage.jsx';
import AdminStatsPage from './pages/AdminStatsPage.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="centered">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!hasActiveAccess(user)) return <PaywallPage />;
  return children;
}

// Only needs a logged-in user, not active access — used for the billing flow itself, since a
// driver arriving here is either mid-checkout or has just paid and isn't "active" yet.
function RequireLogin({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="centered">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();
  const active = hasActiveAccess(user);
  const location = useLocation();

  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  return (
    <div className="app">
      {user && active && <NavBar />}
      {user && active && <RollRaceWatcher />}
      <div className="app-body">
        <Routes>
          <Route path="/signup" element={user ? <Navigate to="/map" replace /> : <SignupPage />} />
          <Route path="/login" element={user ? <Navigate to="/map" replace /> : <LoginPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/admin/stats" element={<AdminStatsPage />} />
          <Route
            path="/billing/success"
            element={
              <RequireLogin>
                <BillingSuccessPage />
              </RequireLogin>
            }
          />
          <Route path="/billing/cancel" element={<Navigate to="/map" replace />} />
          <Route
            path="/map"
            element={
              <RequireAuth>
                <MapPage />
              </RequireAuth>
            }
          />
          <Route
            path="/challenges"
            element={
              <RequireAuth>
                <ChallengesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/cruises"
            element={
              <RequireAuth>
                <CruisesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/leaderboard"
            element={
              <RequireAuth>
                <LeaderboardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/chat"
            element={
              <RequireAuth>
                <ChatPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to={user ? '/map' : '/login'} replace />} />
        </Routes>
      </div>
    </div>
  );
}
