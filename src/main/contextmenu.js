// Right-click context menu for web pages (Firefox/Chrome style). Pure builder:
// given Chromium's context-menu params it returns plain item descriptors and
// main.js turns those into an Electron Menu. Kept pure so it can be unit tested.

// Only real web links may be opened or copied; javascript:/data: and friends are dropped.
function webLink(u) {
  u = String(u || '');
  return /^https?:\/\//i.test(u) ? u : null;
}

// DuckDuckGo is the default engine (see urlinput.js). Long selections are
// shortened in the label only; the full text is still searched.
function searchLabel(text) {
  const t = text.length > 24 ? text.slice(0, 24) + '…' : text;
  return `Search DuckDuckGo for “${t}”`;
}

// params: { linkURL, srcURL, mediaType, selectionText, isEditable, canBack, canFwd }
// Returns [{id, label, enabled?, link?|query?} | {type:'separator'}]. Never empty:
// the page navigation items (back/forward/reload/inspect) are always present.
function build(params) {
  const p = params || {};
  const items = [];
  // Inside a text field the clipboard actions replace everything else.
  if (p.isEditable) {
    items.push({ id: 'cut', label: 'Cut' }, { id: 'copy', label: 'Copy' },
      { id: 'paste', label: 'Paste' }, { id: 'select-all', label: 'Select all' });
    return items;
  }
  const link = webLink(p.linkURL);
  if (link) items.push({ id: 'open-link', label: 'Open link in new tab', link },
    { id: 'copy-link', label: 'Copy link address', link }, { type: 'separator' });
  const img = p.mediaType === 'image' ? webLink(p.srcURL) : null;
  if (img) items.push({ id: 'copy-image', label: 'Copy image address', link: img }, { type: 'separator' });
  const sel = String(p.selectionText || '').trim();
  if (sel) items.push({ id: 'copy', label: 'Copy' },
    { id: 'search', label: searchLabel(sel), query: sel }, { type: 'separator' });
  items.push({ id: 'back', label: 'Back', enabled: !!p.canBack },
    { id: 'forward', label: 'Forward', enabled: !!p.canFwd },
    { id: 'reload', label: 'Reload' }, { type: 'separator' },
    { id: 'inspect', label: 'Inspect element' });
  return items;
}

module.exports = { build, searchLabel, webLink };
