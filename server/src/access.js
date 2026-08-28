// A user has access if they've paid (once, ever), their free trial hasn't expired yet, or a
// global beta window is open — BETA_ENDS_AT overrides everyone's individual trial with one
// shared deadline, so a whole beta cohort locks down together instead of on staggered signup
// timers. Shared between the HTTP paywall middleware, the WS connection gate, and billing.
export function hasActiveAccess({ paid_at, trial_ends_at }) {
  const betaEndsAt = process.env.BETA_ENDS_AT;
  if (betaEndsAt && new Date() < new Date(betaEndsAt)) return true;
  if (paid_at) return true;
  return Boolean(trial_ends_at) && new Date(trial_ends_at) > new Date();
}
