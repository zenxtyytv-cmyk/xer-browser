# Changelog

## 1.6.0
- **Clear browsing data** (Settings > Clear browsing data): choose any mix of browsing history, cookies and site data, cached files, saved site permissions and the finished-downloads list, over the last hour, 24 hours, 7 days or all time. Time ranges apply to history and the downloads list; the engine cannot clear cookies and site data by time, so those are always cleared completely (the page says so). Running downloads are never removed. Files you downloaded stay on disk.
- **Fix: the "Encrypted DNS (DNS-over-HTTPS)" switch did nothing.** The setting was saved but never applied. It now configures Chromium's secure DNS (automatic mode with your DoH server, falling back to normal DNS if it is unreachable) at launch and when toggled.
- **Security: proxy passwords** were stored in plain text in `network.json` and sent to the Settings page on every status call. They are now encrypted with the OS keychain (existing plain-text passwords are migrated on first launch) and never leave the main process; the UI only learns that a password exists. Where the OS keychain is unavailable the old behaviour remains.
- **Security: AI settings** accepted any keys and any URL. Only the provider, model and an http(s) Ollama address are accepted now.
- New tests: 21 unit checks (planning, time ranges, settings sanitizing) and 12 live checks that clear real data in the running app and verify the proxy password is hidden and encrypted.

## 1.5.0
- **Aurora look**: a new default theme inspired by modern desktop styling. Translucent plum "glass" tab strip and toolbar, rounded pill tabs, a glass address bar, and a vivid purple, magenta, orange and cyan swirl wallpaper behind the new tab page.
- **Floating dock** on the new tab page: a rounded, translucent bar of app shortcuts (Search, Mail, Maps, YouTube, Music, GitHub, GeForce NOW, Xbox Cloud, Wikipedia) that lifts and magnifies on hover.
- **Still readable**: widget cards are darker glass so text stays clear over the wallpaper. Contrast is now measured on real rendered pixels (13 text elements and 9 dock icons on the new tab, 21 elements in the browser chrome), and tests fail if any text drops below 4.5:1 or any dock icon below 3:1. That check caught and fixed a washed-out Claude button and several low-contrast dock tiles.
- **Game Mode drops the blur**: the glass blur costs GPU time, so Game Mode switches it off and restores it afterwards.
- Your own wallpaper and colors in the Customize bar still win; the Aurora wallpaper is only the fallback when none is set.
- Styling lives in theme.css and newtab-aurora.css, separate from the layout rules, so no sizes the app depends on changed.

## 1.4.0
- **Save page as PDF** (Ctrl+P or the PDF toolbar button): saves the current page to a PDF through a Save dialog that starts in your Downloads folder with a file name taken from the page title. Backgrounds are included, long pages split across pages, and reader-mode pages can be saved too. Existing files are never overwritten (a second save becomes `name (1).pdf`). Internal pages such as the new-tab page are refused with a short message. Uses Electron's built-in PDF printing, so there is no new dependency.
- **Address bar fixes** (now in `urlinput.js`, with tests):
  - Text containing a space is always a search. Before, `example.com/a b` or `localhost bar` was turned into a broken address.
  - `localhostfoo` used to count as a local address because it started with "localhost". It is now a search.
  - Pressing Enter on an empty address bar no longer runs a search for nothing.
  - Local addresses such as `localhost:3000` open over `http://` (most dev servers have no TLS) instead of failing on `https://`. Every other plain `http://` address is still upgraded to `https://`.
  - `javascript:`, `vbscript:`, `data:` and `blob:` typed into the address bar become a search instead of being loaded. `about:blank` works.
- New tests: 26 address-bar checks, 23 PDF helper checks, and 14 live checks that save real PDFs from the running app and verify the page text inside them.

## 1.3.0
- **Extension support**: load unpacked Chrome extensions (Manifest V2 or V3) from Settings > Extensions. Pick the folder that contains `manifest.json`; Xer shows the name, version and any sensitive permissions (all-sites access, cookies, history, tabs, downloads, proxy, and so on) in a confirmation dialog before anything is loaded.
  - Add, disable, re-enable and remove extensions. Enabled ones reload automatically at every launch, and the list is saved between sessions.
  - Each extension shows its status (running, disabled, or the reason it failed to load).
  - File-URL access is off for extensions by default.
  - Honest limits: this uses Electron's extension support, which covers content scripts and many common APIs but not the whole Chrome extension API. There is no Chrome Web Store installer, so extensions are added from an unpacked folder.
  - Found and worked around an Electron 39 hard crash: destroying the only window on a session and opening a new one right after removing an extension. The browser keeps its main window alive, so Disable is safe, and the live test is written to match that.
- Persisted extension list only stores path, name, version and enabled state; runtime ids and errors are re-derived at launch.
- New tests: 20 manifest/list checks and 12 live checks (real extension loads, its content script runs, stops after removal, runs again when re-enabled, Settings renders it).

## 1.2.0
- **Multi-step action plans**: when Claude proposes several page actions, they now appear as one numbered plan with a single **Approve plan** button instead of one approval per step.
  - Steps run top to bottom with a short pause after page loads and clicks. The first failing step stops the plan and the rest are marked skipped, so nothing runs on a page that is not in the expected state.
  - A **Stop** button halts a running plan after the current step. **Deny** runs nothing.
  - Plans that navigate to another site show a warning before you approve.
  - Safety is unchanged: nothing runs without your click, every step is re-validated in the main process, password and payment fields stay blocked, and a step refuses to run if you switched to another tab. A single action keeps the simple Approve/Deny card.
  - Claude is told to list steps in order, keep plans short, and never depend on content it cannot see yet.
