# Release and privacy · 0.8.0 preview

The0.8.0 development preview adds fair-repeat rotation, explicitly managed playlist order and a host-confirmed uploader Decline. These changes do not activate an installed extension or change Lite0.5.0. New provider/host acceptance remains recorded separately from automated checks.

The [0.7.0 preview](https://github.com/inaratalamasca/catnap-theatre/releases/tag/v0.7.0-preview) adds separate Radio publishing, AIU source access, status indicators and window-filling YouTube presentation. The retained [0.6.10 preview](https://github.com/inaratalamasca/catnap-theatre/releases/tag/v0.6.10-preview) packages combined Theatre + Inbox and a separate Inbox-only creator. The unchanged current [Theatre Lite 0.5.0 release](https://github.com/inaratalamasca/catnap-theatre/releases/tag/v0.5.0) remains available. The 0.5.0 Chrome Store beta was submitted separately; this preview is an unpacked development download, not a Store update. There is no supported Firefox package. The host confirmed 0.6.2 authorization/playlist creation/HQ rebroadcast and the complete 0.6.6 manual LP sequence. The 0.6.7 host retry still had missing lyrics. Version 0.6.10 retains fixes for a browser-reproduced plain-lyrics whitespace defect and setup sequencing, with clearer mode/count displays; on November 16 the host confirmed Dev1 activation, matching status indicators and working Inbox-mode lyrics. Intake retry behavior, playlist updates, AP, YouTube/Discord/HQ and advanced live rehearsal remain separate checks. See [managed shows](MANAGED-SHOW.md) and [acceptance](ACCEPTANCE.md).

## Local presentation

Catnap Theatre reads current song information, artwork, lyrics, visible playlist rows and playback state from the signed-in Suno page. Suno supplies playback and its account session. Catnap does not export Suno passwords or cookies, use analytics, require a Catnap account, or send the local presentation to an AI service.

Display preferences live in the extension's browser-profile storage. Settings can be exported as a small JSON file when requested. Selected image/GIF/video files remain in page memory rather than being uploaded by Catnap. A page refresh forgets those files. Anything displayed in Theatre can be visible in a screen share.

The optional lounge connects to AIU Radio when the host presses Play. Remote Suno artwork/video uses ordinary requests to Suno's services. External links contact their named service when opened.

## Optional Inbox and playlist access

These features require an explicit host choice. The extension reads submissions through the selected signed-in AIU uploader tab using same-origin GET requests. A separately confirmed Decline alone sends the fixed reason to the uploader's decline route and verifies exact status; uncertain results offer a GET-only check, never an automatic mutation retry. It does not automatically decline, accept, mark played or delete submissions. Submission names, notes, source URLs and disclaimer/radio flags remain in browser-profile storage for the local show. Public artwork uses known Suno CDNs/YouTube thumbnails; copying its sanitized URL sends no note or chat message. New show resets only the local queue.

Playlist operations use the host's existing Suno profile/library read-write consent. Access/refresh tokens stay in session-scoped extension storage and go only to fixed official services through the restricted companion. Its allowlist includes playlist membership removal for exact managed-order reconciliation; removing membership does not delete a library song. The helper cannot generate songs, fetch arbitrary URLs, run shell commands or create a public listener. No password/cookie is exported. Optional incident logs stay disabled by default and contain only fixed error/status/scope categories, never tokens or playlist contents.

Uploader notes stay in the host window. Copy assistant context includes them only after the host selects its include-notes checkbox; this puts text on the clipboard and sends no chat message. The playback tab receives a reduced queue without uploader notes/names/IDs or credentials. YouTube staging contacts its embed and image services; provider availability and embedding rules apply. Spotify/Mureka playback is not included.

The Inbox-only package does not capture audio or enforce playback/manual advance. Its LP/AP setting chooses the submission inbox; playback stays with Suno or a separately managed Theatre.

## Optional publishing

The separate Radio-only package contains no Theatre, Inbox data, Suno OAuth or native companion. It requests only storage, activeTab, tabCapture and offscreen permissions, plus optional host access to the selected relay. Its minimal page indicator runs on Suno and the AIU party player; it does not read AIU inboxes or host sign-in data. Inbox-only remains audio-free and can be used alongside Radio. The unchanged Lite edition can also be paired with Radio.


Publishing is explicitly started from the toolbar control window for a selected Suno or AIU party-player tab. It captures that tab's audio, sends music to the relay chosen by the host, and restores a local monitor. It does not request microphone audio. Relay access requires a separate publish credential supplied by an authorized operator; no credential is distributed with the extension.

The publishing worker retains the active token in browser-session extension storage. In the 0.7.0 preview, Keep token between updates is on by default: an extension-local saved copy is written through an explicit Start/remember action and bound to the selected relay origin. The host can opt for session-only use or Forget the saved copy; that does not stop a current session. Local storage preserves it through ordinary same-ID updates, not extension removal/data clearing or profile changes. It is not cloud sync or an operating-system password vault. The relay endpoint also persists in local extension storage. Source page scripts and public listeners do not receive the token. The relay can observe the broadcaster/listener network connections as part of serving audio.

While publishing, bounded public metadata can include the current song title/artist, allowlisted artwork, available native timing, recent track context and up to 100 following rendered playlist rows. This is intentionally public broadcast information. AIU player capture currently sends no song metadata; a new AIU broadcast clears old public song details. The pilot metadata service expires stale metadata after 30 seconds; audio does not depend on metadata. Do not broadcast a private playlist if you do not want its visible song context shared. See the [broadcast guide](BROADCAST-PILOT.md).

The bundled extension has no Catnap-operated telemetry service or AI integration. Ordinary local presentation sends no metadata to the optional relay. Publishing and screen sharing are separate host choices.

## Permissions

- `storage`: local preferences, show queue/host context, relay endpoint, optional origin-bound remembered publish key, and session-scoped authorization/publishing state.
- `tabs` and `scripting`: choose the intended uploader/Suno tab, perform the optional same-origin inbox read and install/verify its native playback guard.
- `identity` and `nativeMessaging`: explicit Suno OAuth sign-in and fixed-endpoint playlist transport through the optional helper.
- `alarms`: optional bounded AP inbox/playlist updates; stopped on restart or error.
- `activeTab` and `tabCapture`: host-initiated capture of the selected music tab.
- `offscreen`: the extension's audio publishing/monitor document.
- Suno content-script matches: local presentation, guarded native playback delegation and the small radio indicator.
- AIU party-player content-script matches: radio status/control-window entry only, without Theatre or Inbox scripts.
- Optional HTTP/HTTPS host access: approval for the host-selected relay when publishing; public relay URLs require HTTPS. Broad optional declarations do not pregrant access to every site. Inbox/Suno authorization hosts are requested when those features are enabled.

No cookie, browser-history, debugger, microphone or Discord-account permission is requested.

## Distribution and rights

Use the unpacked download between shows. Reloading extensions or Suno can interrupt a live broadcast. Browser-store distribution and Firefox remain separate acceptance tasks.

First-party code/docs use [PolyForm Noncommercial](../LICENSE), with [required notices](../NOTICE) and separate commercial permission from Ina. AIU branding inclusion was confirmed by the maintainer on November 15, 2026. Logos, music and third-party assets retain their respective rights; see [licensing](../LICENSING.md). Original fictional artwork/lyrics are used in the example screenshots. No private inbox or name spreadsheet is distributed.

Report bugs through [GitHub issues](https://github.com/inaratalamasca/catnap-theatre/issues), including browser/extension version and reproduction steps. Remove credentials, private submissions and browser storage exports from reports. Store data-use disclosures must be reconciled with the final package before any store submission.
