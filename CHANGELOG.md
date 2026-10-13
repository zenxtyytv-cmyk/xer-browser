# Changelog

## 0.4.0
- Reader mode (📖 toolbar button): clean, distraction-free article view using Mozilla Readability (Apache-2.0), same engine as Firefox.
- Fixed: internal new-tab/error pages can no longer be bookmarked.
- New reader-mode test with a fixture article.

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
