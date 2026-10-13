# Xer Browser

A privacy-first browser built on the Chromium engine (via Electron), with Claude as the built-in assistant.

## Features
- Tabs, URL/search bar (DuckDuckGo default), keyboard shortcuts (Ctrl+T, Ctrl+W, Ctrl+L, Ctrl+J)
- Built-in ad/tracker blocking with a live counter
- Removed Chromium/Google extras: sync, telemetry, crash reporting, auto-update pings, Translate, FLoC/Topics, Media Router, X-Client-Data header
- Auto-upgrade HTTP to HTTPS, DNT + GPC headers, cross-origin referrer trimming
- All site permissions (camera, mic, location, notifications) denied by default
- Claude sidebar (Ctrl+J): chat, optionally reading the current page. API key encrypted via OS keychain.
- Reader mode (📖 button): distraction-free view of any article, powered by Mozilla Readability

## Run
```
npm install
npm start
```
## Package
```
npm run dist
```

## Roadmap
Claude page actions with approval (fill forms, etc.), extension support, settings page, downloads manager.

Done: tabs, ad blocking (Ghostery engine + EasyList), bookmarks, history, per-site permission prompts, find-in-page, zoom, reader mode, Claude quick actions.

## Testing
```
xvfb-run -a npx electron test/smoke.js --no-sandbox --disable-gpu
xvfb-run -a node test/e2e.js
xvfb-run -a npx electron test/reader.js --no-sandbox --disable-gpu
```

## Shortcuts
Ctrl+T new tab, Ctrl+W close, Ctrl+Tab next tab, Ctrl+L address bar, Ctrl+R reload, Ctrl+D bookmark, Ctrl+F find, Ctrl+H history, Ctrl+J Claude, Ctrl +/-/0 zoom, F12 devtools.

## Open-source credits
- [Electron](https://github.com/electron/electron) (MIT) and Chromium (BSD)
- [@ghostery/adblocker-electron](https://github.com/ghostery/adblocker) (MPL-2.0) for ad and tracker filtering
- [@mozilla/readability](https://github.com/mozilla/readability) (Apache-2.0) for reader mode, the same engine as Firefox's reader view
