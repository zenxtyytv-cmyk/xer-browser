# Changelog

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
