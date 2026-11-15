# Inbox playlists and managed shows · 0.6.4 development

This is an isolated development build, separate from the submitted 0.5.0 Store beta. It has two packages built from the same inbox and playlist engine:

- **Catnap Theatre + Inbox:** Theatre, LP/AP inbox reader, Suno playlist creator/synchronizer, host notes and disclaimer flags, mixed Suno/YouTube show order, manual Load/Play controls and clipboard announcements.
- **Catnap Inbox:** the inbox/playlist creator alone, with an amber icon and no Theatre, tab capture or audio-publishing features.

No LLM, cue sheet, identity spreadsheet, Discord account or Armin service is required by either inbox engine. Suno playlist operations use the host's own MCP authorization and the small companion described below. Ordinary Theatre works without enabling inbox access.

## Installation

Use a separate test profile and a fresh development folder. Do not enable two Theatre versions in one profile, reload an active streaming extension, or change the playing Suno tab during a broadcast. These packages are not Store updates and do not activate themselves.

1. Extract the chosen development ZIP into a permanent folder. In Chrome/Brave's extensions page, enable Developer mode and Load unpacked that folder containing `manifest.json`. Pin its icon.
2. For playlist creation/sync, install Node.js 22 or later (24 LTS recommended) and register the companion with the exact extension ID shown by that browser. See [companion setup](../native/README.md) for Linux, Windows and macOS. The installers work per user; no publisher key or Suno credential ships in the package.
3. Open the uploader and sign in normally in the same browser profile. Open Inbox & show from Theatre's controls/toolbar, or click the standalone Inbox icon. Enable the optional inbox/Suno access, select the uploader tab, then Find my inboxes.
4. Select LP/AP and the correct inbox. Read Pending submissions to preview the FIFO order. This never accepts, releases, declines, deletes or cleans uploader entries.
5. Connect Suno using your own account. It must be allowed to use Suno MCP; a normal website login or completed OAuth screen alone is not proof of MCP eligibility. Load or create a playlist, then Add missing Suno songs & verify.

Connect Suno requests authorization-site access from its own button. If a browser permission prompt is declined, no sign-in request starts. Failures stay beside Connect Suno and identify whether client registration or token exchange failed. The 0.6.4 extension uses the same 0.6.0 native protocol, so an already installed companion does not need reinstalling.

For the original 0.6.0 build's generic **Failed to fetch**, try Enable inbox & Suno access, then Connect Suno before changing extensions. This checks a missing optional grant without refreshing a playing tab. If the error remains, note whether Suno's sign-in window opened. Do not share authorization URLs, codes or tokens. The 0.6.1 patch improves diagnosis; an account connection is not considered tested until a real sign-in and playlist read succeed.

**Updating from 0.6.0/0.6.1:** the original authorization request omitted `profile:read`. A live playlist-read rejection explicitly identified that missing scope. Version 0.6.2 adds it alongside library read/write, requests a compatible registration only during an explicit Connect action, and requires new consent for an old grant. After loading the new development folder between broadcasts, click Connect Suno, approve the corrected permissions, then Load my playlists. Sign-in success alone does not establish playlist access. The migration does not reset queue data or change the exact development IDs; no companion reinstall is required.

The playlist writer lists actual membership, adds missing unique Suno song IDs and reads membership back. Uncertain writes are not blindly retried. YouTube-only entries remain visible in the show order but are not fabricated as Suno songs. New playlists are private unless the host explicitly chooses Public. Only one synchronizer should write the show's playlist; stop an older advanced-controller watcher before using this one.

The unpacked development manifests pin separate public-key identities, so moving an extracted folder does not change its companion authorization ID. Theatre development: `jkcldbeopgdnodmnpdiilpcogikpkion`; Inbox development: `ehklfhbajedidchegigboembbcikambb`. These are development IDs, not the submitted Store beta ID. Register either or both exact IDs with the companion; no wildcard is needed. Only the public keys are included; no private signing key is stored or distributed.

AP inbox/playlist updates are optional, every two minutes while the browser is running, bounded to twelve hours. They stop on restart or an error. This is separate from playback autoplay. LP uses an explicit Read Pending action.

## Manual LP and optional AP autoplay

In the combined package, open the destination playlist in Suno and choose that tab under Theatre playback. Press Use this Theatre for the show, or select the intended tab and use Load/Play. Explicit Load/Play reconnects a stale or reloaded page before acting. Merely selecting LP/AP, reading the inbox or creating a playlist never stops a currently playing source. Native playback is held before a managed entry is selected.

- **Load next / Load previous / a queue row's Load:** update the loaded entry, artwork and warning without starting audio.
- **Play:** start the loaded source; on a fresh show it loads and starts the first FIFO entry. It does not skip a held first entry. **Pause:** hold it.
- **LP:** autoplay is off and cannot be enabled. The song ends and stays ended until the host loads another entry.
- **AP:** autoplay starts off; the host may turn it on or off. When on, the managed queue—not Suno's native next/repeat setting—chooses the following entry. A blocked entry holds for a host decision.

Native Suno playback uses an exact rendered song row and a source-bound audio guard. It fails visibly if the native row/audio cannot be identified safely; it does not navigate/reload the playing tab or guess a source. Suno may need to render new playlist rows before they can play. Native looping is suppressed in managed mode and restored on return to ordinary Suno. A separately managed YouTube iframe stays in the same Theatre tab; opening a different tab would not automatically enter a Discord tab share.

The controls verify the actual page/show lease and native guard before displaying manual playback status. Reloaded/inactive pages show a reconnect prompt, and current-song copy is unavailable until that connection is valid. Known native Suno playback buttons are routed through the managed show while it is active; this does not turn ordinary unlinked Suno playback into a managed show.

