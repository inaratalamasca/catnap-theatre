# Standalone requirements and acceptance

Updated November 12, 2026 from Ina’s ongoing requests. **Prepared** means code exists and focused fixture checks pass where listed. It does not mean verified on live Suno. **Planned** means no claim of working implementation.

| Requested feature | 0.5.0 development status | Acceptance / limitation |
| --- | --- | --- |
| AI-free standalone Chrome overlay | Prepared | No bot/API/AI/tunnel dependency; confirm signed-in Suno playback manually. |
| Firefox bonus | Planned | Port and test storage/runtime APIs, manifest and media behavior; do not claim compatibility from MV3 alone. |
| Minimal two-sided layout | Prepared | Contained artwork left, lyrics right, branding top, native controls bottom. |
| Kraesk-like list/art/lyrics layout | Prepared | Optional three columns; native visible rows only. Screenshot fixture inspected. |
| Future selectable facings | Foundation | Fixed layout enum; add supported layouts deliberately. No arbitrary CSS editor. |
| Basic automatic lyric scroll | Prepared; motion tested | Elapsed/duration estimate; pause, manual adjustment and disable covered by DOM test. Not synchronized line timestamps. |
| Swipe/manual lyric correction | Prepared | Browser scrolling becomes the new anchor; confirm touch input manually. |
| No speed-adjustment complexity | Prepared | One Auto-scroll toggle; no speed setting. |
| Font +/- | Prepared; tested | 14–40 px, stored per profile. |
| Optional metadata stripping | Prepared; tested | Entire bracketed lines hidden; inline brackets retained. Toggle restores original display. |
| Reload/recover missing lyrics | Inherited prepared | Native details reopen and multilingual fallback. Cannot promise recovery from every site/content issue. |
| Maximize uncropped artwork | Prepared | Image/video use contain. Inspect wide and tall art live. |
| Animated Suno artwork | Inherited prepared | Matching exposed Suno native video only; muted copy, still fallback. |
| Art-only maximize | Prepared | Artwork-focus layout, header/controls retained. |
| Simple storage/file model | Prepared | Profile settings; JSON export/import; files explicitly selected and tab-local. |
| Waiting / pre-show / after-show | Prepared | Separate extension lounge page, selectable screens. |
| AIU Radio on those screens | Prepared | Explicit Play/Stop, volume; existing stream endpoint. No other-tab audio suppression or scheduled stop. |
| Own playlist(s) instead of radio | Partial | Save/open one Suno playlist link; stops lounge radio, native Suno playback starts manually. Multiple lists/embedded selector planned. |
| Next AIU LP schedule | Partial | User-entered next-party text; live schedule integration planned with a supported source. |
| Warning images and host messages | Inherited restored controls | Local PNG/JPEG/WebP/GIF/MP4/WebM plus warning/message presets. |
| “Taking tracks in uploader” / “Drop tracks in chat” | Prepared | Normal AIU preset points to the uploader; retained chat-drop preset is explicitly emergency/non-AIU. Text alone does not change intake state. |
| Typeable text | Prepared | 240-character banner, rendered as plain text. |
| Clean left-side playlist | Prepared | Fixed readable list, not arbitrary layout editing. |
| Keep updated without music interruption | Partial | Polls rendered rows; never reloads or fetches private endpoints. Server additions Suno has not rendered remain unavailable. |
| Show current playing | Prepared; tested | Match stable song ID from native playbar. |
| Select song from list | Guarded prepared; tested | Only if exact native row Play control exists; disabled otherwise. |
| YouTube full-area playback | Planned, low priority | Manual tab switching remains supported workflow. No YouTube host permissions. |
| YouTube placeholder recognition | Planned | Requires explicit per-slot mapping; lyrics/rights must not be borrowed from placeholder. |
| Paste YouTube URL live | Planned | No claim of embedding or external autoplay. |
| Pause on placeholder | Planned | Needs verified placeholder policy and native queue guard; do not infer from text. |
| Separate admin controls | Prepared; tested | One Controls entry opens a persistent source-tab-bound window for all presentation options. Native playback/navigation and Close stay on Theatre. |
| Subtle background music bars | Prepared | Lower-edge translucent bars below all foreground panels, enable/opacity settings, reduced-motion and quiet fallback; see visualizer guide. |
| Optional HQ music broadcast | Development pilot | One selected music tab; separate toolbar controls. Live listener and buffered Radio documented in the broadcast guide. |
| Public song artwork and short/expanded upcoming display | Prepared | Bounded public metadata from the pinned source; unknown timing stays unknown. Visible rows are not a hidden playback queue. |
| Anyone can host an AP/impromptu party | Intended; release gate | Standalone dependencies removed, but distribution waits on real host testing and rights review. |
| Custom user branding | Prepared | Host name, colour and tab-local logo/background image. |
| Optional Catnap user logo | Prepared | Custom logo replaces cat outline; Catnap creator credit remains. |
| AIU logo + Created by Catnap credit | Prepared | Bundled current logo and permanent credit; confirm asset redistribution permission before wider release. |
| Private Chrome distribution once stable | Planned | Trusted testers/private distribution; store package not submitted. |
| Shared contracts with integrated Theatre | Prepared, guarded parity | Shared presentation files have an exact inventory/hash check. Advanced retains its original visual bridge/protocol; standalone accepts no external controller commands. |

A browser extension cannot guarantee a complete or current remote playlist from a partially rendered page. A supported Suno integration or host-triggered refresh workflow is a separate design decision. The standalone default favors uninterrupted native audio.
