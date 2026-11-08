# Release and privacy draft

**Draft only. No Chrome Web Store submission, Firefox release or production-readiness claim has been made.** Version 0.2.0 alpha is for local testing.

## Suggested listing

**Name:** Catnap Theatre for Suno

**Short description:** A clean listening-party view for native Suno playback: artwork, lyrics, visible playlist and host messages.

**Description:** Catnap Theatre gives hosts a readable stage for Suno listening parties without an AI subscription or server bot. Choose artwork-and-lyrics, a compact playlist layout or artwork focus. Follow lyrics approximately, adjust their size and hide section tags. Show warning graphics and text, and open a separate waiting lounge with explicitly started AIU Radio. Suno remains responsible for playback and its queue. The playlist preview shows rendered page rows only; lyrics and native controls depend on Suno’s current website markup.

**Support:** Use repository issues with the extension/browser/OS versions and reproduction steps. Never attach credentials, private connection files, whole browser storage exports or private submissions without permission.

## Privacy statement draft

Catnap Theatre does not require a Catnap account. It reads song information, artwork, lyrics and playback state from the Suno page to build the local theatre display. It does not collect those details on a Catnap server, run analytics or send them to an AI service.

Display preferences are stored locally in this extension’s browser-profile storage. Settings can be exported as a small JSON file at the host’s request. User-selected graphics and videos remain in the current page’s memory and are not uploaded by Catnap. Refreshing the Suno page forgets those files. Messages and graphics displayed in Theatre can be seen by viewers of a screen share.

The optional lounge connects directly to `streaming.aiu.fm` only when the host presses Play. AIU Radio receives an ordinary network/media request. Suno artwork/video remains subject to Suno’s own requests and services. The bundled AIU logo requires no runtime request to AIU. External links open their named services when selected.

The `storage` permission saves display preferences. Suno URL matches let the overlay read and present the page and delegate user playback actions to native controls. No cookie-reading, password collection, broad browsing history access, privileged Discord access or backend connection is requested.

Before submission, reconcile this prose with actual final code and the store’s data-use form. A draft privacy policy is not a completed store disclosure or a legal determination.

## Distribution choice

Start with a **private trusted-tester** pilot. Chrome’s dashboard supports trusted testers or a managed Google Group. “Unlisted” means anyone with the listing URL may install, so it does not establish AIU membership. All visibility options still face the same store policy and review requirements. See the [official Chrome distribution documentation](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution).

Choose the intended AIU tester group, owner/support contact and an approved asset set before submission. Preserve package IDs/keys securely once the listing exists; do not invent or commit them during setup. Store screenshots should come from the accepted release and clearly reflect actual behavior. The included fixture screenshot demonstrates layout and is not evidence of live site compatibility.

Firefox is a planned port. Follow Mozilla’s [Chrome-extension porting guide](https://extensionworkshop.com/documentation/develop/porting-a-google-chrome-extension/) and run a Firefox-specific acceptance pass. A compatible-looking manifest is insufficient evidence.

## Media and identity rights

The AIU logo was bundled from the same URL already used by Catnap’s existing extension. This establishes provenance, not permission to redistribute. Confirm AIU approval before a store package or broad distribution. Catnap’s creator credit remains in every prepared layout and lounge. Song/video rights, broadcaster rights and community policy decisions remain distinct from this display tool.

No Kraesk/Nightwire source or assets are included. The fixture art, titles and lyrics are original sample material created for the project’s layout test.
