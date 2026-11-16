# Inbox playlists and managed shows · 0.8.0 development

**0.8.2 managed show:** held entries stay out of the managed Suno playlist. A completed song releases just that uploader's next submission at the current tail. Visible rows keep their positions on completion. The managed Suno projection follows actual played history plus the unplayed ready order at explicit sync and optional AP two-minute checks. Manual Decline is a separate, confirmed uploader change; there is no automatic Decline.

**0.7.0 presentation update:** YouTube expands to the Theatre's browser window on Play. The small controls let you restore Artwork view, pause or load the next song; no monitor fullscreen is requested. Quiet Load still does not start audio. Red video badges identify YouTube queue entries. Status text now says Loaded. The single Theatre gear opens Presentation controls, with Radio and Inbox entries at the top and a green, mode-labeled ready status when connected without a reported error. These additions need a real host rehearsal; the 0.6.10 Dev1 lyrics/status confirmation remains separately recorded.


This is the optional AIU Inbox development edition. Theatre Lite 0.5.0 remains a separate, unchanged current presentation release for hosts who do not need AIU inboxes. Lite does not gain these controls or require a connector. The submitted 0.5.0 Store beta is also separate. It has two packages built from the same inbox and playlist engine:

- **Catnap Theatre + Inbox:** Theatre, LP/AP inbox reader, Suno playlist creator/synchronizer, host notes and disclaimer flags, mixed Suno/YouTube show order, manual Load/Play controls and clipboard announcements.
- **Catnap Inbox:** the inbox/playlist creator alone, with an amber icon and no Theatre, tab capture or audio-publishing features.

No LLM, cue sheet, identity spreadsheet, Discord account or Armin service is required by either inbox engine. Suno playlist operations use the host's own MCP authorization and the small companion described below. Ordinary Theatre works without enabling inbox access.

## Installation

Use a separate test profile and a fresh development folder. Do not enable two Theatre versions in one profile, reload an active streaming extension, or change the playing Suno tab during a broadcast. These packages are not Store updates and do not activate themselves.

1. Extract the chosen development ZIP into a permanent folder. In Chrome/Brave's extensions page, enable Developer mode and Load unpacked that folder containing `manifest.json`. Pin its icon.
2. For playlist creation/sync, install Node.js 22 or later (24 LTS recommended) and register the companion with the exact extension ID shown by that browser. See [companion setup](../native/README.md) for Linux, Windows and macOS. The installers work per user; no publisher key or Suno credential ships in the package.
3. Open the uploader and sign in normally in the same browser profile. Open Inbox & show from Theatre's controls/toolbar, or click the standalone Inbox icon. Enable the optional inbox/Suno access, select the uploader tab, then Find my inboxes.
4. Select LP/AP and the correct inbox. Read Pending submissions to preview the FIFO order. Reading changes no uploader status. The separate Decline action below is an explicit host mutation.
5. Connect Suno using your own account. It must be allowed to use Suno MCP; a normal website login or completed OAuth screen alone is not proof of MCP eligibility. Load or create a playlist, then Add missing Suno songs & verify.

Setup steps show progress while running. Inbox discovery and the selected inbox are saved for reopening the controls; use Find my inboxes again when that list changes. If Suno already says connected, you can continue without connecting again. In 0.6.8, a selection save and the next setup action run in order instead of dropping a quick click. An operation's button stays disabled until it finishes, preventing repeated playlist creation or writes. Read Pending and Add missing remain separate deliberate actions.

Connect Suno requests authorization-site access from its own button. If a browser permission prompt is declined, no sign-in request starts. Failures stay beside Connect Suno and identify whether client registration or token exchange failed. The 0.6.10 extension uses the same 0.6.0 native protocol, so an already installed companion does not need reinstalling.

For the original 0.6.0 build's generic **Failed to fetch**, try Enable inbox & Suno access, then Connect Suno before changing extensions. This checks a missing optional grant without refreshing a playing tab. If the error remains, note whether Suno's sign-in window opened. Do not share authorization URLs, codes or tokens. The 0.6.1 patch improves diagnosis; an account connection is not considered tested until a real sign-in and playlist read succeed.