- **Security fix: reader mode ran page script.** Readability removes `<script>` but keeps attributes such as `onerror=`, so a hostile article could run code in the reader page. Article HTML now goes through an allowlist sanitizer (safe tags and attributes only, `javascript:` and `data:text/html` URLs removed, links get `noopener`, images get no-referrer), and the reader page carries a Content-Security-Policy that forbids scripts as a second layer.
- Tests: 23 sanitizer checks, 8 live reader-safety checks (verified to fail without the fix), 18 plan-runner checks, 15 live plan checks. Live testing also caught a missing `Plan` global in the sidebar before release.

## 1.1.0
- **Draggable split divider**: in split view, drag the strip between the two panes to resize them live; double-click it to reset to 50/50.
  - The strip is 8px wide (was a 4px gap, too small to grab) and highlights on hover. The result is still clamped to 20 to 80 percent.
  - Pointer capture keeps the drag going when the cursor crosses a page; the final position is always applied on release.
  - New pure helpers `SplitState.ratioFromX` and `divider()` keep the maths unit-testable.
- Refactor: one `contentArea()` definition now feeds both layout and divider drag, so they cannot drift apart.
- Tests: 6 new unit checks (divider maths) and 7 new live checks (real strip geometry, IPC drag, pointer drag, double-click reset).

## 1.0.0
- **Split view** (Ctrl+Shift+S, the split button in the toolbar, or right-click a tab > Split view with next tab): show two tabs side by side.
  - Pairs the active tab with the next one in the tab bar (or the previous one if it is the last).
  - Clicking either tab moves focus between the panes without ending the split; switching to any other tab, closing a pane's tab, or toggling again ends it, and the focused pane stays on screen full width.
  - Split button menu: 50/50, 70/30, 30/70, swap sides, close split. Ratios are clamped to 20 to 80 percent so neither pane can be squeezed away.
  - Both panes keep their own page, history, and zoom. Tabs in the split are underlined in the tab bar.
- New tests: split logic (19 checks) and a live split test that measures real page widths in the running app.

## 0.9.0
- **Game Mode** (Ctrl+Shift+G or the controller button in the toolbar): one switch for cloud gaming (GeForce NOW, Xbox Cloud Gaming, Luna, Shadow).
  - Removes the browser's own limits: uncapped frame rate (no 60 fps vsync cap), GPU video decode and rasterization, low-latency rendering, and no throttling of the game tab when it is in the background.
  - Live FPS and worst-frame-time counter on the game page.
  - No permission pop-ups while playing: remembered answers still apply, unknown requests are denied quietly (never auto-granted).
  - Settings > Gaming controls each option. Frame-rate and GPU options apply after a restart; Xer tells you when one is needed.
  - Honest limits: the frame rate of a cloud stream is set by the cloud server and your connection. The browser can only avoid being the bottleneck. A fixed number such as 500 fps cannot be promised, and it needs a high-refresh monitor and a real GPU.
  - Fixed an easy-to-miss trap: Chromium only honors the last `--enable-features`, so the gaming features are merged with DNS-over-HTTPS instead of silently replacing it.
- New tests: gaming logic (23 checks) and a real-app Game Mode test.

## 0.8.0
- New: **Drag-and-drop tab reordering**. Drag a tab and drop it on the left half of another tab to go before it, or the right half to go after it; a blue marker shows where it will land. Dropping onto a pinned tab pins it, dragging a pinned tab out among normal tabs unpins it, dropping next to a grouped tab joins that group, and dropping next to an ungrouped tab leaves its group.
- Your custom order is saved with the session and restored on the next launch. Ctrl+Tab follows it.
- Fixed: closing the active tab now focuses the tab that took its place (or the previous one if it was last) instead of always jumping to the last tab in the bar.
- Duplicated tabs and links opened from a tab now land right next to the original instead of at the far end.
- New `src/main/taborder.js` (pure logic), `test/taborder.js` (18 unit checks) and `test/reorder.js` (20 checks: live IPC, real DOM drag events, pin/group interaction, restart). `npm test` now runs 14 suites.

## 0.7.0
- New: **Tab groups**. Right-click a tab > Add to new group; right-click the colored chip to rename, recolor (8 colors), collapse/expand, ungroup or close the group. Grouped tabs stay adjacent, collapsed groups hide their tabs (the active tab always stays visible), links opened from a grouped tab and duplicates join the same group, and pinning a tab removes it from its group.
- Groups persist: name, color, collapsed state and membership are saved in the session (format v3; older sessions still load) and restored on the next launch.
- Ctrl+Tab now follows the on-screen tab order, including groups.
- New `src/main/groups.js` (pure logic) and `test/groups.js` (37 checks: unit tests plus a live app run with relaunch). `npm test` now runs 12 suites.

## 0.6.0
- New: **Claude page actions with approval**. Claude can propose clicks, typing, scrolling and navigation; each action is shown as a card and only runs after you press Approve. Actions are re-validated in the main process, limited to the tab they were proposed for, capped at 8 per reply, and never touch password, card or identity fields. Works with Claude and local (Ollama) models.
- Fixed: saving the API key no longer fails silently when OS encryption is unavailable (the error is now shown).
- Fixed: chat history sent to Claude is capped at the last 20 messages to avoid oversized requests.
- README: removed a duplicated downloads entry. New `test/actions.js` (21 checks); `npm test` now runs 11 suites.

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
