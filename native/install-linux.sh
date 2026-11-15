#!/usr/bin/env bash
# SCRIPT_VERSION: 0.6.0
# Change summary: register the restricted Catnap Suno stdio companion for one
# explicit extension ID in the current user's Chrome/Brave/Chromium profiles.
set -euo pipefail
SCRIPT_VERSION='0.6.0'
CATNAP_EXTENSION_ID="${1:-}"
CATNAP_BROWSER="${2:-all}"
if [[ ! "$CATNAP_EXTENSION_ID" =~ ^[a-p]{32}$ ]]; then
  printf 'Usage: bash install-linux.sh EXTENSION_ID [chrome|brave|chromium|all]\n' >&2
  exit 2
fi
case "$CATNAP_BROWSER" in chrome|brave|chromium|all) ;; *) printf 'Unknown browser selection.\n' >&2; exit 2 ;; esac
CATNAP_NODE="$(command -v node || true)"
if [[ -z "$CATNAP_NODE" ]]; then printf 'Install Node.js 22 or later first.\n' >&2; exit 1; fi
"$CATNAP_NODE" -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)' || { printf 'Node.js 22 or later is required.\n' >&2; exit 1; }
CATNAP_SOURCE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CATNAP_DATA_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/catnap-suno-mcp"
CATNAP_CONFIG_ROOT="${XDG_CONFIG_HOME:-$HOME/.config}"
mkdir -p -- "$CATNAP_DATA_ROOT"
cp -- "$CATNAP_SOURCE/catnap-suno-host.mjs" "$CATNAP_DATA_ROOT/catnap-suno-host.mjs"
# A fixed launcher uses the verified Node path, without relying on the browser's
# environment or adding a persistent server/background service.
printf '#!/usr/bin/env bash\n# Catnap Suno native host %s\nexec %q %q\n' "$SCRIPT_VERSION" "$CATNAP_NODE" "$CATNAP_DATA_ROOT/catnap-suno-host.mjs" > "$CATNAP_DATA_ROOT/launch.sh"
chmod 700 -- "$CATNAP_DATA_ROOT/launch.sh"
for CATNAP_NAME in chrome brave chromium; do
  if [[ "$CATNAP_BROWSER" != all && "$CATNAP_BROWSER" != "$CATNAP_NAME" ]]; then continue; fi
  case "$CATNAP_NAME" in
    chrome) CATNAP_MANIFEST_DIR="$CATNAP_CONFIG_ROOT/google-chrome/NativeMessagingHosts" ;;
    brave) CATNAP_MANIFEST_DIR="$CATNAP_CONFIG_ROOT/BraveSoftware/Brave-Browser/NativeMessagingHosts" ;;
    chromium) CATNAP_MANIFEST_DIR="$CATNAP_CONFIG_ROOT/chromium/NativeMessagingHosts" ;;
  esac
  mkdir -p -- "$CATNAP_MANIFEST_DIR"
  "$CATNAP_NODE" --input-type=module - "$CATNAP_DATA_ROOT/launch.sh" "$CATNAP_EXTENSION_ID" "$CATNAP_MANIFEST_DIR/com.catnap.suno_mcp.json" <<'NODE'
import {writeFileSync} from 'node:fs';
const [launcher, extensionId, target] = process.argv.slice(2);
const manifest = {name:'com.catnap.suno_mcp',description:'Catnap Theatre restricted Suno playlist MCP client',path:launcher,type:'stdio',allowed_origins:['chrome-extension://'+extensionId+'/']};
writeFileSync(target,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
NODE
  printf 'Registered Catnap Suno companion %s for %s.\n' "$SCRIPT_VERSION" "$CATNAP_NAME"
done
printf 'In Theatre, choose Connect Suno and complete your own authorization.\n'
