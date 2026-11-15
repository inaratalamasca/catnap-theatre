# Persistent Theatre controls — development version 0.5.0

Open Theatre in your Suno tab and click **Controls ↗** in its header.
A separate control window stays open while you work in other tabs. Choosing
Controls again brings that same window forward. Closing the window
leaves Theatre and the music running.

The presentation canvas no longer has Settings or Visuals menus, lyric-option
buttons, or focusable configuration fields. These options live in the popout.
Normal play/pause, previous/next, seeking, visible-playlist navigation and Close
remain available on Theatre.

The window includes the existing presentation options:

- Layout, lyric size, cue-line hiding, lyric following and Reload lyrics.
- Host name, background colour, local logo and background image.
- Music-reactive background bars, their enable switch and 5–40% opacity.
- Muted song video, quick banners, custom banner text, local image/GIF/video,
  recent files, placement, timeout, Show overlay and Clear overlay.
- Settings export/import/reset and the lounge link.

The popout uses Theatre's existing local handlers and validated settings.
Changes appear in the linked Theatre. Internal adapter controls are hidden,
inert and excluded from keyboard/accessibility navigation; the compatible
advanced controller can still use those same handlers.
Presentation preferences remain in this browser profile. Local files
remain in their Suno tab; they survive closing/reopening the control window,
but are not saved into settings exports or retained after the Suno tab closes.
Local uploads stay within the browser and are never sent to a server.

For official/semi-official AIU shows, use the **AIU uploader** banner. The
retained chat-drop preset is explicitly marked **emergency / non-AIU**; showing
a banner does not itself change intake or enable a bot.

Each control window is linked to the Suno tab that opened it. Opening controls
from a second Suno tab creates a separate, linked window. Presentation commands
cannot start/pause music, select songs, change the playlist, start capture,
stop a broadcast or change the broadcast source tab. Use the existing
broadcast window for broadcasting controls.

This package is a separate development build. Unpack it into a new folder and
load **that folder's `extension/` directory** when ready to test. Disable the
older Catnap Theatre extension in that testing profile first, so two copies
do not compete for the same Suno page. Loading/reloading an extension while it
is broadcasting interrupts its capture, so perform that handoff between shows.
The previous loaded extension folders have not been modified by this work.

Verification used an isolated temporary Chromium profile and a synthetic Suno
fixture, with no real user profile or live stream. It covered real control
window creation/reuse, saved-setting changes, banner display/clear, local
image transfer/rendering, close/reopen persistence and separate source tabs.
It also checks that configuration menus/fields are absent from the main
presentation's accessibility tree while its playback controls remain available.
It recorded no native playback clicks, captures or offscreen documents, and
kept an existing broadcast-source binding unchanged. Actual Brave streaming
use, large local files and full-show duration remain manual acceptance checks.