**Updating from 0.6.0/0.6.1:** the original authorization request omitted `profile:read`. A live playlist-read rejection explicitly identified that missing scope. Version 0.6.2 adds it alongside library read/write, requests a compatible registration only during an explicit Connect action, and requires new consent for an old grant. After loading the new development folder between broadcasts, click Connect Suno, approve the corrected permissions, then Load my playlists. Sign-in success alone does not establish playlist access. The migration does not reset queue data or change the exact development IDs; no companion reinstall is required.

The standalone Inbox creator retains verified, append-only FIFO additions. The combined Theatre can manage its selected Suno playlist's membership and order: Catnap-created playlists are managed automatically; use the explicit management action for an existing playlist. Foreign tracks block destructive reconciliation instead of being silently removed. Held/declined entries are excluded, while completed songs stay in actual played order. Reordering uses supported remove-and-add-at-tail operations on the upcoming suffix, with readback. A change that would remove the loaded/current song waits until safe. Uncertain writes are not blindly retried. YouTube-only entries keep their Theatre slots without fabricated Suno songs. Repeated Suno song IDs appear once in the Suno projection because provider membership cannot represent distinct repeated submissions. New playlists are private unless explicitly made Public. Use one synchronizer per show.

The unpacked development manifests pin separate public-key identities, so moving an extracted folder does not change its companion authorization ID. Theatre development: `jkcldbeopgdnodmnpdiilpcogikpkion`; Inbox development: `ehklfhbajedidchegigboembbcikambb`. These are development IDs, not the submitted Store beta ID. Register either or both exact IDs with the companion; no wildcard is needed. Only the public keys are included; no private signing key is stored or distributed.

AP inbox/playlist updates are optional, every two minutes while the browser is running, bounded to twelve hours. They stop on restart or an error. This is separate from playback autoplay. LP uses an explicit Read Pending action.

## Knowing which playback controls are active

The prominent card at the top of Inbox & show identifies **Inbox show controls active**, **Suno playlist controls**, or **Inbox show needs reconnecting**. It identifies the actual controlled tab separately from a merely selected destination. Selecting a tab does not change playback. The two mode buttons show which mode is active; changing mode remains an explicit action. The Inbox-only creator explains that Suno controls playback.

The Theatre gear opens Presentation controls, with Radio and Inbox buttons at the top. Its list reads **INBOX SHOW ORDER** in managed mode or **SUNO PLAYLIST** in ordinary mode. **Inbox Submissions: N Pending · N held in show · (time)** is prominently displayed above setup. Pending and time describe the last successful inbox read; the held total reflects current source, host and repeat-uploader holds in this show. Read/handoff errors and current-target readiness remain separate. These are not Suno playlist membership counts. The Inbox-only creator retains its FIFO read totals.

## Readiness and connection indicators

The top Suno and Inbox indicators show whether those integrations are ready for use. Their detailed checks distinguish authorization, access permission, an open uploader tab, a selected inbox, a successful Pending read and playlist selection/verification. Every dot has a text label; missing or unchecked requirements are red and confirmed requirements are green. Successful reads and verification are tied to the current target. Historical totals remain visible if a later read fails, while the failed check is shown separately.

In ordinary Suno playlist mode, the combined Theatre top integration indicators are grey and say **Not in use**. This does not revoke access or stop a host preparing the next show. Detailed readiness checks remain available. The Inbox-only creator keeps its integration status active because playlist preparation is its purpose. Status polling uses local evidence; it does not continually contact the uploader or Suno. Authorization and the last verified playlist operation are separate facts.

## Local running order and holds

The combined Theatre + Inbox show starts in FIFO order. Use a row’s **↑ / ↓** to move an upcoming song and **Hold / Release** to keep it for later or make it available again. The changes are saved per local show in this browser profile. Manual reads and AP resync preserve that order and those holds; newly discovered submissions append. Editing the upcoming queue does not restart or replace current audio. Loaded/playing and already completed entries are fixed anchors. An invalid or missing source must be corrected before Release can make it playable.

**Hold another song from the same uploader** is optional and starts off. When enabled, a later submission waits until that uploader’s preceding submission finishes. Starting, skipping or interrupting the earlier song does not count as completion. For an approved two- or three-part sequence, use **Release (host override)** on each later part. Each override survives refresh/resync while the global rule stays enabled. Held entries remain visible with their reason; Load next and AP autoplay select the next unheld entry. If none is available, the show stays held for the host.

