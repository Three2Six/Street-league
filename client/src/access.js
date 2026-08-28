// The server computes this (server/src/access.js) and sends it as user.active — it depends on
// BETA_ENDS_AT, a server-only env var, so the client can't safely re-derive it itself.
export function hasActiveAccess(user) {
  return Boolean(user?.active);
}

export function trialDaysLeft(user) {
  if (!user?.trial_ends_at) return 0;
  const ms = new Date(user.trial_ends_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
