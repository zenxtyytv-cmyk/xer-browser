// Gaming / cloud-gaming performance profile.
// What the BROWSER can control: its own frame cap, decode path, throttling and input latency.
// What it cannot: the frame rate the cloud server streams (GeForce NOW, Xbox Cloud, Luna, etc.)
// or your network. These settings remove Xer's own bottlenecks so the stream is shown at its
// full rate and with minimal added latency.
const DEFAULTS = {
  enabled: false,            // Game Mode on at launch
  uncapFps: true,            // disable vsync / frame-rate limit (needs restart)
  gpuDecode: true,           // hardware video decode + raster (needs restart)
  lowLatency: true,          // render sooner, fewer queued frames (needs restart)
  keepAlive: true,           // never throttle the active tab, even when unfocused
  hideOverlayDefault: false, // FPS overlay visible when Game Mode is on
  blockPrompts: true,        // suppress permission prompts while playing
  pauseBlockerStats: true    // skip UI stat updates while playing
};

function normalize(c) {
  const out = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (c && typeof c[k] === 'boolean') out[k] = c[k];
  return out;
}

// Chromium switches for a config. Pure: returns [[name, value?], ...].
function switches(cfg, platform = process.platform) {
  const c = normalize(cfg);
  if (!c.enabled) return [];
  const s = [];
  if (c.uncapFps) {
    s.push(['disable-frame-rate-limit']);
    s.push(['disable-gpu-vsync']);
  }
  if (c.gpuDecode) {
    s.push(['ignore-gpu-blocklist']);
    s.push(['enable-gpu-rasterization']);
    s.push(['enable-zero-copy']);
    s.push(['enable-accelerated-video-decode']);
  }
  const feats = [];
  if (c.gpuDecode) {
    if (platform === 'win32') feats.push('D3D11VideoDecoder');
    if (platform === 'linux') feats.push('VaapiVideoDecoder', 'VaapiIgnoreDriverChecks');
    feats.push('CanvasOopRasterization');
  }
  if (c.lowLatency) feats.push('UseSkiaRenderer', 'RawDraw');
  if (feats.length) s.push(['enable-features', [...new Set(feats)].join(',')]);
  if (c.keepAlive) {
    s.push(['disable-renderer-backgrounding']);
    s.push(['disable-background-timer-throttling']);
    s.push(['disable-backgrounding-occluded-windows']);
  }
  return s;
}

// Merge our `enable-features` with ones already set (Chromium only honors the LAST switch).
function mergeFeatureSwitches(existing, extra) {
  const set = new Set();
  [existing, extra].forEach(v => (v || '').split(',').map(x => x.trim()).filter(Boolean).forEach(x => set.add(x)));
  return [...set].join(',');
}

// Which parts need a restart to take effect.
const RESTART_KEYS = ['enabled', 'uncapFps', 'gpuDecode', 'lowLatency', 'keepAlive'];
function needsRestart(oldCfg, newCfg) {
  const a = normalize(oldCfg), b = normalize(newCfg);
  return RESTART_KEYS.some(k => a[k] !== b[k]);
}

// Injected into the ACTIVE game page: measures real frames/second via requestAnimationFrame
// and draws a tiny overlay. Pure page script, no Node access, removable.
const OVERLAY_ID = '__xer_fps__';
const overlayScript = () => `(() => {
  if (window.${OVERLAY_ID}) return 'already';
  const el = document.createElement('div');
  el.id = '${OVERLAY_ID}';
  el.style.cssText = 'position:fixed;top:8px;left:8px;z-index:2147483647;font:600 12px/1.3 monospace;color:#7cf0b0;background:rgba(0,0,0,.6);padding:4px 8px;border-radius:6px;pointer-events:none;white-space:pre';
  document.documentElement.appendChild(el);
  let frames = 0, last = performance.now(), worst = 0, prev = last, raf = 0, dead = false;
  const loop = (t) => {
    if (dead) return;
    frames++; worst = Math.max(worst, t - prev); prev = t;
    if (t - last >= 500) {
      const fps = Math.round(frames * 1000 / (t - last));
      el.textContent = fps + ' fps\\n' + worst.toFixed(1) + ' ms worst frame';
      frames = 0; worst = 0; last = t;
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  window.${OVERLAY_ID} = { stop() { dead = true; cancelAnimationFrame(raf); el.remove(); delete window.${OVERLAY_ID}; } };
  return 'started';
})()`;
const overlayOffScript = () => `(() => { if (window.${OVERLAY_ID}) { window.${OVERLAY_ID}.stop(); return 'stopped'; } return 'none'; })()`;

module.exports = { DEFAULTS, normalize, switches, mergeFeatureSwitches, needsRestart, overlayScript, overlayOffScript, OVERLAY_ID };
