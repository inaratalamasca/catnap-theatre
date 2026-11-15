# Changes

## 0.6.0 development — 2026-11-15

- Added optional read-only AIU LP/AP Pending intake with FIFO ordering, separate submission identities, uploader notes and tri-state disclaimer/radio flags. New arrivals append without restarting a playing entry.
- Added shared Suno MCP playlist creation/sync with OAuth/PKCE, membership readback and a narrowly scoped native companion. Linux, Windows and macOS installer/launcher smoke checks pass on their respective CI systems; browser/account acceptance remains pending.
- Added a mixed Suno/YouTube show queue with no Suno placeholders in managed mode. Paired sources prefer YouTube; missing/blocked sources hold for a host decision.
- Added manual LP Load/Play separation, optional AP autoplay, timed warning overlays on advance, host-only context and clipboard announcements. Native source/loop guards prevent automatic next-song startup in focused and real-browser synthetic tests; live Suno/Discord/HQ behavior needs rehearsal.
- Added a separate Catnap Inbox creator package without Theatre/capture permissions, using the same sync engine. Pinned distinct development IDs and purple/amber icons; no LLM or cue sheet is required.
- Kept existing installed extensions and the submitted 0.5.0 Store beta separate. The v1 listener metadata is cleared during external-source entries until its schema supports those sources; private uploader notes never enter it.

## 0.5.0 early-access publication — 2026-11-15

- Consolidated the existing broadcast, controls/visualizer and toolbar-icon changes into main.
- Added a versioned download, current installation/privacy notes and project links.
- Applied PolyForm Noncommercial terms to first-party code/docs, with separate commercial permission and branding notices.
- Added tracked-file privacy guards and repository checks. No playback, audio capture or installed extension was changed by this housekeeping revision.

## 0.5.0 toolbar icon revision — 2026-11-12

- Added the Catnap headphone cat as explicit toolbar/extension icons in four sizes; existing toolbar behavior and presentation features are unchanged.
- Kept this source separate from the working Dev1 installation.

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
