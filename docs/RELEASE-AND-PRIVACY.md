# Release and privacy · 0.6.6 preview

The [0.6.6 preview](https://github.com/inaratalamasca/catnap-theatre/releases/tag/v0.6.6-preview) packages combined Theatre + Inbox and a separate Inbox-only creator. The older [0.5.0 presentation release](https://github.com/inaratalamasca/catnap-theatre/releases/tag/v0.5.0) remains available. The submitted 0.5.0 Chrome Store beta is pending review; this preview is an unpacked development download, not a Store update. There is no supported Firefox package. A host confirmed 0.6.2 authorization, playlist creation and clean HQ rebroadcast; 0.6.6 fixes subsequent reload/manual-playback failures and still needs live mixed-source rehearsal. See [managed shows](MANAGED-SHOW.md) and [acceptance](ACCEPTANCE.md).

## Local presentation

Catnap Theatre reads current song information, artwork, lyrics, visible playlist rows and playback state from the signed-in Suno page. Suno supplies playback and its account session. Catnap does not export Suno passwords or cookies, use analytics, require a Catnap account, or send the local presentation to an AI service.

Display preferences live in the extension's browser-profile storage. Settings can be exported as a small JSON file when requested. Selected image/GIF/video files remain in page memory rather than being uploaded by Catnap. A page refresh forgets those files. Anything displayed in Theatre can be visible in a screen share.

The optional lounge connects to AIU Radio when the host presses Play. Remote Suno artwork/video uses ordinary requests to Suno's services. External links contact their named service when opened.

## Optional Inbox and playlist access

These features require an explicit host choice. The extension reads Pending submissions through the selected signed-in AIU uploader tab using same-origin GET requests. Submission names, notes, source URLs and disclaimer/radio flags are retained in browser-profile storage for the local show. It does not accept, release, decline or delete uploader submissions. New show resets that local queue, not the uploader or Suno playlist.

Playlist operations use the host's own Suno OAuth consent, including required basic profile and library read/write permissions. Access/refresh tokens stay in session-scoped extension storage and go only to Suno's fixed authorization service and the restricted native companion. The helper supports four playlist tools; it cannot generate songs, fetch arbitrary URLs, run shell commands, or create a public listener. No login/password/cookie is exported. Optional incident logs are disabled by default; when deliberately enabled they contain only fixed error/status/scope categories, never tokens or playlist contents.

Uploader notes stay in the host window. Copy assistant context includes them only after the host selects its include-notes checkbox; this puts text on the clipboard and sends no chat message. The playback tab receives a reduced queue without uploader notes/names/IDs or credentials. YouTube staging contacts its embed and image services; provider availability and embedding rules apply. Spotify/Mureka playback is not included.

The Inbox-only package does not capture audio or enforce playback/manual advance. Its LP/AP setting chooses the submission inbox; playback stays with Suno or a separately managed Theatre.

## Optional publishing

Publishing is explicitly started from the toolbar control window for a selected Suno tab. It captures that tab's audio, sends music to the relay chosen by the host, and restores a local monitor. It does not request microphone audio. Relay access requires a separate publish credential supplied by an authorized operator; no credential is distributed with the extension.

The publishing worker retains the token in browser-session extension storage. The relay endpoint persists in local extension storage. Suno page scripts and public listeners do not receive the token. The relay can observe the broadcaster/listener network connections as part of serving audio.

While publishing, bounded public metadata can include the current song title/artist, allowlisted artwork, available native timing, recent track context and up to 100 following rendered playlist rows. This is intentionally public broadcast information. The pilot metadata service expires stale metadata after 30 seconds; audio does not depend on metadata. Do not broadcast a private playlist if you do not want its visible song context shared. See the [broadcast guide](BROADCAST-PILOT.md).

The bundled extension has no Catnap-operated telemetry service or AI integration. Ordinary local presentation sends no metadata to the optional relay. Publishing and screen sharing are separate host choices.

## Permissions

- `storage`: local preferences, show queue/host context, relay endpoint and session-scoped authorization/publishing state.
- `tabs` and `scripting`: choose the intended uploader/Suno tab, perform the optional same-origin inbox read and install/verify its native playback guard.
- `identity` and `nativeMessaging`: explicit Suno OAuth sign-in and fixed-endpoint playlist transport through the optional helper.
- `alarms`: optional bounded AP inbox/playlist updates; stopped on restart or error.
- `activeTab` and `tabCapture`: host-initiated capture of the selected music tab.
- `offscreen`: the extension's audio publishing/monitor document.
- Suno content-script matches: local presentation and guarded native playback delegation.
- Optional HTTP/HTTPS host access: approval for the host-selected relay when publishing; public relay URLs require HTTPS. Broad optional declarations do not pregrant access to every site. Inbox/Suno authorization hosts are requested when those features are enabled.

No cookie, browser-history, debugger, microphone or Discord-account permission is requested.

## Distribution and rights

Use the unpacked download between shows. Reloading extensions or Suno can interrupt a live broadcast. Browser-store distribution and Firefox remain separate acceptance tasks.

First-party code/docs use [PolyForm Noncommercial](../LICENSE), with [required notices](../NOTICE) and separate commercial permission from Ina. AIU branding inclusion was confirmed by the maintainer on November 15, 2026. Logos, music and third-party assets retain their respective rights; see [licensing](../LICENSING.md). Original fictional artwork/lyrics are used in the example screenshots. No private inbox or name spreadsheet is distributed.

Report bugs through [GitHub issues](https://github.com/inaratalamasca/catnap-theatre/issues), including browser/extension version and reproduction steps. Remove credentials, private submissions and browser storage exports from reports. Store data-use disclosures must be reconciled with the final package before any store submission.
