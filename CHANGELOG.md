# Changelog

## Unreleased
- Pinned tabs: double-click a tab (or Ctrl+Shift+P) to pin it to the front of the tab bar; click the pin to unpin, middle-click closes a tab.
- Downloads manager (⬇ button): downloads auto-save to your Downloads folder with live progress, cancel, open, and show-in-folder; the list persists across restarts. Built on Electron's native download APIs.
- Fixed: internal pages (reader mode, error pages) no longer appear in history.
- New downloads test (real HTTP download, uniquified filenames, cancel flow).
- Windows install guide in README (installer, portable, from source).
- GitHub Actions workflow template (docs/build-windows.yml.txt) builds the Windows .exe installer and portable app.
- App icon.

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
