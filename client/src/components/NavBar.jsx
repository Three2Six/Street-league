import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useWs } from '../context/WsContext.jsx';

export default function NavBar() {
  const { user, logout, setVisible } = useAuth();
  const { connected } = useWs();
  const [toggling, setToggling] = useState(false);

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
      <div className="navbar-brand">🏁 Street League</div>
      <div className="navbar-links">
        <NavLink to="/map" className={({ isActive }) => (isActive ? 'active' : '')}>Map</NavLink>
        <NavLink to="/challenges" className={({ isActive }) => (isActive ? 'active' : '')}>Challenges</NavLink>
        <NavLink to="/leaderboard" className={({ isActive }) => (isActive ? 'active' : '')}>Leaderboard</NavLink>
        <NavLink to="/chat" className={({ isActive }) => (isActive ? 'active' : '')}>Chat</NavLink>
      </div>
      <div className="navbar-user">
        <button
          className={`visibility-toggle ${user.visible ? 'on' : 'off'}`}
          onClick={toggleVisibility}
          disabled={toggling}
          title={user.visible ? "You're visible on the map and open to races — click to go off the grid" : "You're hidden and unreachable for races — click to rejoin the game"}
        >
          <span className="visibility-dot" />
          {user.visible ? 'In the game' : 'Off the grid'}
        </button>
        <span className={`status-dot ${connected ? 'online' : 'offline'}`} title={connected ? 'Live' : 'Reconnecting…'} />
        <span>{user.nickname}</span>
        <span className="points-badge">{user.points} pts</span>
        <button onClick={logout} className="link-button">Log out</button>
      </div>
    </nav>
  );
}
