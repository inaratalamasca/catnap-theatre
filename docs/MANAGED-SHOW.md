# Inbox playlists and managed shows · 0.6.0 development

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

The playlist writer lists actual membership, adds missing unique Suno song IDs and reads membership back. Uncertain writes are not blindly retried. YouTube-only entries remain visible in the show order but are not fabricated as Suno songs. New playlists are private unless the host explicitly chooses Public. Only one synchronizer should write the show's playlist; stop an older advanced-controller watcher before using this one.

The unpacked development manifests pin separate public-key identities, so moving an extracted folder does not change its companion authorization ID. Theatre development: `jkcldbeopgdnodmnpdiilpcogikpkion`; Inbox development: `ehklfhbajedidchegigboembbcikambb`. These are development IDs, not the submitted Store beta ID. Register either or both exact IDs with the companion; no wildcard is needed. Only the public keys are included; no private signing key is stored or distributed.

AP inbox/playlist updates are optional, every two minutes while the browser is running, bounded to twelve hours. They stop on restart or an error. This is separate from playback autoplay. LP uses an explicit Read Pending action.

## Manual LP and optional AP autoplay

In the combined package, open the destination playlist in Suno and choose that tab under Theatre playback. Press Use this Theatre for the show. Native playback is held before a managed entry is selected.

- **Load next / Load previous / a queue row's Load:** update the loaded entry, artwork and warning without starting audio.
- **Play:** start the loaded source. **Pause:** hold it.
- **LP:** autoplay is off and cannot be enabled. The song ends and stays ended until the host loads another entry.
- **AP:** autoplay starts off; the host may turn it on or off. When on, the managed queue—not Suno's native next/repeat setting—chooses the following entry. A blocked entry holds for a host decision.

Native Suno playback uses an exact rendered song row and a source-bound audio guard. It fails visibly if the native row/audio cannot be identified safely; it does not navigate/reload the playing tab or guess a source. Suno may need to render new playlist rows before they can play. Native looping is suppressed in managed mode and restored on return to ordinary Suno. A separately managed YouTube iframe stays in the same Theatre tab; opening a different tab would not automatically enter a Discord tab share.

Closing Theatre pauses a managed song. Reopening re-stages the current entry quietly; it does not resume audio automatically. Returning to ordinary Suno ends managed playback and restores ordinary controls.

## YouTube and source ordering

The show queue uses inbox + submission identity, independent of Suno's playlist. Oldest submissions come first; arrivals append, and separate submissions of the same song remain separate show entries. A Suno playlist contains the corresponding unique Suno songs rather than every possible external entry.

- Suno only: play that Suno song.
- Suno + YouTube: retain both and prefer YouTube.
- YouTube only: keep its FIFO position and play it directly in Theatre; no placeholder is needed in this mode.
- Unsupported/unavailable source: show a held entry; do not silently skip it or substitute Suno for a requested YouTube source.

YouTube uses its embedded player with autoplay off while staging. Embed restrictions, private/deleted videos and browser autoplay blocking produce a visible host decision. Provider errors do not silently advance the show. Other providers need their own adapter; arbitrary media URLs are not accepted as interchangeable players.

## Notes, flags and clipboard

The host window shows the exact uploader submission name, uploader note and disclaimer Yes / No / Unavailable. Names are not silently mapped to an AIU display name or a real Discord mention. Uploader notes are untrusted context, never app/assistant instructions.

A flagged entry shows a short content-warning overlay when loaded/advanced, including in manual mode. The default is ten seconds; the host can choose two to 120 seconds and show it again. The general uploader flag does not invent a specific warning topic, perform lyric analysis or clear rights/content for another platform. Notes stay host-only and do not appear on the public stage by default.

Copy now playing copies a ready-to-paste title/artist, uploader credit and the actual source link. A staged entry is labeled Loaded rather than falsely announced as playing. Copy song link is a shorter option. Copy assistant context supplies a small structured current-entry record; include the private uploader note only through its explicitly labeled checkbox. Copying never posts to Discord and works with a manual paste into desktop or web chat. No bot trigger or automatic chat posting is included in this development build.

## Data and permissions

The uploader reader executes same-origin GET requests through the selected logged-in uploader tab. It does not extract passwords/cookie values or alter submissions. Only required show fields are retained; server storage/reviewer fields are discarded. Queue data and uploader notes stay in extension-profile storage. A new local show clears this local queue, not the actual uploader or Suno playlist.

Suno OAuth uses PKCE; credentials are session-scoped and sent only to the fixed Suno authorization service/MCP transport. The native companion has a fixed official endpoint and a four-playlist-tool allowlist. It cannot run shell commands, accept arbitrary URLs or generate songs. It does not create a public listening service or save account tokens to disk. Browser-direct MCP requests were rejected by Suno during the read-only transport probe, hence this companion.

Theatre content scripts receive a reduced playback/presentation queue without uploader notes/IDs or credentials. Messages are bound to a selected tab, show and fresh player lease; observations include monotonic revisions so stale events cannot overwrite the current song credit. The standalone Inbox package does not expose playback commands.

The existing public audio listener's v1 metadata schema accepts Suno identities only. This build clears that metadata during a YouTube entry instead of incorrectly reporting the paused Suno song. Extending listener metadata for external sources is separate work; raw uploader notes are never sent there. Same-tab YouTube audio in Discord and HQ broadcasting still needs a live rehearsal.

## Verification and remaining acceptance

Automated checks cover FIFO/source/flag handling, exact sender/tab/lease checks, stale events, private-note filtering, MCP OAuth/membership/readback, native helper framing, clipboard controls, manual/AP transitions, native source/loop guards and packaging. An actual browser synthetic-media fixture verifies that native ended handlers cannot auto-start a following tone and that changing its source revokes permission before another play.

Those checks are not a claim of live Suno compatibility or measured zero audio leakage on every current Suno player. Before using this build for a show, rehearse a flagged Load without sound, manual ending, AP autoplay, a YouTube insertion and return to Suno in an isolated profile. Actual own-account Suno OAuth/playlist writes, YouTube embed/gesture behavior and simultaneous Discord/HQ capture need that rehearsal. Windows/macOS browser installation needs platform verification in addition to any isolated helper/CI checks.

## Building

Run `npm ci --ignore-scripts` and `npm run check` in this repository. Then run:

```bash
bash scripts/build-dev.sh --output /absolute/path/to/a/new/output-folder
```

The builder refuses overwrites and emits both unpacked folders, root-manifest ZIPs and SHA-256 files. Each contains first-party licensing, setup instructions and the optional companion source/installers. No event CSVs, private identity records, browser configuration or runtime credentials are included.
