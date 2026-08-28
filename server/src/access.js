// A user has access if they've paid (once, ever) or their free trial hasn't expired yet.
// Shared between the HTTP paywall middleware, the WS connection gate, and the billing webhook.
export function hasActiveAccess({ paid_at, trial_ends_at }) {
  if (paid_at) return true;
  return Boolean(trial_ends_at) && new Date(trial_ends_at) > new Date();
}
