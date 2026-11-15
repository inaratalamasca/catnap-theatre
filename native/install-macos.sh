#!/usr/bin/env bash
# SCRIPT_VERSION: 0.6.0
# Change summary: register the exact Catnap extension for this macOS user's
# Chrome/Brave/Chromium. Node.js 22+ is an explicit prerequisite; no downloads.
set -euo pipefail
SCRIPT_VERSION='0.6.0'
CATNAP_EXTENSION_ID="${1:-}"
CATNAP_BROWSER="${2:-all}"
if [[ "$(uname -s)" != Darwin ]]; then printf 'Use this installer on macOS only.\n' >&2; exit 1; fi
if [[ ! "$CATNAP_EXTENSION_ID" =~ ^[a-p]{32}$ ]]; then
  printf 'Usage: bash install-macos.sh EXTENSION_ID [chrome|brave|chromium|all]\n' >&2
  exit 2
fi
case "$CATNAP_BROWSER" in chrome|brave|chromium|all) ;; *) printf 'Unknown browser selection.\n' >&2; exit 2 ;; esac
CATNAP_NODE="$(command -v node || true)"
if [[ -z "$CATNAP_NODE" ]]; then printf 'Install Node.js 22 or later first.\n' >&2; exit 1; fi
"$CATNAP_NODE" -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)' || { printf 'Node.js 22 or later is required.\n' >&2; exit 1; }
CATNAP_SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# A dedicated override permits an isolated smoke test without repurposing HOME
# or registering a host in a real browser profile. Ordinary installation uses
# the platform's documented per-user location.
CATNAP_APPLICATION_SUPPORT="${CATNAP_NATIVE_APPLICATION_SUPPORT:-$HOME/Library/Application Support}"
if [[ "$CATNAP_APPLICATION_SUPPORT" != /* ]]; then printf 'Application Support root must be absolute.\n' >&2; exit 2; fi
CATNAP_DATA_ROOT="$CATNAP_APPLICATION_SUPPORT/Catnap-Suno-MCP"
mkdir -p "$CATNAP_DATA_ROOT"
cp "$CATNAP_SOURCE/catnap-suno-host.mjs" "$CATNAP_DATA_ROOT/catnap-suno-host.mjs"
printf '#!/usr/bin/env bash\n# Catnap Suno native host %s\nexec %q %q\n' "$SCRIPT_VERSION" "$CATNAP_NODE" "$CATNAP_DATA_ROOT/catnap-suno-host.mjs" > "$CATNAP_DATA_ROOT/launch.sh"
chmod 700 "$CATNAP_DATA_ROOT/launch.sh"
for CATNAP_NAME in chrome brave chromium; do
  if [[ "$CATNAP_BROWSER" != all && "$CATNAP_BROWSER" != "$CATNAP_NAME" ]]; then continue; fi
  case "$CATNAP_NAME" in
    chrome) CATNAP_MANIFEST_DIR="$CATNAP_APPLICATION_SUPPORT/Google/Chrome/NativeMessagingHosts" ;;
    brave) CATNAP_MANIFEST_DIR="$CATNAP_APPLICATION_SUPPORT/BraveSoftware/Brave-Browser/NativeMessagingHosts" ;;
    chromium) CATNAP_MANIFEST_DIR="$CATNAP_APPLICATION_SUPPORT/Chromium/NativeMessagingHosts" ;;
  esac
  mkdir -p "$CATNAP_MANIFEST_DIR"
  "$CATNAP_NODE" --input-type=module - "$CATNAP_DATA_ROOT/launch.sh" "$CATNAP_EXTENSION_ID" "$CATNAP_MANIFEST_DIR/com.catnap.suno_mcp.json" <<'NODE'
import {writeFileSync} from 'node:fs';
const [launcher, extensionId, target] = process.argv.slice(2);
writeFileSync(target,JSON.stringify({name:'com.catnap.suno_mcp',description:'Catnap restricted Suno playlist MCP client',path:launcher,type:'stdio',allowed_origins:['chrome-extension://'+extensionId+'/']},null,2)+'\n',{mode:0o600});
NODE
  printf 'Registered Catnap Suno companion %s for %s.\n' "$SCRIPT_VERSION" "$CATNAP_NAME"
done
printf 'Return to Catnap Inbox and choose Connect Suno. Complete your own authorization.\n'
