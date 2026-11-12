// Turns whatever is typed in the address bar into a URL to load (or a search). Pure, so it can be unit tested.
const SEARCH = 'https://duckduckgo.com/?q=';
const LOCAL = /^(localhost|127(\.\d{1,3}){3}|\[::1\])(:\d{1,5})?([/?#].*)?$/i;
const HOSTLIKE = /^([a-z0-9-]+\.)+[a-z]{2,}(:\d{1,5})?([/?#]\S*)?$/i; // real-looking domain with a TLD
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}(:\d{1,5})?([/?#]\S*)?$/;

function isLocalHttp(u) { return /^http:\/\/(localhost|127\.|\[::1\])/i.test(u); }

function normalize(input) {
  input = String(input == null ? '' : input).trim();
  if (!input) return null; // nothing typed: do nothing instead of searching for ""
  if (/^about:blank$/i.test(input)) return 'about:blank';
  // Schemes that run code or hide content are never navigated to from the address bar. They become a plain search.
  if (/^(javascript|vbscript|data|blob):/i.test(input)) return SEARCH + encodeURIComponent(input);
  if (/^http:\/\//i.test(input)) return isLocalHttp(input) ? input : input.replace(/^http:/i, 'https:');
  if (/^(https|file|ftp):/i.test(input) && !/\s/.test(input)) return input;
  if (/\s/.test(input)) return SEARCH + encodeURIComponent(input); // spaces mean a search, not a URL
  if (LOCAL.test(input)) return 'http://' + input;               // local dev servers rarely have TLS
  if (HOSTLIKE.test(input) || IPV4.test(input)) return 'https://' + input;
  return SEARCH + encodeURIComponent(input);
}

module.exports = { normalize, SEARCH };
