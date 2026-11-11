// Extension support: load unpacked Chrome extensions (Manifest V2/V3) into the browsing session.
// Pure logic lives here (validation, risk summary, list normalization) so it can be tested without Electron.
const fs = require('fs');
const path = require('path');

// Permissions that let an extension read or change pages/traffic, shown to the user before they enable it.
const RISKY = new Set(['<all_urls>', 'webRequest', 'webRequestBlocking', 'cookies', 'history', 'tabs', 'downloads', 'nativeMessaging', 'proxy', 'management', 'debugger', 'declarativeNetRequest', 'scripting', 'clipboardRead', 'bookmarks']);

function readManifest(dir) {
  const f = path.join(dir, 'manifest.json');
  let raw;
  try { raw = fs.readFileSync(f, 'utf8'); } catch { throw new Error('No manifest.json in that folder. Pick the folder that contains manifest.json.'); }
  let m;
  try { m = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch { throw new Error('manifest.json is not valid JSON.'); }
  return validateManifest(m);
}

function validateManifest(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error('manifest.json must be an object.');
  const v = m.manifest_version;
  if (v !== 2 && v !== 3) throw new Error('Unsupported manifest_version (need 2 or 3).');
  if (typeof m.name !== 'string' || !m.name.trim()) throw new Error('Extension has no name.');
  if (typeof m.version !== 'string' || !m.version.trim()) throw new Error('Extension has no version.');
  const perms = [...(Array.isArray(m.permissions) ? m.permissions : []), ...(Array.isArray(m.host_permissions) ? m.host_permissions : [])]
    .filter(p => typeof p === 'string');
  const hostWide = perms.some(p => p === '<all_urls>' || /^(\*|https?|\*):\/\/\*\/\*$/.test(p));
  const risky = [...new Set(perms.filter(p => RISKY.has(p) || /^(\*|https?):\/\/\*\/\*$/.test(p)))];
  return {
    name: m.name.trim().slice(0, 80), version: m.version.trim().slice(0, 30), manifestVersion: v,
    description: typeof m.description === 'string' && !m.description.startsWith('__MSG_') ? m.description.slice(0, 200) : '',
    permissions: perms.slice(0, 60), risky, allSites: hostWide
  };
}

// Persisted list: [{ id, path, name, version, enabled }]. Drops junk, duplicates and relative paths.
function normalizeList(list) {
  const seen = new Set(), out = [];
  for (const e of Array.isArray(list) ? list : []) {
    if (!e || typeof e.path !== 'string' || !path.isAbsolute(e.path) || seen.has(e.path)) continue;
    seen.add(e.path);
    out.push({ id: String(e.id || ''), path: e.path, name: String(e.name || path.basename(e.path)).slice(0, 80), version: String(e.version || ''), enabled: e.enabled !== false });
  }
  return out;
}

function upsert(list, entry) {
  const l = normalizeList(list).filter(e => e.path !== entry.path);
  l.push({ id: entry.id || '', path: entry.path, name: entry.name, version: entry.version, enabled: entry.enabled !== false });
  return l;
}

module.exports = { readManifest, validateManifest, normalizeList, upsert, RISKY };
