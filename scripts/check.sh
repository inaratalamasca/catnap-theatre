#!/usr/bin/env bash
# Catnap Theatre verification. Version 0.3.0.
# Change summary: validate JavaScript, extension references and focused DOM tests.
set -euo pipefail
SCRIPT_VERSION='0.3.0'
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
printf 'Catnap Theatre checks %s\n' "$SCRIPT_VERSION"
cd -- "$PROJECT_DIR"
for script_file in extension/*.js; do node --check "$script_file"; done
node -e 'const fs=require("fs");const m=JSON.parse(fs.readFileSync("extension/manifest.json"));if(m.manifest_version!==3)throw Error("Expected MV3");for(const s of m.content_scripts)for(const p of s.js)if(!fs.existsSync("extension/"+p))throw Error("Missing script: "+p);if(m.permissions.join()!=="storage,activeTab,tabCapture,offscreen")throw Error("Review changed permissions");if(!fs.existsSync("extension/"+m.background.service_worker))throw Error("Missing worker");'
npm test