In0.8.0 these choices also govern the managed Suno playlist. Held entries are visible with a reason and are absent from the playlist until released. With the optional repeat-uploader rule on, X1/Y1/X2/Z1/X3 starts with X1/Y1/Z1 ready and X2/X3 held. Finishing X1 appends X2 after the then-current ready tail, including any arrivals already there; X3 waits for X2 to finish. Only a real completion counts. A host's explicit Release persists across refreshes and appends that entry to ready order; use Move to place approved multipart entries together. Explicit manual holds remain held until the host releases them. New local shows reset local choices, not uploader statuses. The Inbox-only creator has no local playback/hold controls.

### Manual Decline

An upcoming submission's Decline button asks the host to confirm the song/uploader and the fixed reason **Only one song at a time, please.** It uses the uploader's own authenticated decline route, then verifies the exact ID/status in Declined. A timeout or uncertain result is reported; the extension does not blindly retry the mutation or assume disappearance proves success. Loaded/current and completed entries cannot be declined from this queue. There is no auto-decline, no automatic Accepted-as-Played operation and no upstream per-person quota implementation. Those future uploader policies remain separate.

The uploader currently enforces LP’s one-submission-per-person rule and AP’s total show capacity. This optional playback hold is not an extra submission quota. Future per-person AP submission limits belong in the uploader, rather than being inferred or imposed by the local player.

## Manual LP and optional AP autoplay

In the combined package, open the destination playlist in Suno and choose that tab under Theatre playback. Press Use this Theatre for the show, or select the intended tab and use Load/Play. Explicit Load/Play reconnects a stale or reloaded page before acting. Merely selecting LP/AP, reading the inbox or creating a playlist never stops a currently playing source. Native playback is held before a managed entry is selected.

- **Load next / Load previous / a queue row's Load:** update the loaded entry, artwork and warning without starting audio.
- **Play:** start the loaded source; on a fresh show it loads and starts the first available, unheld entry in the local order. **Pause:** hold playback.
- **LP:** autoplay is off and cannot be enabled. The song ends and stays ended until the host loads another entry.
- **AP:** autoplay starts off; the host may turn it on or off. When on, the managed queue—not Suno's native next/repeat setting—chooses the following entry. Held entries remain visible and are passed over until released. Playback/source failures still require a host decision.

Native Suno playback uses an exact rendered song row and a source-bound audio guard. It fails visibly if the native row/audio cannot be identified safely; it does not navigate/reload the playing tab or guess a source. Suno may need to render new playlist rows before they can play. Native looping is suppressed in managed mode and restored on return to ordinary Suno. A separately managed YouTube iframe stays in the same Theatre tab; opening a different tab would not automatically enter a Discord tab share.

Current Suno has a blob-backed `active-audio-play` music element alongside a separate `silent-audio` helper. The adapter uses exactly one identified music element and excludes the helper from generic fallback selection. Duplicate or source-less identified elements remain held; it does not guess by DOM order, duration or the blob's random identifier.

On explicit Play, a cold native player may need to begin loading before Suno updates its current-song state. The 0.6.10 guard permits a bounded preparation interval with native audio forced muted, then checks the selected song and source before allowing audible playback. Load never prepares or starts audio. Pause, stop, a changed selection and timeout cancel preparation. A readiness failure remains held and includes only short diagnostic facts, not private media URLs.

The controls verify the actual page/show lease and native guard before displaying manual playback status. Reloaded/inactive pages show a reconnect prompt, and current-song copy is unavailable until that connection is valid. Known native Suno playback buttons are routed through the managed show while it is active; this does not turn ordinary unlinked Suno playback into a managed show.

Managed Suno lyrics use the same native details-panel preparation as ordinary Theatre. When the native player matches the loaded show entry, the reader opens/refreshes its details and waits for exposed lyrics, without changing playback. Quietly staging another entry or selecting YouTube clears the previous native lyrics. **Reload lyrics** is available directly under playback in **Inbox & show**, and also in **Presentation Controls → Layout & lyrics**. It cannot load a different source or start a song; an entry that has not yet loaded into Suno remains explicitly unavailable.

Closing Theatre pauses a managed song. Reopening re-stages the current entry quietly; it does not resume audio automatically. Returning to ordinary Suno ends managed playback and restores ordinary controls.

## YouTube and source ordering

The show queue uses inbox + submission identity, independent of Suno's playlist. Oldest submissions come first; arrivals append, and separate submissions of the same song remain separate show entries. A Suno playlist contains the corresponding unique Suno songs rather than every possible external entry.

