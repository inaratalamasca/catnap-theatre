# Music-only broadcast pilot — 0.3.0 development build

Prepared November 12, 2026. This is a test build, not a production acceptance claim.

The standalone 0.2.0 Theatre presentation remains the baseline. Version 0.3.0 adds an optional toolbar music broadcaster. Theatre still works when the relay is absent. Neither Discord voice, microphone audio, video, recording, bots nor AI is part of this broadcast path.

## Safe installation between shows

The stable Dev1 unpacked extension currently points at the source repository's `extension` directory. This development build is deliberately isolated in a worktree and release ZIP; that live folder was not changed.

1. Stop any current show and finish the stream before changing extensions.
2. In the chosen test profile's extensions page, disable the existing Catnap Theatre. **Never enable this and the older Theatre together**: they share page element IDs/content-script behavior.
3. Extract `Catnap-Theatre-Broadcast-Dev-v0.3.0.zip` and Load unpacked its `extension` folder. This does not modify the stable installation or its settings.
4. Open a test Suno song/playlist. If needed, refresh that tab before a show; a refresh can interrupt music.
5. Pin the new Catnap toolbar action. Click it from the actual Suno music tab.
6. Relay address defaults to `https://listen.catnapradio.com/live/whip`. Enter the private publish token supplied separately. It is never bundled in the extension, written into the Suno page or sent to listeners.
7. Click **Start music broadcast**. Grant optional access to that specific relay when the browser asks. Read **Live** rather than treating accepted signaling as proof of flowing audio.
8. The control window can close; the offscreen publisher remains active. Reopen it for music level, state or **Stop**. Stop releases capture, restores normal tab playback and deletes the relay session where reachable.

The toolbar opens a small separate extension window so that the relay permission prompt cannot dismiss the controls mid-start. The source Suno tab is bound by the toolbar invocation and stays selected even when the control window has focus.

The token remains in `chrome.storage.session` until the browser session ends. Relay endpoint alone persists in `chrome.storage.local`. The extension has no cookie, debugger or microphone permission. HTTP endpoints are accepted only for private IP/localhost pilot hosts; public endpoints require HTTPS.

## Listener arrangement

Open the provided HQ listener link, tap Play, and mute only the Discord presentation's **stream audio**. Keep individual Discord users audible, including Ina/Len. Master Discord mute/deafen is not the intended arrangement. A short mobile guide still needs to be verified against the actual app controls.

## First rehearsal checks

- Validate publisher and receiver on a test song, preserving stereo and clean levels.
- Start Discord tab sharing, then start and stop this broadcaster. Confirm local monitor, Discord sharing and music continuation remain correct. Chrome tabCapture changes local output and the offscreen document restores one monitor; simultaneous sharing is not yet live-verified.
- Measure PC latency and drift for 30 minutes; aim for 1–2 seconds normally and investigate sustained values over five seconds.
- Test iPhone Safari and Android Chrome with the screen locked, plus Wi-Fi/cellular handoff and Discord voices active. Higher mobile buffering is accepted; continued playback is not yet certified.
- Confirm failed authentication, unreachable relay and source-tab closure leave no ongoing capture.
- Do not reload/update an active extension during a show. If uncertain, revert by disabling this dev build and enabling stable Theatre between shows.

## Transport and future relay

The publisher sends one audio-only Opus stream, negotiating stereo and a 256 kbps maximum/target. Browser congestion control can send less; the displayed bitrate is a target, not a measured throughput guarantee. Microphone capture is never requested. There is no automatic reconnect or silent recapture; an interrupted connection reports its state and the host can Stop/Start deliberately.

Armin is the local pilot relay. Public player: `https://listen.catnapradio.com/`. Its TLS certificate/routing must be ready before using that address. The private LAN fallback is `http://192.168.1.15:4355/live/whip`; port 4355 serves HTTP, not HTTPS. Public listener connectivity depends on the deployment's TLS and media-port configuration. The same WHIP client can later target a VPS by changing its endpoint and token; no Theatre rebuild is required.

## Automated evidence

`npm run check` verifies syntax, references, baseline Theatre behavior and focused broadcast tests: endpoint security, stereo negotiation, authentication, live state, duplicate start prevention, cleanup, capture cancellation, late WHIP allocation cleanup, and rejection of video/missing audio. Mocked transport tests do not certify browser capture, audible quality, screen-off playback, latency or 30-listener capacity.

Primary implementation references: [Chrome tab capture/offscreen](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture), [MediaMTX WHIP publishing](https://mediamtx.org/docs/publish/webrtc), [WHIP RFC 9725](https://www.rfc-editor.org/rfc/rfc9725.html).

## Isolated browser verification — November 12

A temporary Google Chrome 157 profile loaded this actual unpacked MV3 build. All Suno-origin requests were intercepted with a local synthetic two-tone test fixture; no real Suno account or user browser profile was accessed. The toolbar action was genuinely invoked through Chrome's extension test interface.

This caught and corrected two issues that mocked transport tests could not find: native relay permission prompts dismissed the initial action popup (controls now use a persistent small extension window), and Chromium rejects mixing legacy tab-capture mandatory constraints with standard audio-processing constraints (processing settings now apply to the captured track afterward).

Verified internal capture stage: real tabCapture → offscreen audio monitor → live HTTPS WHIP relay on Armin → Live state and nonzero level meter. The actual control-window Stop button then reported Stopped, Chrome reported the capture as stopped, and the synthetic source AudioContext remained running. All temporary Chrome processes and the test publisher were closed afterward.

The first-run native optional-host permission dialog cannot be answered in this headless harness. It correctly prevented the normal Start flow until approval; the capture-stage test invoked the internal worker stage after genuine toolbar invocation, without changing shipped permissions or the Suno whitelist. Therefore the full first-run consent-to-Start interaction still requires a manual rehearsal. Actual captured channelCount/sampleRate and audible monitoring were not measured in this MV3 test; do not infer these from target settings. Discord coexistence, real Suno playback, mobile behavior and latency remain manual acceptance items.
