# Changelog

## 0.5.0
- Downloads manager (Ctrl+Shift+J or the ⬇ toolbar button): auto-saves to your Downloads folder with live progress, cancel, open, show-in-folder, a live badge while downloading, and a list that persists across restarts.
- Session restore: open web tabs are saved on quit and restored on the next launch (Firefox-style).
- Pinned tabs: double-click a tab, right-click it, or press Ctrl+Shift+P. Pinned tabs sit first in the bar and show as compact favicon tabs.
- Reopen closed tab (Ctrl+Shift+T or the tab context menu): keeps the last 25 closed web tabs.
- Per-tab favicons, loading state, right-click tab menu (Reload / Duplicate / Pin / Close / Reopen closed), middle-click to close.
- Awesomebar: address-bar suggestions from local history and bookmarks, computed on-device (nothing is uploaded).
- Fixed: internal pages (reader mode, error pages) no longer appear in history.
- Merged the feature branch with main: one downloads implementation (downloads.js) and one pin implementation (pins.js) instead of two competing ones.
- New downloads and pins tests.
- Fixed: bookmarks, history, session and permissions are now saved atomically (temp file + rename, with a .bak fallback), so a crash or kill mid-save can no longer wipe them.
- Session restore keeps pinned tabs, autosaves after changes, and never overwrites a good session with an empty one during shutdown.
- Awesomebar ranking: host and prefix matches first, bookmarks boosted, recent history favored (suggest.js, unit tested).
- Tests: one command (npm test) runs all 10 suites; tests use isolated profiles and wait for startup instead of fixed sleeps.
- Windows install guide in README (portable zip, from source, build your own) and a GitHub Actions template for the .exe installer.
- App icon.
- Open-source inspiration: Zen Browser (compact pinned tabs), Firefox (awesomebar, session restore), Brave (privacy-first defaults).

## 0.4.0
- Reader mode (📖 toolbar button): clean, distraction-free article view using Mozilla Readability (Apache-2.0), same engine as Firefox.
- Fixed: internal new-tab/error pages can no longer be bookmarked.
- New reader-mode test with a fixture article.
- Proxy / VPN manager: SOCKS5/HTTP(S) proxies with auth, system proxy mode, exit-IP check. Works with VPN providers' proxy endpoints, Tor, or a local WireGuard/OpenVPN SOCKS port.
- Encrypted DNS (DNS-over-HTTPS) toggle.
- Local AI provider via Ollama (run any model you pull yourself) as an alternative to Claude.
- Customizable dashboard: widgets (clock, search, quick links, notes, to-do, privacy stats, bookmarks, pomodoro, calculator), reorder/resize/remove, theme colors, corner radius, wallpaper.
- Settings page. Safe calculator parser (no eval).
- Internal-page API is only exposed to our bundled pages (exact path check), never to websites. Verified by test/security.js.
- New feature tests, including a real proxy-routing test.

## 0.3.0
- Upgraded to Electron 39 (Chromium 142).
- Integrated Ghostery adblocker engine (MPL-2.0): EasyList + EasyPrivacy filter lists, cached locally. Built-in host list kept as fallback.

## 0.2.0
- Bookmarks, history, find-in-page, zoom, devtools, tab cycling.
- Per-site permission prompts with remembered choices.
- Friendly error page for failed loads.
- Claude quick actions: summarize, explain, extract, safety check.
- Smoke + e2e tests.

## 0.1.0
- Initial scaffold: tabs, privacy defaults, Claude sidebar.
