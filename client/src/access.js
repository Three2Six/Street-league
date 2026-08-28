// Mirrors server/src/access.js — a driver has access if they've paid (once, ever) or their
// free trial hasn't expired yet.
export function hasActiveAccess(user) {
  if (!user) return false;
  if (user.paid_at) return true;
  return Boolean(user.trial_ends_at) && new Date(user.trial_ends_at) > new Date();
}

export function trialDaysLeft(user) {
  if (!user?.trial_ends_at) return 0;
  const ms = new Date(user.trial_ends_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
