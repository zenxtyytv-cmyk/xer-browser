const g = require('../src/main/gaming');
let f = 0; const ck = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) f++; };
const names = (cfg, plat) => g.switches(cfg, plat).map(x => x[0]);

ck('disabled => no switches at all', g.switches({ enabled: false }).length === 0 && g.switches(null).length === 0);
ck('defaults are safe (off)', g.DEFAULTS.enabled === false);
ck('enabled => uncap flags', names({ enabled: true }).includes('disable-frame-rate-limit') && names({ enabled: true }).includes('disable-gpu-vsync'));
ck('uncapFps=false drops them', !names({ enabled: true, uncapFps: false }).includes('disable-frame-rate-limit'));
ck('keepAlive adds anti-throttle flags', ['disable-renderer-backgrounding', 'disable-background-timer-throttling', 'disable-backgrounding-occluded-windows'].every(x => names({ enabled: true }).includes(x)));
ck('keepAlive=false drops anti-throttle', !names({ enabled: true, keepAlive: false }).includes('disable-renderer-backgrounding'));

const feat = (cfg, plat) => (g.switches(cfg, plat).find(x => x[0] === 'enable-features') || [])[1] || '';
ck('windows gets D3D11 decoder', feat({ enabled: true }, 'win32').includes('D3D11VideoDecoder'));
ck('linux gets VAAPI decoder', feat({ enabled: true }, 'linux').includes('VaapiVideoDecoder'));
ck('mac gets neither platform decoder', !/D3D11|Vaapi/.test(feat({ enabled: true }, 'darwin')));
ck('no duplicate features', (() => { const l = feat({ enabled: true }, 'win32').split(','); return l.length === new Set(l).size; })());

// CRITICAL: Chromium only honors the LAST --enable-features, so we must merge with DnsOverHttps
const merged = g.mergeFeatureSwitches('DnsOverHttps', feat({ enabled: true }, 'win32'));
ck('merge keeps DnsOverHttps', merged.split(',').includes('DnsOverHttps'));
ck('merge keeps gaming features', merged.includes('D3D11VideoDecoder'));
ck('merge dedupes', g.mergeFeatureSwitches('A,B', 'B,C') === 'A,B,C');
ck('merge handles empty', g.mergeFeatureSwitches('', undefined) === '');

ck('normalize ignores junk', (() => { const n = g.normalize({ enabled: 'yes', uncapFps: 5, bogus: true }); return n.enabled === false && n.uncapFps === true && !('bogus' in n); })());
ck('normalize accepts booleans', g.normalize({ enabled: true, uncapFps: false }).uncapFps === false);

ck('restart needed when flags change', g.needsRestart({ enabled: false }, { enabled: true }) && g.needsRestart({ uncapFps: true }, { uncapFps: false }));
ck('no restart for UI-only prefs', !g.needsRestart({ blockPrompts: true }, { blockPrompts: false }) && !g.needsRestart({ hideOverlayDefault: false }, { hideOverlayDefault: true }));
ck('no restart when unchanged', !g.needsRestart({ enabled: true }, { enabled: true }));

// overlay scripts are valid JS, self-contained, and idempotent
ck('overlay script parses', (() => { try { new Function('return ' + g.overlayScript()); return true; } catch { return false; } })());
ck('overlay off script parses', (() => { try { new Function('return ' + g.overlayOffScript()); return true; } catch { return false; } })());
ck('overlay has no network/eval/Node access', !/fetch\(|XMLHttp|eval\(|require\(|import\(/.test(g.overlayScript()));
ck('overlay is guarded against double-start', g.overlayScript().includes('already'));
console.log(f ? f + ' FAILED' : 'ALL PASSED'); process.exit(f ? 1 : 0);
