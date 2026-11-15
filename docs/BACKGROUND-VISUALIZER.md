# Background music bars — 0.5.0 development build

The optional visualizer draws translucent teal/lavender bars along Theatre's
lower edge. The canvas is above the background and below every foreground panel,
including artwork, lyrics, playlist, transport, banners and host overlays. It
does not accept pointer input. Silence settles to an empty background.

Open **Controls → Background visualizer** to enable the bars or adjust opacity
from 5–40 percent. The default is 20 percent. The animation respects the browser's
reduced-motion preference and uses a bounded rendering resolution and frame rate.

## Audio source and ownership

Native analysis is available only when the music element already exposes a
stream (`srcObject`). The analyser receives cloned input tracks; cleanup stops
only those clones and never the original tracks. The visualizer never replaces
the native source, calls its Play/Pause controls, or connects the analysis output
to speakers.

URL-backed music is not captured directly. Isolated Chromium tests exposed an
original-track lifetime problem when an element using `captureStream()` later
changed to stream-backed playback, even without Catnap cleanup calls. This path
is deliberately excluded. For ordinary URL-backed Suno audio, start the optional
HQ broadcaster to supply music data safely through its existing analyser.

When the optional broadcaster is active, its existing monitor analyser can
supply a small spectrum projection to the pinned source tab. This does not start
another capture or broadcast. The projection remains inside the extension;
credentials are not sent to content scripts.

No microphone permission, recording, external audio upload or AI service is
required by the visualizer. If no safe analyzable music source is available,
the background stays quiet rather than displaying unrelated simulated movement.
URL-only playback without HQ broadcasting stays quiet; the control panel explains how to enable a supported source.

## Verification and installation

Development checks cover reaction to actual generated stream audio, silence,
enable/disable, source changes and cleanup while preserving the original audio.
Layer and accessibility checks cover the canvas and pop-out-only options. The
advanced build must pass shared-file parity and preserve its controller bridge.

An isolated actual-Chromium rehearsal measured generated stream-backed music
response and silence, then nonzero source audio after disable, re-enable and
source changes. All original input tracks stayed live. It recorded no native
captureStream call, microphone access, native play/pause, mute/volume mutation
or analysis connection to speakers. This is fixture evidence; signed-in Suno
and full-show coexistence remain rehearsal checks.

This update is packaged separately from the running extension. Load it between
broadcasts, or after a deliberate stop, because extension changes can interrupt
an active capture. See the pilot and presentation-control guides.

Primary API references:

- [Media Capture from DOM Elements](https://www.w3.org/TR/mediacapture-fromelement/)
- [Web Audio API](https://www.w3.org/TR/webaudio/)
