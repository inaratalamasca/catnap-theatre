# Architecture — version 0.2.0 alpha

```text
Suno page and its native audio/queue
  ├─ DOM text/art/video → content.js → presentation root
  ├─ native audio time → lyric-scroll.js → approximate lyric position
  └─ rendered playlist rows → standalone.js → compact preview/native Play

Extension chrome.storage.local ← validated display preferences
Local file picker → page-memory Blob URLs → visual-media.js / branding

Separate lounge.html + lounge.js
  ├─ explicit radio Play → AIU stream audio
  └─ optional playlist link → Suno tab (lounge radio stops)
```

## Source roles

- `content.js`: original Catnap DOM adapter, overlay structure, metadata/lyric extraction, contained still artwork, Up Next and native playback controls. Prepared upstream module was labelled 0.1.5 within a 0.1.10 manifest.
- `lyric-scroll.js`: upstream 0.2.11 module; plain multilingual fallback, native details retry and approximate time following. It observes progress and never seeks audio.
- `visual-media.js`: standalone 0.2.0 variant of Catnap’s 1.2.0 visual layer. Full local controls restored; controller DOM command receiver removed.
- `helpers.js`: fixed settings schema, strict Suno song URL identity and cue-line classification. Shared with tests.
- `standalone.js`: layout/settings/branding UI, preference persistence, explicit import/export, rendered-row list with guarded native Play delegation.
- `lounge.*`: separate extension waiting screens and explicitly started AIU Radio; no access to audio in another tab.

## Permission and data boundary

MV3 content scripts match `https://suno.com/*` and `https://www.suno.com/*`, top frame only. The sole extension API permission is `storage`. There is no service worker, cookies permission, debugger API, `tabs` permission, private API fetch, token scraping or backend bridge.

Content scripts have access to data in the Suno page by design. This preview reads title/artist/art/lyrics and native playback state, keeping it local. It does not export listening history, authenticate on the user’s behalf, send analytics or communicate with a hosted Catnap service. Suno itself still performs its own normal network requests. Copying a matching song video may cause a second media request/cache read.

The bundled AIU logo and lounge entry page are exposed only to the supported Suno origins. The lounge entry must be web-accessible so the host can open it from its Suno-page link. The lounge loads only its packaged scripts/styles and the AIU Radio stream. Settings import accepts a versioned fixed schema, ignores extra fields, bounds lengths/numbers and rejects unsupported versions. It does not import HTML, script, URLs or file paths.

A trusted local file is shown with a Blob URL. Files never become web-accessible extension resources or uploads. Media is muted; user-selected files and displayed messages are still visible in a screen share.

## Reliability limits

All Suno selectors are implementation details of its website, not a supported API contract. The adapter can break as the site changes. It opens/reopens the native song-details panel to request displayed lyrics; it does not force a whole-page refresh or restart a track. The current visible playlist is not the server playlist or the internal playback queue. It never pretends that list order is shuffle order.

Native song-row play controls are re-resolved at click time by stable ID. If the associated native button is not unambiguous, the row is disabled. No hidden navigation, playlist writes or fallback to an unrelated Play button occurs.

The older Catnap and new standalone extension share element IDs to preserve the inherited presentation modules. Do not enable both in the same profile. A later coexistence design needs explicit IDs/contracts and should be tested before parallel installation.

## What belongs outside this project

Discord intake/posting/reactions, AIU uploader leases, backend queue persistence, Suno MCP credentials, show-production AI, cue PDFs and vetted-host controls belong to the hosting project. OBS encoding, simulcast and independent broadcast surfaces belong to the studio/audio roadmap. Adding any of these must not make the standalone player require them.
