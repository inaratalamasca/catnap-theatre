# Catnap Suno companion · 0.6.0 development

This independently implemented companion carries a narrow set of Suno MCP
playlist requests from Catnap Inbox or Theatre's shared inbox engine. It is not an LLM, background service or web
server. Chrome starts it on demand through native messaging. It uses Node.js
22 or later (Node.js 24 LTS recommended) and has no extra package dependencies.

The browser-direct transport was checked without credentials on November 15,
2026: the official Suno protected-resource metadata returned HTTP 200; an
unauthenticated MCP initialize POST returned HTTP 401 without an Origin header
and HTTP 403 with a Chrome-extension Origin. The matching preflight returned
403. This is why the development client uses an ordinary native MCP transport.
These checks did not register an OAuth client, sign in, acquire credentials or
modify any playlist.

## Linux host setup

This is a development package; do not install or reload it during a live show.
Load the intended Theatre development folder in an isolated Chrome/Brave
profile first. Copy its exact extension ID from the extensions page, then run:

```bash
bash native/install-linux.sh YOUR_32_CHARACTER_EXTENSION_ID brave
```

Use `chrome`, `chromium` or `all` instead of `brave` if appropriate. The installer
copies only this companion into your user's data directory and registers its
exact extension origin in the selected browser's native-host directory. It
does not require root or read browser credentials. A different unpacked build
or Store extension can have a different ID and needs deliberate registration.
The browser must be running on this Linux host; this does not install on Armin.

Then use **Connect Suno** from Catnap's inbox controls. You authorize your own
account through Suno's official sign-in page. Working Suno MCP account access
is required; a normal website session or subscription alone does not prove it.
The first completed Connect action registers an OAuth public client with Suno.
Registration stores a public client ID locally. Access/refresh credentials are
held only in the extension's `storage.session`; the companion receives a token
in memory for each request and never writes it to disk or logs it.

## Narrow behavior

The executable posts only to `https://api.suno.com/mcp`, refuses redirects and
accepts only MCP initialization/discovery plus these tools:

- `playlists-list`
- `playlists-list-clips`
- `playlists-create`
- `playlists-add-clips`

Requests and responses are bounded. It has no delete, audio-generation, arbitrary
URL, shell-command or cookie access. OAuth exchange runs separately in the
extension against Suno's published authorization server. **Disconnect Suno**
forgets local session credentials; it does not claim to revoke server-side grants.

Playlist writes are append-only reconciliation with membership readback. They
are never reported complete merely because a write request was sent. Empty or
short pages are followed using `next_cursor`; existing songs are not added
again. Readback confirms membership, not an independent guarantee of provider
append-order semantics. Verify the saved playlist order before a real show.

## Windows host setup

Windows 10/11 with Node.js 22+ and built-in Windows PowerShell 5.1 is required.
PowerShell 7 is not used: its Add-Type cannot build the console launcher needed
here. Load the intended Catnap extension and copy its exact extension ID.
Double-click `native/install-windows.cmd`; it prompts for that ID, or run:

```powershell
.\native\install-windows.cmd -ExtensionId YOUR_32_CHARACTER_EXTENSION_ID -Browser brave
```

The installer copies the Node script into `%LOCALAPPDATA%\Catnap-Suno-MCP`,
compiles the supplied, auditable `CatnapSunoLauncher.cs` locally using Windows'
existing .NET compiler, then registers its exact extension origin in HKCU for
Chrome/Brave/Chromium as selected. No downloaded executable, .NET SDK, administrator
rights or background service is needed. The small `.exe` launcher pipes raw
native-messaging bytes to the fixed Node executable/script; it never shells out
with arbitrary commands. The `.cmd` permits the supplied PowerShell installer
for that process only; it does not change persistent execution policy. Review
the source before running an unpacked development installer. A company policy
can still prevent local compilation, script execution or per-user native hosts.

## macOS host setup

With Node.js 22+ installed, use the intended extension's exact ID:

```bash
bash native/install-macos.sh YOUR_32_CHARACTER_EXTENSION_ID brave
```

It stores the companion under `~/Library/Application Support/Catnap-Suno-MCP`
and registers the chosen Chrome/Brave/Chromium user manifest. No root access,
downloads, global security changes or service installation is performed.

## Validation status

Mocked OAuth and MCP behavior, native framing, bounded SSE responses, Linux
installer registration under isolated temporary directories, and the installed
Linux launcher-to-Node health message are tested. **Windows compilation/registry
and macOS browser launch have not been run on those operating systems.** Their
installer/source files are development candidates and need platform rehearsal
before describing them as supported releases. No real host installation,
end-to-end account authorization or real playlist write was performed.

`node scripts/native-platform-smoke.mjs` builds disposable installer output,
checks exact-origin manifests and exchanges a framed health message through the
real installed launcher. The Linux check passes locally. The dedicated
`native-platform.yml` workflow runs the same smoke on GitHub-hosted Linux,
Windows and macOS; those remote results must be checked after the branch is
pushed. Windows smoke uses `-NoRegister` and a temporary LOCALAPPDATA, so it
does not alter HKCU; macOS smoke supplies a dedicated temporary Application
Support root without changing HOME. These checks need no Suno credentials or
provider requests. They test launcher/platform mechanics, not actual browser
native messaging or Suno account approval.

To remove this companion later, remove its exact `com.catnap.suno_mcp.json`
registration file from the selected browser's `NativeMessagingHosts` directory,
then remove the `catnap-suno-mcp` directory under your user's data directory.
Browser authorization and the Suno-side grant are separate.

Primary implementation references:

- https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
- https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/add-type?view=powershell-5.1
- https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/extensions/api/messaging/launch_context_win.cc
