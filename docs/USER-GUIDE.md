# Host guide — Catnap Theatre 0.5.0 development

## Before the party

Load the extension in a test browser profile first, following the README. It runs on Suno only. Your sign-in stays with Suno; Catnap never asks for a Suno password, token or API key. Do not install the older and new Theatre extension in the same profile: they share presentation element IDs and can interfere.

Open your playlist, then press **Catnap Theater**. Suno’s own music controls still own playback. Theatre’s bottom controls delegate to the same native player. Use a normal browser tab/window capture for your stream; the optional HQ audio broadcaster has its own toolbar control window. See [the broadcast guide](BROADCAST-PILOT.md).

Press **Esc** or the top-right **×** to leave Theatre. **Alt+Shift+T** toggles it on playlist/song pages. Space plays/pauses; Left/Right seeks five seconds; Shift+Left/Right asks Suno for the previous/next song. Keys inside form fields and buttons keep their normal purpose.

## Choose a screen

Click **Controls ↗** in the Theatre header. In the separate control window, choose:

- **Artwork + lyrics** for the uncluttered two-panel view.
- **Playlist + artwork + lyrics** for a compact list at left. Small screens hide the list so the song remains readable.
- **Artwork focus** to show off artwork or an instrumental track. Lyrics still remain available when you switch back.

The list shows only tracks Suno has rendered on the current playlist page, deduplicated by song ID. It updates locally about every 1.2 seconds. New submissions will appear only after Suno renders them. Catnap never reloads the page to discover additions. Suno’s queue, repeat and shuffle may differ from the page order. Up Next is explicitly a list-order preview; shuffle displays an honest uncertainty message.

A row can start playback only when Catnap finds an unambiguous native Play button within that song’s row. A dim row is a readable preview; select it in Suno’s normal view instead. The current-song marker comes from Suno’s playbar, not from guessing the last row clicked.

## Lyrics

**Auto-scroll** uses elapsed time and total duration to move approximately through the available text. It is not word timing or karaoke. Scroll/swipe to correct the position and following continues from there. Paused audio holds the text. Switch Auto-scroll off for full manual control.

Use **A− / A+** in Controls for 14–40 px lyrics. **Hide [section / metadata] lines** removes entire bracketed lines from view; inline brackets and multilingual lyric text remain. Switch it off to recover the original displayed text. It does not rewrite Suno’s lyrics.

If a song’s text is missing, press **Reload lyrics**. This reopens Suno’s native song-details panel without restarting music. The reader also retries while tracks change and has a bounded fallback for plain multilingual text without a Copy control. Unsupported markup still produces a clear unavailable message; it does not invent lyrics. Some site changes will need an adapter update.

## Art, messages and warning graphics

Artwork uses **contain**, so its edges stay visible. Animated song video is a muted copy only when the current song can be matched to a native Suno video. **Controls → Play available song video** can disable it. Missing or blocked video leaves the still artwork visible.

Open **Controls** for warning presets, Submit via Uploader, No More Tracks, Quick Break and Thanks for Listening. Official and semi-official AIU shows use the uploader/inbox. A separately labeled emergency/non-AIU chat-drop preset is retained for those explicit exceptions. Edit **Banner text**, select an optional local image/GIF/video and choose its placement. Pick an expiry or Until cleared, then Show overlay. Clear overlay removes both text and file. The recent list holds up to five files within a 100 MiB tab-memory budget. MP4/WebM overlays are muted. A banner does not open/close request intake or perform a moderation action.

Everything displayed in Theatre is visible to anyone watching the shared tab. Presentation options stay in the separate control window. Closing that window leaves the music and Theatre running.

## Background music bars

In **Controls → Background visualizer**, enable the optional lower-edge bars and adjust opacity from 5–40 percent (default 20). They sit behind all artwork, lyrics, playlist and overlays. Silence or unavailable analysis leaves a quiet background; reduced-motion mode suppresses the animation. The bars use cloned stream-backed music or the existing HQ broadcaster analyser. Ordinary URL-backed music needs HQ broadcasting for the bars to respond. They never request microphone audio or start another broadcast.

## Customize and save

Controls saves layout, font size, cue-line preference, host name, background colour and visualizer preferences in this extension’s storage in the current browser profile. It does not synchronize to another browser or machine. **Save settings file** downloads a small JSON file. **Load settings file** restores that format only. Reset settings restores defaults.

**Host logo** and **Background image** accept PNG/JPEG/WebP/GIF up to 20 MB each. They remain in this page’s memory, including a Theatre close/reopen. They disappear on a page refresh. They are not included in exported settings. The AIU logo and “Created by Catnap Radio” credit remain.

Local images and overlay files are selected through the ordinary file picker. Catnap cannot scan your folders. Keep reusable graphics together in a folder you can find, then pick them again after a refresh. Permanent asset-library storage is a later feature.

## Waiting, pre-show and after-show

Choose **Open waiting / pre-show / after-show lounge** in Controls, or the extension’s Options entry. It opens a separate extension page suitable for tab capture.

Select the screen under Lounge settings. Enter next-party details yourself; they are saved locally and are not an automatically fetched AIU schedule. Pause Suno and any other radio source first, then press **Play AIU Radio**. Stop radio before returning to the show. The lounge cannot silence another browser tab or stop automatically at a future showtime. Switching scenes does not pause radio; Stop and closing the page do.

You can save a full Suno playlist link there. Opening it stops the lounge radio and opens Suno, where you start playback normally. This is a link convenience, not an embedded playlist player.

## When something fails

| Symptom | What to do |
| --- | --- |
| No launcher | Confirm Suno playlist/song page, extension enabled, correct test profile. Refresh safely if installed after the tab was opened. |
| Wrong or missing lyrics | Try Reload lyrics. Leave Theatre and open the current song’s details in Suno if necessary. Do not refresh mid-song. |
| Incomplete list | It reflects rendered rows only. Let Suno load rows outside Theatre; avoid assuming the list is the loaded audio queue. |
| Row cannot be clicked | Suno exposes no unambiguous row Play control. Select in Suno directly. |
| Still art instead of video | Enable video in Controls; Suno must expose a matching native video and allow it to play. |
| Graphic vanished after refresh | Files are tab-local. Select it again from your graphics folder. |
| Radio is silent | Press Play; check volume, network and browser audio. The full AIU Radio link is a fallback. |
| Two songs/radios playing | Stop the lounge radio and pause other playback tabs manually. |

When reporting a problem, include Chrome/OS version, Catnap version, layout, a public song/playlist URL if shareable, the action and the visible result. Do not include credentials, connection files, private messages or whole browser storage dumps.
