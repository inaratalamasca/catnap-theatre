# Changes

## 0.4.0 development — 2026-11-12

- Added persistent, source-tab-bound presentation controls for the existing Theatre settings, banners, visuals, local files and lyrics. Inline and pop-out controls share the same handlers and preferences.
- Added public artwork/current-song information, native timing and up to 100 visible upcoming rows for the optional listener display. The active capture source stays pinned even when another tab opens broadcast controls.
- Metadata uses the publisher's authorized relay origin, keeps keys out of content scripts, expires at the server and sends only bounded public fields. Unknown timing and shuffle order remain unavailable.
- Changed normal AIU submission banners to the uploader; retained an explicitly labeled emergency/non-AIU chat-drop banner.
- Prepared the matching integrated Theatre build with shared-file parity checks.

32 tests and isolated real Chromium scenarios passed. This is a separate development build, ready for a between-broadcast installation; the currently loaded extension was left running.