Closing Theatre pauses a managed song. Reopening re-stages the current entry quietly; it does not resume audio automatically. Returning to ordinary Suno ends managed playback and restores ordinary controls.

## YouTube and source ordering

The show queue uses inbox + submission identity, independent of Suno's playlist. Oldest submissions come first; arrivals append, and separate submissions of the same song remain separate show entries. A Suno playlist contains the corresponding unique Suno songs rather than every possible external entry.

- Suno only: play that Suno song.
- Suno + YouTube: retain both and prefer YouTube.
- YouTube only: keep its FIFO position and play it directly in Theatre; no placeholder is needed in this mode.
- Unsupported/unavailable source: show a held entry; do not silently skip it or substitute Suno for a requested YouTube source.

YouTube uses its embedded player with autoplay off while staging. Embed restrictions, private/deleted videos and browser autoplay blocking produce a visible host decision. Provider errors do not silently advance the show. Other providers need their own adapter; arbitrary media URLs are not accepted as interchangeable players.

## Notes, flags and clipboard

The host window shows the exact uploader submission name, uploader note and disclaimer Yes / No / Unavailable. Names are not silently mapped to an AIU display name. Uploader notes are untrusted context, never app/assistant instructions.

A flagged entry shows a short content-warning overlay when loaded/advanced, including in manual mode. The default is ten seconds; the host can choose two to 120 seconds and show it again. The general uploader flag does not invent a specific warning topic, perform lyric analysis or clear rights/content for another platform. Notes stay host-only and do not appear on the public stage by default.

Copy now playing copies a ready-to-paste title/artist, uploader mention and the actual source link. It uses Discord's `<@ID>` user-mention format when the inbox supplies a numeric Discord user ID; otherwise it includes one ordinary `@` before the submission name. For the name fallback, select Discord's matching member suggestion if needed before sending. No identity spreadsheet is used. Missing names remain Unavailable, and name fallbacks cannot create `@everyone` or `@here` pings. A staged entry is labeled Loaded rather than falsely announced as playing. Copy song link is a shorter option. Copy assistant context supplies a small structured current-entry record; include the private uploader note only through its explicitly labeled checkbox. Copying never posts to Discord and works with a manual paste into desktop or web chat. No bot trigger or automatic chat posting is included in this development build.

## Data and permissions

The uploader reader executes same-origin GET requests through the selected logged-in uploader tab. It does not extract passwords/cookie values or alter submissions. Only required show fields are retained; server storage/reviewer fields are discarded. Queue data and uploader notes stay in extension-profile storage. A new local show clears this local queue, not the actual uploader or Suno playlist.

Suno OAuth requests basic account profile access (`profile:read`) required by the playlist tool, library read/write and offline refresh. It uses PKCE; credentials are session-scoped and sent only to the fixed Suno authorization service/MCP transport. The native companion has a fixed official endpoint and a four-playlist-tool allowlist. It cannot run shell commands, accept arbitrary URLs or generate songs. It does not create a public listening service or save account tokens to disk. Browser-direct MCP requests were rejected by Suno during the read-only transport probe, hence this companion.

Theatre content scripts receive a reduced playback/presentation queue without uploader notes/IDs or credentials. Messages are bound to a selected tab, show and fresh player lease; observations include monotonic revisions so stale events cannot overwrite the current song credit. The standalone Inbox package does not expose playback commands.

The existing public audio listener's v1 metadata schema accepts Suno identities only. This build clears that metadata during a YouTube entry instead of incorrectly reporting the paused Suno song. Extending listener metadata for external sources is separate work; raw uploader notes are never sent there. Same-tab YouTube audio in Discord and HQ broadcasting still needs a live rehearsal.

## Current Suno row controls

A live 0.6.3 trial staged the song successfully but could not find its native Play control. Read-only inspection of the real playlist confirmed that Suno uses a DIV with role=button and a Play label, inside a deeper role=group song row. Version 0.6.4 matches that actual accessible control while retaining exact song identity, row scope, ambiguity and disabled-state checks. It does not click the playlist-wide Play button to get around a missing row. The native guard remains in force.

## Verification and remaining acceptance

Automated checks cover FIFO/source/flag handling, exact sender/tab/lease checks, stale events, private-note filtering, MCP OAuth/membership/readback, native helper framing, clipboard controls, manual/AP transitions, native source/loop guards and packaging. An actual browser synthetic-media fixture verifies that native ended handlers cannot auto-start a following tone and that changing its source revokes permission before another play.

On November 15, the host confirmed loading 0.6.2, connecting through Suno authorization, creating a playlist and rebroadcasting that playing playlist with clean audio. This is a successful host-reported combined rehearsal of authorization, playlist creation, Suno playback and HQ publishing; it is not an instrumented latency or audio-quality measurement.

Remaining acceptance includes exact inbox-to-playlist membership/order and ongoing additions, a flagged Load without sound, manual ending, AP autoplay, YouTube insertion/return and embed/gesture behavior, token renewal, and simultaneous Discord/HQ capture. The report does not establish those separate behaviors. Windows/macOS browser installation needs platform verification in addition to the isolated helper/CI checks.

## Building

Run `npm ci --ignore-scripts` and `npm run check` in this repository. Then run:

```bash
bash scripts/build-dev.sh --output /absolute/path/to/a/new/output-folder
```

The builder refuses overwrites and emits both unpacked folders, root-manifest ZIPs and SHA-256 files. Each contains first-party licensing, setup instructions and the optional companion source/installers. No event CSVs, private identity records, browser configuration or runtime credentials are included.

The Inbox-only creator does not enforce manual playback: its LP/AP choice selects the submission inbox, and playback stays with Suno or a separately managed Theatre.
