import { getToken } from './api.js';

const VISITOR_KEY = 'street_league_visitor_id';

function getVisitorId() {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

// Fire-and-forget — a tracking failure should never affect the actual app experience.
export function trackPageView(path) {
  const token = getToken();
  fetch('/api/track', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ visitorId: getVisitorId(), path }),
  }).catch(() => {});
}
