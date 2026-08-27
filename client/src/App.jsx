import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import NavBar from './components/NavBar.jsx';
import RollRaceWatcher from './components/RollRaceWatcher.jsx';
import SignupPage from './pages/SignupPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import MapPage from './pages/MapPage.jsx';
import ChallengesPage from './pages/ChallengesPage.jsx';
import CruisesPage from './pages/CruisesPage.jsx';
import LeaderboardPage from './pages/LeaderboardPage.jsx';
import ChatPage from './pages/ChatPage.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="centered">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();
  return (
    <div className="app">
      {user && <NavBar />}
      {user && <RollRaceWatcher />}
      <div className="app-body">
        <Routes>
          <Route path="/signup" element={user ? <Navigate to="/map" replace /> : <SignupPage />} />
          <Route path="/login" element={user ? <Navigate to="/map" replace /> : <LoginPage />} />
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
