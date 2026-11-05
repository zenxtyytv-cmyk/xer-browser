// Address-bar suggestion ranking. Pure function: easy to test, no I/O.
// Score: host-prefix match > host contains > title prefix > title/url contains.
// Bookmarks get a boost; recent history entries get a small recency bonus.
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }

function score(q, title, url, src, idx) {
  const host = hostOf(url), t = (title || '').toLowerCase(), u = url.toLowerCase();
  let s = 0;
  if (host.startsWith(q)) s = 100;
  else if (host.includes(q)) s = 70;
  else if (t.startsWith(q)) s = 60;
  else if (t.includes(q)) s = 40;
  else if (u.includes(q)) s = 25;
  else return -1;
  if (src === 'bookmark') s += 30;
  if (src === 'history') s += Math.max(0, 10 - Math.floor(idx / 50)); // newer = higher
  return s;
}

function suggest(q, history, bookmarks, limit = 8) {
  q = (q || '').trim().toLowerCase();
  if (!q) return [];
  const best = new Map(); // url -> {title,url,src,score}
  const consider = (title, url, src, idx) => {
    if (!url || !/^https?:/.test(url)) return;
    const sc = score(q, title, url, src, idx);
    if (sc < 0) return;
    const cur = best.get(url);
    if (!cur || sc > cur.score) best.set(url, { title: title || url, url, src, score: sc });
  };
  (bookmarks || []).forEach((b, i) => consider(b.title, b.url, 'bookmark', i));
  (history || []).slice(0, 500).forEach((h, i) => consider(h.title, h.url, 'history', i));
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit)
    .map(({ title, url, src }) => ({ title, url, src }));
}
module.exports = { suggest, score, hostOf };
