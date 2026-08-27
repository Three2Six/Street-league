import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useWs } from '../context/WsContext.jsx';
import { useLocation } from '../context/LocationContext.jsx';
import { pruneOldSamples, speedDeltaOverWindow, isLaunch, isLift } from '../rollRace.js';

// Renders nothing — runs app-wide (not tied to any one page) so a roll race you've joined
// keeps timing itself via GPS even while you're looking at the map or chat, not the
// challenges list. That's the point: nobody should have to tap anything mid-race.
export default function RollRaceWatcher() {
  const { user } = useAuth();
  const { subscribe } = useWs();
  const { subscribeSpeed } = useLocation();
  const [rollChallenges, setRollChallenges] = useState([]);

  const load = () =>
    api('/challenges')
      .then(({ challenges }) => setRollChallenges(challenges.filter((c) => c.mode === 'roll' && c.status === 'active')))
      .catch(() => {});

  useEffect(() => {
    load();
    const unsubs = [subscribe('challenge:new', load), subscribe('challenge:update', load), subscribe('challenge:finished', load)];
    return () => unsubs.forEach((fn) => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe]);

  const samplesRef = useRef([]);
  const pendingRef = useRef(new Set()); // challengeIds with an in-flight launch/lift request
  const topSpeedRef = useRef(new Map()); // challengeId -> highest speed seen since launch

  useEffect(() => {
    return subscribeSpeed(({ speedMps, t }) => {
      const samples = pruneOldSamples([...samplesRef.current, { t, speedMps }], t);
      samplesRef.current = samples;
      const delta = speedDeltaOverWindow(samples, t);

      for (const challenge of rollChallenges) {
        const me = challenge.participants.find((p) => p.user_id === user.id);
        if (!me || me.finished_at) continue;
        if (pendingRef.current.has(challenge.id)) continue;

        if (!me.race_started_at) {
          // Off the grid: don't pick up new launches (an in-progress run still gets timed out below).
          if (user.visible && isLaunch(speedMps, delta)) {
            pendingRef.current.add(challenge.id);
            topSpeedRef.current.set(challenge.id, speedMps ?? 0);
            api(`/challenges/${challenge.id}/launch`, { method: 'POST', body: { speed: speedMps } })
              .catch(() => {})
              .finally(() => pendingRef.current.delete(challenge.id));
          }
        } else {
          const prevTop = topSpeedRef.current.get(challenge.id) ?? 0;
          if (speedMps != null && speedMps > prevTop) topSpeedRef.current.set(challenge.id, speedMps);

          const msSinceLaunch = t - Date.parse(me.race_started_at);
          if (isLift(delta, msSinceLaunch)) {
            pendingRef.current.add(challenge.id);
            const topSpeed = topSpeedRef.current.get(challenge.id) ?? speedMps;
            api(`/challenges/${challenge.id}/lift`, { method: 'POST', body: { topSpeed } })
              .catch(() => {})
              .finally(() => pendingRef.current.delete(challenge.id));
          }
        }
      }
    });
  }, [subscribeSpeed, rollChallenges, user.id]);

  return null;
}
