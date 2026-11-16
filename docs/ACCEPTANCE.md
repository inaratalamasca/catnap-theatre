# Host acceptance checklist

Current preview: 0.7.0 development, November 16, 2026. Run in a separate test profile before replacing a working show extension. Theatre Lite 0.5.0 remains separate and unchanged.

Ina confirmed Dev1 activation, matching status indicators and working managed lyrics in **0.6.10** on November 16. That result does not mark the following new 0.7.0 behavior as live accepted.

## 0.7.0 local queue checks

- [x] Isolated host-control tests: stable-ID Move/Load, Hold/Release, explicit multipart override, optional default-off repeat policy, current/completed anchors and invalid-source release blocking.
- [x] Synthetic Chromium desktop/mobile: real clicks against mocked messages, visible hold reasons, no overflow with long unbroken text, and no real account, provider or audio access.
- [ ] Real host: move and hold upcoming entries, reopen controls, Read Pending and let AP resync; confirm choices survive and new submissions append without changing current audio.
- [ ] Real host: leave repeat-uploader holding off for ordinary FIFO; enable it and confirm the later song releases only after its predecessor finishes.
- [ ] Real host: interrupt/skip the predecessor, explicitly release two later parts, and confirm those multipart overrides survive refresh while the global rule stays on.
- [ ] Real host: held rows stay visible, Load next/AP use unheld entries, an invalid source cannot be released, and loaded/completed anchors cannot move or be held.
- [ ] Confirm Suno playlist order/membership remains independent; the Inbox-only creator still has FIFO intake and no local order/hold controls.

The historical 0.5.0 checklist below was recorded on November 12 while installed 0.4.0 remained untouched. It does not describe the current installed version.

## Isolated 0.5.0 checks

- [x] Syntax, manifest references and 43 focused tests, including source ownership, spectrum validation, pinned relay forwarding and the stale settings-response regression.
- [x] Real persistent control window: settings, reuse, file transfer, banner actions, source binding and clean main-canvas accessibility.
- [x] Computed background/foreground stacking and the subtle default-opacity fixture preview.
- [x] Actual Chromium stream-backed audio reacts and fades; original input tracks and nonzero source audio survive disable, re-enable and source changes, without URL capture, microphone access or output rerouting.
- [ ] Signed-in Suno rehearsal of the 0.5.0 build, including visualizer on/off through real track transitions and coexistence with Discord/broadcast capture.

## Original 0.2.0 baseline evidence

- [x] JavaScript syntax and MV3 referenced-script validation.
- [x] Eight focused Node/jsdom tests: bounded settings, allowed song IDs, cue classification, settings/layout rendering, native row Play delegation, button keyboard safety, removed controller bridge and manual/pause/disabled lyric motion.
- [x] Isolated headless Chrome 1600×900 screenshot of three-column layout inspected: header, branding, Up Next, readable list/current marker, contained sample art, lyrics and controls.
- [x] Original sample fixture art/lyrics; no current submissions or private identities in screenshot.

## Required on signed-in Suno before recommending to hosts

- [ ] Load unpacked into clean profile; confirm no other Theatre extension enabled.
- [ ] Cold-start playlist, pause/resume, next/previous, seek and automatic transition.
- [ ] Confirm no unexpected audio when opening/closing/changing layouts.
- [ ] Two/three-column and artwork-focus layouts at 1920×1080 and laptop resolution.
- [ ] Tall, wide and square covers have all edges visible.
- [ ] Matching animated cover plays muted; wrong-track, missing or blocked video leaves still art.
- [ ] Long, plain, multilingual and missing lyrics; Retry does not restart playback.
- [ ] Font size, cue hiding, manual wheel/drag/touch correction, pause and auto-scroll off.
- [ ] Native playbar current song matches highlight; rows without native controls remain disabled.
- [ ] Long/virtualized playlist: disclose partial list; scroll native page to expose more rows.
- [ ] Append a test track from another session; observe behavior without refreshing during a song. Do not claim guaranteed sync if Suno does not render it.
- [ ] Shuffle/repeat: Up Next uncertainty is honest; native playback preserved.
- [ ] Local warning/file overlays show, expire and clear; video muted; recents stay within budget.
- [ ] Save/import/reset settings; corrupt/oversized JSON is rejected; no HTML executed.
- [ ] Custom host name/logo/background and Catnap credit/AIU logo remain readable.
- [ ] Refresh forgets tab-local files but keeps profile preferences; export file contains no assets/lyrics.
- [ ] Lounge radio needs explicit Play, Stop works, closing page stops audio, volume works.
- [ ] Host manually pauses other tabs; playlist link stops lounge radio before Suno playback.
- [ ] Screen capture contains exactly intended content and no open settings panels/private browser chrome.

## Evidence to request later

A short capture showing cold start → next song → lyric recovery; two layout screenshots with real Suno data; one animated-art example; one long/virtualized playlist; and Chrome version/OS. Record observed results with dates and exact extension version. A failed case is useful evidence; do not relabel it as passed from source inspection.

## General-release gates

The explicitly labeled unpacked development preview retains the narrower verification limits in MANAGED-SHOW.md. The following are gates for broad support/Store/general availability, not claims that every preview checklist item has passed.

- [ ] Live Suno checklist complete and blockers fixed.
- [ ] AIU logo / all redistributed asset usage confirmed.
- [ ] Accessibility/contrast and keyboard navigation reviewed in browser.
- [ ] Chrome store package, privacy declarations and screenshots finalized.
- [ ] Trusted-tester pilot completed; support/rollback instructions exercised.
- [ ] Firefox port explicitly tested before it is listed as supported.
