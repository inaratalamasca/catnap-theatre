# Source provenance and changes

## Baseline captured November 8, 2026

The baseline is Catnap’s own local extension in `TheatrePresentation/Catnap-Theater-Extension-v0.1.3/`. The folder name is historical. Its current manifest declares **0.1.10**; the core userscript header declares **0.1.5**; the lyric module declares **0.2.11**; the visual module declares **1.2.0**. These are module/package versions, not proof of the version installed in Chrome.

The baseline originals were copied, never replaced. All original show data, identity records, archives and private connections remain outside this project. No KraeskAI/Theatre or Nightwire source, assets or private implementation was copied.

| Baseline file | SHA-256 |
| --- | --- |
| `manifest.json` | `c5f8a8c738f30ea0e49df7f6b5a825bea6de5e95c03c758841d4d51e28d636d4` |
| `content.js` | `7b403f1192602138a7915010920d25ed821192009bcda0ab2f69cfae606d8019` |
| `lyric-scroll.js` | `42fc03a368d92b7fe78252e82ae350e02b938b10ec5b1ff2a5734a190834255b` |
| `visual-media.js` | `ad058b780e36da620f96acc1648df00dc4b598af7ec1e29ac3c0650c3e3a1e8f` |
| `README.md` | `10fdce174782e46e0ac673a07159b72b2f26c5979d4f3cf7e61a40f2c71c7f84` |

## 0.2.0 alpha change summary

- Created a separate self-contained MV3 package with only extension storage permission and Suno content-script matches.
- Preserved native Suno playback, metadata readers, lyrics recovery, Up Next and matching-video presentation.
- Changed still artwork to `contain`.
- Removed the integrated visual-command event receiver and restored local visual controls.
- Added layout/lyric/branding settings and validated local JSON import/export.
- Added visible native playlist rows with stable-ID highlighting and guarded native Play delegation.
- Added a separate lounge with explicit user-start AIU Radio, manual schedule text and a normal Suno playlist link.
- Added focused tests, a sample fixture, a verified layout screenshot and host documentation.

The lyric module’s internal 0.2.11 label remains unchanged because its algorithm was imported unchanged. The package/core/new companion/visual module labels are 0.2.0. Version variables tag each new script; the manifest is the distributable package version.

## Bundled asset

`extension/assets/aiu-logo.png` was fetched November 8, 2026 from `https://home.aiu.fm/Assets/AI%20Underground%20White%20Logo.png`, the URL referenced by the existing Catnap extension. The maintainer confirmed permission on November 15, 2026 to include this branding in public Catnap source/downloads. It remains AIU-owned; the software license grants no general branding rights.

`tests/fixtures/sample-art.svg` and the sample lyrics/titles are original test material. The screenshot contains no real inbox/creator identity or private submission.

## Validation record

`npm run check` performs JavaScript syntax checks, manifest/script-reference and permission checks, and eight Node/jsdom tests. The first validation used the already available local jsdom 26.0.0; the repository also includes a locked development dependency for a reproducible fresh install. No runtime package or build system is required by the extension.

An isolated headless Chrome profile rendered the supplied fixture at 1600×900; the screenshot was visually inspected. It establishes layout only. Live Suno, extension-store approval, browser capture/audio behavior and Firefox compatibility remain pending the acceptance checklist.

## November 15 release housekeeping

The existing 0.4.0, 0.5.0 and toolbar-icon changes were merged into main without changing runtime JavaScript. The public early-access release includes refreshed installation/privacy guidance, noncommercial licensing, required notices and publication guards. Previously recorded evidence retains its original date and scope.
