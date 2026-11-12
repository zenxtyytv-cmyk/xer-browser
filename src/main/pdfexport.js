// Save-page-as-PDF helpers. Pure logic (file naming + print options) so it can be unit tested without Electron.
const path = require('path');

const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

// Turns a page title (or URL host) into a safe file name ending in .pdf.
function safeName(title, url) {
  let base = String(title || '').trim();
  if (!base) { try { base = new URL(url).hostname; } catch { base = ''; } }
  base = base.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^\.+/, '').replace(/[ .]+$/, '').slice(0, 80).trim();
  if (!base || WIN_RESERVED.test(base)) base = 'page';
  return base + '.pdf';
}

// Only real web pages and local files can be printed. Internal pages, data: pages and the new-tab page cannot.
function canPrint(url) {
  const u = String(url || '');
  if (/^https?:/i.test(u)) return true;
  if (/^data:text\/html/i.test(u)) return true; // reader-mode pages
  return false;
}

function pdfOptions() {
  return { printBackground: true, preferCSSPageSize: true, margins: { marginType: 'default' } };
}

// True when the bytes look like a PDF (header and end marker).
function looksLikePdf(buf) {
  if (!buf || buf.length < 20) return false;
  const head = Buffer.from(buf.subarray(0, 5)).toString('latin1');
  const tail = Buffer.from(buf.subarray(Math.max(0, buf.length - 1024))).toString('latin1');
  return head === '%PDF-' && tail.includes('%%EOF');
}

// Never overwrite silently: foo.pdf -> foo (1).pdf when the file exists. `exists` is injected for testing.
function uniquePath(dir, name, exists) {
  const ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
  let p = path.join(dir, name), n = 1;
  while (exists(p) && n < 1000) p = path.join(dir, `${stem} (${n++})${ext}`);
  return p;
}

module.exports = { safeName, canPrint, pdfOptions, looksLikePdf, uniquePath };
