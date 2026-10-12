# Xer Browser

A privacy-first browser built on the Chromium engine (via Electron), with Claude as the built-in assistant.

## Features
- Tabs, URL/search bar (DuckDuckGo default), keyboard shortcuts (Ctrl+T, Ctrl+W, Ctrl+L, Ctrl+J)
- Built-in ad/tracker blocking with a live counter
- Removed Chromium/Google extras: sync, telemetry, crash reporting, auto-update pings, Translate, FLoC/Topics, Media Router, X-Client-Data header
- Auto-upgrade HTTP to HTTPS, DNT + GPC headers, cross-origin referrer trimming
- All site permissions (camera, mic, location, notifications) denied by default
- Claude sidebar (Ctrl+J): chat, optionally reading the current page. API key encrypted via OS keychain.

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
Bookmarks, history, per-site permission prompts, reader mode, Claude page actions (summarize, extract, fill forms with approval), extension support.
