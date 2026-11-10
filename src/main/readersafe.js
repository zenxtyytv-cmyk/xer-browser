// Reader-mode HTML sanitizer. Readability removes <script> but keeps attributes such as onerror=,
// so article HTML must be cleaned before it is shown. Pure string code (no Electron), allowlist based.
const TAGS = new Set(['p','br','hr','h1','h2','h3','h4','h5','h6','ul','ol','li','blockquote','pre','code','em','strong','b','i','u','s','sub','sup','small','a','img','figure','figcaption','table','thead','tbody','tfoot','tr','td','th','caption','div','span','section','article','dl','dt','dd','mark','abbr','cite','q','time']);
const ATTRS = { a: ['href', 'title'], img: ['src', 'alt', 'title', 'width', 'height'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'], abbr: ['title'], time: ['datetime'], q: ['cite'], blockquote: ['cite'] };
const DROP_WHOLE = /<(script|style|iframe|object|embed|noscript|template|svg|math|form|link|meta|base|frame|frameset|applet)\b[\s\S]*?<\/\1\s*>/gi;
const DROP_OPEN = /<\/?(script|style|iframe|object|embed|noscript|template|svg|math|form|input|button|textarea|select|link|meta|base|frame|frameset|applet)\b[^>]*>/gi;

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function unesc(s) { return String(s).replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }

// Only http(s) links and http(s)/data:image images survive. Control chars and whitespace are removed before the check
// so "java\nscript:" style tricks do not slip through.
function safeUrl(v, isImg) {
  const u = unesc(v).replace(/[\u0000-\u0020\u007f-\u009f]/g, '');
  if (/^https?:/i.test(u)) return u;
  if (isImg && /^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=]+$/i.test(u)) return u;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u) && u && !u.startsWith('//')) return u; // relative path
  if (u.startsWith('//')) return 'https:' + u;
  return null;
}

function cleanTag(m, close, name, rest) {
  name = name.toLowerCase();
  if (!TAGS.has(name)) return '';
  if (close) return '</' + name + '>';
  const allowed = ATTRS[name] || [];
  let out = '';
  const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let a;
  while ((a = re.exec(rest))) {
    const an = a[1].toLowerCase(); const av = a[2] ?? a[3] ?? a[4] ?? '';
    if (!allowed.includes(an)) continue;
    let val = av;
    if (an === 'href' || an === 'src') { val = safeUrl(av, name === 'img'); if (val == null) continue; }
    else val = unesc(av);
    out += ` ${an}="${esc(val)}"`;
  }
  if (name === 'a') out += ' rel="noopener noreferrer nofollow" target="_blank"';
  if (name === 'img') out += ' referrerpolicy="no-referrer" loading="lazy"';
  return '<' + name + out + (/\/\s*$/.test(rest) && name === 'img' ? ' /' : '') + '>';
}

function sanitize(html) {
  let s = String(html == null ? '' : html);
  s = s.replace(/<!--[\s\S]*?-->/g, '').replace(/<![^>]*>/g, '').replace(/<\?[\s\S]*?\?>/g, '');
  let prev; do { prev = s; s = s.replace(DROP_WHOLE, ''); } while (s !== prev); // nested/stacked tricks
  s = s.replace(DROP_OPEN, '');
  s = s.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g, cleanTag);
  s = s.replace(/<(?![\/a-zA-Z])/g, '&lt;'); // stray "<" that is not a tag
  return s;
}

// Content-Security-Policy for the reader page itself: no scripts, no plugins, images only over http(s)/data.
const READER_CSP = "default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

module.exports = { sanitize, safeUrl, READER_CSP };
