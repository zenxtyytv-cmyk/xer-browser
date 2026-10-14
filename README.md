# Xer Browser

A privacy-first browser built on the Chromium engine (via Electron), with Claude as the built-in assistant.

## Features
- **Proxy / VPN manager** (Settings): route traffic through any SOCKS5/HTTP proxy, including VPN-provider proxy endpoints, Tor (`socks5://127.0.0.1:9050`), or a local WireGuard/OpenVPN SOCKS port. Xer does not run VPN servers itself.
- **Customizable dashboard**: drag-free widget layout, resize, themes, wallpaper.
- **Local AI**: use Ollama models on-device instead of Claude (Settings > AI assistant).
- Tabs, URL/search bar (DuckDuckGo default), keyboard shortcuts (Ctrl+T, Ctrl+W, Ctrl+L, Ctrl+J)
- Built-in ad/tracker blocking with a live counter
- Removed Chromium/Google extras: sync, telemetry, crash reporting, auto-update pings, Translate, FLoC/Topics, Media Router, X-Client-Data header
- Auto-upgrade HTTP to HTTPS, DNT + GPC headers, cross-origin referrer trimming
- All site permissions (camera, mic, location, notifications) denied by default
- Claude sidebar (Ctrl+J): chat, optionally reading the current page. API key encrypted via OS keychain.
- Reader mode (📖 button): distraction-free view of any article, powered by Mozilla Readability

## Install on Windows

### Option A: Download the portable app (easiest)
1. Go to the [latest release](https://github.com/zenxtyytv-cmyk/xer-browser/releases/latest) and download `Xer-Browser-x.y.z-win-x64-portable.zip`.
2. Right-click the zip, choose **Extract All**, and extract it to a folder (do not run it from inside the zip).
3. Open the folder and double-click **Xer Browser.exe**. If Windows SmartScreen says "Windows protected your PC", click **More info**, then **Run anyway** (the app is not code-signed yet).

This build has not been tested on a real Windows machine yet. If something breaks, please open an Issue.

An `.exe` installer with Start menu shortcuts is also possible. To have GitHub build that installer for you:
1. In your copy of the repo, click **Add file > Create new file**, name it `.github/workflows/build-windows.yml`, and paste the contents of [`docs/build-windows.yml.txt`](docs/build-windows.yml.txt). Commit it.
2. Open the **Actions** tab, choose **Build Windows installer**, click **Run workflow**, and download the `xer-browser-windows` artifact when it finishes. (Pushing a tag like `v0.4.0` also publishes it as a Release.)

### Option B: Run from source
1. Install [Node.js](https://nodejs.org) 20 or newer (LTS) and [Git](https://git-scm.com/download/win).
2. Open **PowerShell** and run:
   ```powershell
   git clone https://github.com/zenxtyytv-cmyk/xer-browser.git
   cd xer-browser
   npm install
   npm start
   ```

### Option C: Build your own installer
```powershell
npm install
npm run dist:win
```
The installer appears in the `dist` folder.

### First launch
- **Claude assistant:** press `Ctrl+J`, then paste your Anthropic API key (stored encrypted on your PC).
- **Local AI (optional):** install [Ollama for Windows](https://ollama.com/download), run `ollama pull llama3.2` in PowerShell, then pick **Local model** in Settings (the gear icon).
- **VPN / proxy:** open Settings and add a SOCKS5 or HTTP proxy from your VPN provider (or Tor at `socks5://127.0.0.1:9050`).
- Ad and tracker blocking turns on by itself. The first launch takes about a minute to download the filter lists.

### Troubleshooting
- **`npm` is not recognized:** close and reopen PowerShell after installing Node.js.
- **Blank window or crash on start:** update your graphics drivers, or run `npm start -- --disable-gpu`.
- **Installer blocked by antivirus:** this is common for unsigned apps. Use Option B or C to build it yourself.

## Run (Linux / macOS)
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
xvfb-run -a npx electron test/features.js --no-sandbox --disable-gpu
xvfb-run -a node test/security.js
```

## Shortcuts
Ctrl+T new tab, Ctrl+W close, Ctrl+Tab next tab, Ctrl+L address bar, Ctrl+R reload, Ctrl+D bookmark, Ctrl+F find, Ctrl+H history, Ctrl+J Claude, Ctrl +/-/0 zoom, F12 devtools.

## Open-source credits
- [Electron](https://github.com/electron/electron) (MIT) and Chromium (BSD)
- [Ollama](https://github.com/ollama/ollama) (MIT), optional local model backend
- [@ghostery/adblocker-electron](https://github.com/ghostery/adblocker) (MPL-2.0) for ad and tracker filtering
- [@mozilla/readability](https://github.com/mozilla/readability) (Apache-2.0) for reader mode, the same engine as Firefox's reader view
