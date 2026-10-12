// Built-in tracker/ad/telemetry blocking (no extension needed).
const BLOCKED_HOSTS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'google-analytics.com', 'googletagmanager.com', 'googletagservices.com',
  'adservice.google.com', 'facebook.net', 'connect.facebook.net',
  'scorecardresearch.com', 'hotjar.com', 'mixpanel.com', 'segment.io',
  'amplitude.com', 'taboola.com', 'outbrain.com', 'adnxs.com',
  'criteo.com', 'quantserve.com', 'bugsnag.com', 'fullstory.com',
  'clarity.ms', 'ads.twitter.com', 'analytics.tiktok.com',
  // Chromium/Google phone-home endpoints
  'clients2.google.com', 'update.googleapis.com', 'safebrowsing.googleapis.com',
  'cloudsearch.googleapis.com', 'crash-reports.chromium.org'
];

function isBlocked(urlStr) {
  try {
    const host = new URL(urlStr).hostname;
    return BLOCKED_HOSTS.some(h => host === h || host.endsWith('.' + h));
  } catch { return false; }
}
module.exports = { isBlocked, BLOCKED_HOSTS };