- Suno only: play that Suno song.
- Suno + YouTube: retain both and prefer YouTube.
- YouTube only: keep its FIFO position and play it directly in Theatre; no placeholder is needed in this mode.
- Unsupported/unavailable source: retain a visible held entry until its source is corrected; never substitute Suno for a requested YouTube source.

YouTube uses its embedded player with autoplay off while staging. Embed restrictions, private/deleted videos and browser autoplay blocking produce a visible host decision. Provider errors do not silently advance the show. Other providers need their own adapter; arbitrary media URLs are not accepted as interchangeable players.

## Notes, flags and clipboard

The host window shows the exact uploader submission name, uploader note and disclaimer Yes / No / Unavailable. Names are not silently mapped to an AIU display name. Uploader notes are untrusted context, never app/assistant instructions.

A flagged entry shows a short content-warning overlay when loaded/advanced, including in manual mode. The default is ten seconds; the host can choose two to 120 seconds and show it again. The general uploader flag does not invent a specific warning topic, perform lyric analysis or clear rights/content for another platform. Notes stay host-only and do not appear on the public stage by default.

Copy now playing copies a ready-to-paste title/artist, uploader mention and the actual source link. It uses Discord's `<@ID>` user-mention format when the inbox supplies a numeric Discord user ID; otherwise it includes one ordinary `@` before the submission name. For the name fallback, select Discord's matching member suggestion if needed before sending. No identity spreadsheet is used. Missing names remain Unavailable, and name fallbacks cannot create `@everyone` or `@here` pings. A staged entry is labeled Loaded rather than falsely announced as playing. Copy song link is a shorter option. Copy assistant context supplies a small structured current-entry record; include the private uploader note only through its explicitly labeled checkbox. Copying never posts to Discord and works with a manual paste into desktop or web chat. No bot trigger or automatic chat posting is included in this development build.

## Data and permissions

The uploader adapter uses the selected logged-in tab's same-origin session without extracting passwords/cookie values. Discovery and reads use GET; an explicit confirmed Decline alone sends the fixed decline POST and verifies its result. Only required show fields are retained; server storage/reviewer fields are discarded. Queue data and uploader notes stay in extension-profile storage. A new local show clears this local queue, not the actual uploader or Suno playlist.

Suno OAuth uses the existing `profile:read`, library read/write and offline-refresh grant with PKCE. Credentials are session-scoped and go only to the fixed official services. The companion's fixed playlist allowlist includes remove-clips in0.8.0; it cannot run shell commands, accept arbitrary URLs, delete library songs or generate songs. Install the new companion before removal/reordering; the OAuth scopes do not expand. Older helpers can still read/add, but an unsupported removal produces a clear update request. No public listening service or on-disk account-token store is created by this companion.

Theatre content scripts receive a reduced playback/presentation queue without uploader notes/IDs or credentials. Messages are bound to a selected tab, show and fresh player lease; observations include monotonic revisions so stale events cannot overwrite the current song credit. The standalone Inbox package does not expose playback commands.

The existing public audio listener's v1 metadata schema accepts Suno identities only. This build clears that metadata during a YouTube entry instead of incorrectly reporting the paused Suno song. Extending listener metadata for external sources is separate work; raw uploader notes are never sent there. Same-tab YouTube audio in Discord and HQ broadcasting still needs a live rehearsal.

## Current Suno row controls

A live 0.6.3 trial staged the song successfully but could not find its native Play control. Read-only inspection of the real playlist confirmed that Suno uses a DIV with role=button and a Play label, inside a deeper role=group song row. Version 0.6.10 matches that actual accessible control while retaining exact song identity, row scope, ambiguity and disabled-state checks. It does not click the playlist-wide Play button to get around a missing row. The native guard remains in force.

## Verification and remaining acceptance

The 0.7.0 local-order controls have isolated UI tests and a synthetic Chromium rehearsal at desktop and 390px mobile widths. Mocked button clicks verify stable entry identities for Move, Hold/Release and quiet Load, explicit multipart overrides, fixed current/played rows, disabled invalid-source Release and unclipped controls with long text. These fixtures use invented submissions and no real uploader, Suno or broadcast service. Persistent resync, live AP advancement and unchanged current audio still require the real host checks below; the accepted 0.6.10 status/lyrics result is not acceptance of these new 0.7.0 features.

