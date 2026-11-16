# Catnap Radio — 0.7.0 preview

Broadcast the music playing in one desktop Chrome/Brave tab to a compatible
Catnap audio relay. Use any Suno page, or `https://party.aiu.fm/party`.
Theatre does not have to be open. No microphone, recording or LLM is involved.

## Choose a package

- **Radio:** just broadcasting, with a teal radio-tower icon. No Inbox, Suno
  sign-in helper or Theatre installation is needed. Works alongside unchanged
  Theatre Lite 0.5.0 or the separate Inbox creator.
- **Theatre + Inbox:** the same broadcaster is built in, alongside the optional
  presentation and managed-show controls.
- **Inbox creator:** reads Pending submissions and creates/updates a Suno
  playlist. It has no radio capture; use the separate Radio extension alongside
  it when needed.

Use one Catnap publisher for the show. Running two publishers does not mix
their audio; a relay/capture conflict can reject the second one. Existing
installed editions are not automatically replaced by these preview folders.

## Start broadcasting

1. Load the unpacked Radio folder in a desktop Chrome/Brave test profile and pin
   its teal icon. Linux, Windows and macOS use the same extension; Radio needs no
   native helper. Switch/install extensions between shows.
2. Open Suno or the AIU party player and start your music there normally.
3. **Click the pinned Catnap icon while that source tab is selected.** This
   selects the source and gives Chrome its required capture invocation. The page
   Radio button opens controls but may still require this toolbar click.
4. In the control window, check the selected source, enter the relay's WHIP
   address and your private publish token, then choose **Start music broadcast**.
   Grant access to that relay when asked. The token is not a listener link.
   Keep token between updates is on by default for this browser profile;
   turn it off for session-only use.
5. Wait for **Live** and the green **On Air** dot. Opening the controls, granting
   permission or seeing a starting state does not mean the broadcast is live.
6. Listeners open the relay's listener page. For the Catnap pilot, that is
   `https://listen.catnapradio.com/`. Stop broadcasting with the control window's
   **Stop** button. Closing that window keeps the broadcast running.

Radio captures audio from the selected source tab only, including embedded
media playing within it. It does not combine other tabs, Discord voices or your
microphone. Keep the source tab open. Toolbar selection in another tab does
not retarget an existing broadcast; Stop first, then select/start the new source.
The host's existing local audio monitor and stereo Opus 256 kbps target remain.

Only one host publishes the shared Catnap stream at a time. Other hosts can
sign in and prepare playlists while it is live. The relay keeps its existing
publisher instead of replacing it. With the new Catnap access service enabled,
a busy response offers **Take over broadcast**. That separate button asks for
confirmation before ending the old stream; the displaced individual key gets
a one-hour cooldown and then recovers automatically. It requires a qualified
broadcaster key, not a key-manager role. A normal Start never silently takes over.
The current legacy relay can still return a generic connection error on an
overlapping Start; takeover requires the new service and cannot fall back to
uncoordinated legacy publishing. Until it is enabled, stop the AP broadcast
before the next LP host starts. This is not automatic scheduling.

## Remembering the publish token

The radio controls can keep an extension-local copy of the key for the selected
relay origin. Normal updates/reloads of the same extension ID keep that copy,
so it does not need to be pasted at each version change. Session-only use is
available, and **Forget saved token** removes the durable copy. These choices
do not stop an already active broadcast. A different relay origin cannot
automatically reuse the saved key. The key stays in this browser profile; it
is not a cloud-synced setting or an OS password-vault entry. Removing the
extension, clearing its data or moving to a different profile/extension does
not preserve it. Older session-only builds may need the key entered once after
the first upgrade.

A green Token entered label indicates presence only; relay authentication
and the green On Air connection indicator remain separate.

## Small indicators

The AIU player's radio entry is in its upper-right area. Suno has a compact
entry too. The green On Air dot means **this tab** is the live capture source.
Another Suno tab does not inherit it. The toolbar retains LIVE/error badges.

In Theatre, the AIU logo turns green with small **On Air** text while that tab
broadcasts. A small `listen.catnapradio.com` link appears beside it only for a
live capture using Catnap's default relay. A custom relay does not receive an
invented listener address. Otherwise the logo is white with grey **No Radio** text. The combined
broadcast panel offers **Hide the Theatre button** for radio-only use; the
compact On Air entry remains available while live. This preference does not
stop audio or close an already open Theatre.

The Presentation window's status box identifies Inbox or Suno playlist mode.
Green describes a ready presentation connection with no current reported error;
it is separate from the radio On Air state.

## Metadata and limits

On Suno, the existing public metadata reader can send current song, artist,
allowlisted artwork and visible upcoming rows, even with Theatre closed. AIU
player capture currently sends audio only: it clears any previous public song
details instead of inventing a title or upcoming list. A signed-in AIU host
session and playable media remain the host's responsibility.

The publish token stays in extension-local session or saved profile storage,
never in the source page or a listener link. Page indicators receive only a
small status projection and the fixed public Catnap listener address when live.
Other hosts need their own authorized relay/token. This download does not
grant access to Catnap's publisher key, create a server or change the player
website. See [privacy](RELEASE-AND-PRIVACY.md) for the data flow.

Automated fixtures exercise source restrictions, package independence, status
ownership and UI changes. A fresh real AIU/Suno publish, audible listener test,
Discord coexistence and platform-specific browser setup remain live rehearsal
checks. The successful 0.6.10 Dev1 statuses/lyrics report does not establish these
new features.

Implementation reference: [Chrome tab capture](https://developer.chrome.com/docs/extensions/reference/api/tabCapture).

### Reopening Theatre while Radio is live

In 0.8.1, the page has separate Theatre and On Air actions. Theatre opens the presentation; On Air opens Radio controls. The explicit Hide Theatre preference still hides Theatre for radio-only use. Neither closing nor reopening Theatre restarts the active audio broadcast. The companion is unchanged from 0.8.0.

The 0.8.2 UI update retains separate Theatre/On Air actions and the unchanged 0.8 companion/audio transport. Activate only between broadcasts.
