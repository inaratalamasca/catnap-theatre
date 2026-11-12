# Changes

## 0.5.0 development — 2026-11-12

- Moved presentation options into the persistent control window, with one Controls entry on Theatre. Playback, navigation and Close remain available on the canvas.
- Added optional translucent teal/lavender bars behind all foreground panels, with on/off and opacity controls. Analysis uses cloned stream-backed music tracks or the existing broadcaster analyser. URL-only playback without broadcasting and silence leave the background quiet.
- Preserved source-tab binding, the serialized settings queue and the advanced controller bridge; prepared matching integrated source with shared-file parity checks.
- Fixed a stale periodic control-state reply that could undo a completed setting edit before the next edit.
- Kept the installed 0.4.0 source untouched for a deliberate between-broadcast upgrade.

## 0.4.0 development — 2026-11-12

- Added persistent, source-tab-bound presentation controls for the existing Theatre settings, banners, visuals, local files and lyrics. Inline and pop-out controls share the same handlers and preferences.
- Added public artwork/current-song information, native timing and up to 100 visible upcoming rows for the optional listener display. The active capture source stays pinned even when another tab opens broadcast controls.
- Metadata uses the publisher's authorized relay origin, keeps keys out of content scripts, expires at the server and sends only bounded public fields. Unknown timing and shuffle order remain unavailable.
- Changed normal AIU submission banners to the uploader; retained an explicitly labeled emergency/non-AIU chat-drop banner.
- Prepared the matching integrated Theatre build with shared-file parity checks.

32 tests and isolated real Chromium scenarios passed. This is a separate development build, ready for a between-broadcast installation; the currently loaded extension was left running.
