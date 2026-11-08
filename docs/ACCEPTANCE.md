# Host acceptance checklist

Version 0.2.0 alpha, November 8, 2026. Run in a separate test profile before replacing a working show extension. No live reload was performed during project setup.

## Completed in this setup

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

## Release gates

- [ ] Live Suno checklist complete and blockers fixed.
- [ ] AIU logo / all redistributed asset usage confirmed.
- [ ] Accessibility/contrast and keyboard navigation reviewed in browser.
- [ ] Chrome store package, privacy declarations and screenshots finalized.
- [ ] Trusted-tester pilot completed; support/rollback instructions exercised.
- [ ] Firefox port explicitly tested before it is listed as supported.
