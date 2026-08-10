// Lightweight analytics helper: sends events to GA4 (gtag) and PostHog.
// Analytics must never block or break the user experience.
export const track = (eventName, params = {}) => {
  try {
    window.gtag?.("event", eventName, params);
  } catch (e) {
    // ignore
  }
  try {
    window.posthog?.capture?.(eventName, params);
  } catch (e) {
    // ignore
  }
};
