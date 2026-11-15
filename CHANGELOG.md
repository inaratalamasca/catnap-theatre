# Changes

## 0.6.6 development — November 15, 2026

- Recognize Suno's explicit `active-audio-play` music element beside its `silent-audio` helper. Actual native music uses a blob URL without the song UUID; the helper made the former generic audio lookup ambiguous.
- Prefer exactly one identified native music element; duplicate/empty identified elements and ambiguous unknown sources remain held. Never treat the silent helper as a song.
- Retain muted preparation, quiet Load, manual ending, source checks and cancellation. The actual 0.6.5 trial selected the song but reported audio not found; this focused DOM correction still needs host confirmation.

## 0.6.5 development — November 15, 2026

- Add a bounded, muted native preparation step only after explicit Play, so a cold Suno player can finish loading without an audible lead-in. Quiet Load never enters preparation. Pause, stop, a different entry and timeout close preparation.
- Keep exact song/source verification before audible playback. Loading failures report only safe readiness facts, without audio URLs or account data.
- Preserve an operator's chosen Suno tab when native tab titles change; closing that chosen tab holds instead of silently targeting another one.
- Live 0.6.4 linking and quiet staging succeeded, but cold Play timed out after finding the native control. The 0.6.5 preparation change still requires host rehearsal.

## 0.6.4 development — November 15, 2026

- Correct Copy now playing to use the inbox's Discord user mention when available, with an `@name` fallback. Keep uploader identity host-only, avoid mass mentions, and never send chat automatically.
- Match Suno's actual accessible row Play control: current markup uses a labelled DIV with role=button inside a deeper song group. Keep exact song/row scoping and reject disabled or ambiguous controls.
- Apply the same lookup to managed native-control routing. Preserve the 0.6.3 quiet-load, stale-session recovery and LP end guards without changing OAuth scopes or companion protocol.
- The host confirmed quiet staging in 0.6.3; real 0.6.4 Play and end-of-track behavior still need confirmation.

## 0.6.3 development — November 15, 2026

- Verify the live Theatre/page lease and native guard instead of showing a stale Manual advance status after a page reload. Explicit Load/Next/Previous/Play can reconnect the selected Theatre without rebinding during inbox imports or setup changes.
- Start the first FIFO entry from an explicit Play on a fresh show; Load and advance remain silent, and a held first entry is not skipped.
- Route known native Suno playback controls through an active managed show and harden native media boundaries, including detached media and earlier native event handlers.
- Add an optional whole-operation coordination hook for the advanced controller, while keeping native callbacks under their existing exact show/tab lease.
- Keep the Inbox-only package explicit about its playlist-only role. Preserve Suno profile-scope authorization and existing native companion compatibility.

## 0.6.2 development — November 15, 2026

- Host confirmed 0.6.2 authorization, playlist creation, Suno playlist playback and clean HQ rebroadcast together. Mixed-source/manual-warning/AP behavior remains separately pending live acceptance.

- Add `profile:read` to Suno sign-in: a live playlist-read error identified it as required. Older grants need an explicit Connect Suno and fresh approval.
- Migrate the cached OAuth client registration during explicit connection; old-grant automatic refresh must not pair an old refresh token with a newly registered client.
- Preserve queue data, pinned development identities and existing native protocol compatibility. The Store beta and production aliases are unchanged.
- Include opt-in owner-only sanitized native failure categories for incident diagnosis; logging stays disabled by default and does not record credentials or playlist contents.

## 0.6.1 development — November 15, 2026

- Request Suno authorization-site access when Connect Suno is clicked, before any sign-in request. Declining the grant leaves the account disconnected.
- Keep connection failures beside Connect Suno; identify registration, token exchange and network failures without exposing credentials or provider response bodies.
- Show the actual extension version in broadcast controls instead of the old component label.
- Uses the existing restricted 0.6.0 native companion/protocol. No companion reinstall, new MCP tools or wider access is required.
- Live OAuth rehearsal remains pending; this patch fixes a missing permission flow and improves diagnosis, without claiming the reported connection failure is resolved.

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
