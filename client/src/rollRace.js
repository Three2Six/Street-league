// Roll-race launch/lift detection: a "launch" is GPS speed rising sharply over a short
// window (foot to the floor), a "lift" is speed dropping sharply (backed off/braked) —
// no fixed start/finish line needed, matching how a real roll race actually happens.

export const WINDOW_MS = 1000; // how far back we look to measure the speed change
export const LAUNCH_DELTA_MPS = 4; // ~9 mph gained within WINDOW_MS counts as a launch
export const LIFT_DELTA_MPS = -4; // ~9 mph lost within WINDOW_MS counts as a lift
export const MIN_ROLLING_MPS = 4; // ~9 mph — must already be rolling for a speed rise to count as a launch
export const MIN_RUN_MS = 800; // ignore lift triggers this soon after launch (debounces GPS jitter)
export const SAMPLE_MAX_AGE_MS = 3000;

export function pruneOldSamples(samples, now, maxAgeMs = SAMPLE_MAX_AGE_MS) {
  return samples.filter((s) => now - s.t <= maxAgeMs);
}

// Speed delta between the newest sample and the closest sample ~WINDOW_MS before it.
// Returns null when there isn't enough history yet, or either sample has no speed reading.
export function speedDeltaOverWindow(samples, now, windowMs = WINDOW_MS) {
  if (samples.length === 0) return null;
  const current = samples[samples.length - 1];
  if (current.speedMps == null) return null;

  const target = now - windowMs;
  let older = null;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (samples[i].t <= target) {
      older = samples[i];
      break;
    }
  }
  if (!older || older.speedMps == null) return null;
  return current.speedMps - older.speedMps;
}

export function isLaunch(currentSpeedMps, delta) {
  return currentSpeedMps != null && currentSpeedMps >= MIN_ROLLING_MPS && delta != null && delta >= LAUNCH_DELTA_MPS;
}

export function isLift(delta, msSinceLaunch) {
  return delta != null && delta <= LIFT_DELTA_MPS && msSinceLaunch >= MIN_RUN_MS;
}
