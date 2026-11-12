# Catnap Theatre

**Development branch 0.3.0 adds an optional music-only broadcaster.** Use [the pilot guide](docs/BROADCAST-PILOT.md) before loading this isolated build. The broadcaster is not installed in Dev1 and has not been accepted in a live Discord show. The source 0.2.0 presentation remains the baseline described below.

A simple theatre overlay for people hosting Suno listening parties. Suno plays the music; Catnap displays the artwork, lyrics, visible playlist and host messages. No AI, Discord bot, uploader account, SSH tunnel or backend service is required.

**Version 0.2.0 is a prepared alpha preview, not a store release.** The source passes focused automated tests and its sample screen was inspected in an isolated headless Chrome. The new build has not been activated in Ina’s installed browser or tested against a live signed-in Suno session. Keep the current show setup until the acceptance checklist is complete.

![Three-column preview with original sample material](docs/screenshots/lineup-fixture.png)

## Try it between shows

1. Use a separate Chrome profile for testing. Do not enable the older Catnap Theatre extension in the same test profile.
2. Open `chrome://extensions`, enable Developer mode and choose **Load unpacked**.
3. Select this repository’s **extension** folder.
4. Open a Suno playlist and sign in through Suno as usual. Press **Catnap Theater** near the lower right.
5. Start the playlist with its ordinary Play control. Open **Settings** to switch layouts; open **Visuals** for warnings, files and messages.

Installing in an already open Suno tab requires a safe page refresh. A refresh can interrupt music. Test before a show, never during a live track.

## What this preview contains

- Artwork + lyrics, playlist + artwork + lyrics, and artwork-focus layouts.
- Contained artwork; a muted copy of an available matching native Suno video, with still-image fallback.
- Approximate lyric following, manual scroll correction, retry, font size and optional `[section / metadata]` line hiding.
- A visible-row playlist that follows Suno’s rendered page without refreshing it; guarded native row Play controls and a current-song marker.
- Local warning/message/image/GIF/video overlays, expiry and recent-file reuse.
- Host name, background colour and tab-local logo/background-image customization; required AIU branding and Catnap creator credit remain visible.
- Extension-local preference storage and a small JSON settings import/export.
- A separate waiting/pre-show/after-show lounge with explicit Play/Stop AIU Radio, manual next-party text and an optional Suno playlist link.

The visible list is not Suno’s internal playback queue. It cannot promise unseen rows, a refreshed server-side playlist, true lyric timestamps or automatic external-video placeholders. These limits are part of the product contract, not hidden fallbacks.

## Read next

- [User guide and storage](docs/USER-GUIDE.md)
- [Every requested feature: status and acceptance](docs/REQUIREMENTS.md)
- [Architecture and boundaries](docs/ARCHITECTURE.md)
- [Manual acceptance checklist](docs/ACCEPTANCE.md)
- [Release, privacy and distribution draft](docs/RELEASE-AND-PRIVACY.md)
- [Changes and source provenance](docs/PROVENANCE.md)

## Development checks

Install Node.js and npm, run `npm ci --ignore-scripts`, then `npm run check`. No build step is needed to load the extension. The development dependencies are for tests only and are never shipped inside the extension.

The tests verify storage validation, identity guards, layout settings, visible-row native-play delegation, keyboard safety and approximate lyric motion. They do not establish Suno compatibility or store approval. The included screenshot uses original fictional fixture art/lyrics, not a real submission.

## Project family

This is the standalone presentation project. `catnap-radio-hosting` contains the privileged host workflow and prepared browser controllers. Studio and simulcast plans belong to their own research projects. A failure or absence of the hosting backend must not stop this standalone presentation layer.