Automated checks cover FIFO/source/flag handling, exact sender/tab/lease checks, stale events, private-note filtering, MCP OAuth/membership/readback, native helper framing, clipboard controls, manual/AP transitions, native source/loop guards and packaging. An actual browser synthetic-media fixture verifies that native ended handlers cannot auto-start a following tone and that changing its source revokes permission before another play.

On November 15, the host confirmed loading 0.6.2, connecting through Suno authorization, creating a playlist and rebroadcasting that playing playlist with clean audio. This is a successful host-reported combined rehearsal of authorization, playlist creation, Suno playback and HQ publishing; it is not an instrumented latency or audio-quality measurement.

The host also confirmed the complete 0.6.6 manual LP sequence: first Play, a held ending, Load next with the second entry paused, then Play starting that entry. Managed lyrics were missing and appeared after returning to ordinary Suno. The 0.6.7 retry still had missing lyrics, including after its visible Reload lyrics button was pressed.

Version 0.6.8 corrects a reader difference reproduced in fresh Chromium: raw lyric newlines were collapsed by rendered-text extraction, causing valid plain lyrics to be rejected. The reader now preserves those raw newlines and gives the exact current-song panel priority over unrelated artwork or Copy controls. The released 0.6.7 reader fails those fixtures and the corrected reader passes; this was a reproduced defect before the subsequent host verification below. Quiet Load, manual ending and native audio guards are preserved. All 238 maintained checks pass, including setup sequencing, pending-write deduplication and cancellation after a failed selection.

Version 0.6.10 adds local, context-aware readiness indicators while keeping Lite 0.5.0 separate and unchanged. All 256 maintained checks pass. Fresh Chromium verifies active, unverified, ordinary/inactive and Inbox-only readiness layouts without overflow or page errors, plus the retained managed lyric/header rehearsal. On November 16, 2026, Ina confirmed the Dev1 0.6.10 activation, matching status indicators and working lyrics in Inbox mode. This confirms the previously failing managed-lyrics path; it does not establish the separate remaining checks below.

Remaining acceptance includes per-show queue/hold restoration during real inbox reads and AP additions, completion-based repeat holds and explicit multipart releases, managed playlist membership/order and ongoing additions, a flagged Load without sound, AP autoplay, YouTube insertion/return and embed/gesture behavior, token renewal, and simultaneous Discord/HQ capture. The confirmed manual sequence does not establish those separate behaviors. Windows/macOS browser installation needs platform verification in addition to the isolated helper/CI checks.

Version 0.6.9 adds the clearer control grouping, source labels and persistent mode/read summaries, with 245 maintained checks passing. Synthetic Chromium verifies desktop, tablet and mobile button geometry plus the existing managed lyrics rehearsal. Version 0.6.9 was not separately host-tested; the subsequent 0.6.10 status/lyrics result is recorded above.

## Building

Run `npm ci --ignore-scripts` and `npm run check` in this repository. Then run:

```bash
bash scripts/build-dev.sh --output /absolute/path/to/a/new/output-folder
```

The builder refuses overwrites and emits Theatre + Inbox, Inbox-only and Radio-only unpacked folders, root-manifest ZIPs and SHA-256 files. Each contains first-party licensing and setup instructions. The two playlist creators also include optional companion source/installers; Radio-only needs no companion. No event CSVs, private identity records, browser configuration or runtime credentials are included.

The Inbox-only creator does not enforce manual playback: its LP/AP choice selects the submission inbox, and playback stays with Suno or a separately managed Theatre.

### Stable rows and YouTube view in 0.8.2

Selecting, playing and finishing a song keeps its Theatre and control-panel row in place. A Played badge records completion. The completion sequence is stored independently so the managed Suno playlist may still reflect actual played order; held repeats stay out until release at the ready tail. Explicit Move/Hold/Release can change the order.

Playing a YouTube video fills the Theatre window. One visible Exit video button at the middle-right edge restores artwork view immediately while preserving the same video and playback. The normal header Window view action expands it again. Native YouTube controls remain. Escape can also restore when keyboard focus is in the parent Theatre.

Upgrades preserve the last saved order. Earlier automatic moves are not reconstructed from incomplete history, because that could undo deliberate host moves. A fresh test show is the clearest check of the new stable-row behavior.
