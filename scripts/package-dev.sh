#!/usr/bin/env bash
# Catnap Theatre development package. Version 0.3.0.
# Change summary: package extension-only pilot, safe installation guide and checksum.
set -euo pipefail
SCRIPT_VERSION='0.3.0'
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="${1:-$PROJECT_DIR/dist}"
mkdir -p -- "$OUTPUT_DIR"
OUTPUT_DIR="$(cd -- "$OUTPUT_DIR" && pwd)"
cd -- "$PROJECT_DIR"
bash scripts/check.sh
zip -qr "$OUTPUT_DIR/Catnap-Theatre-Broadcast-Dev-v${SCRIPT_VERSION}.zip" extension docs/BROADCAST-PILOT.md
sha256sum "$OUTPUT_DIR/Catnap-Theatre-Broadcast-Dev-v${SCRIPT_VERSION}.zip" > "$OUTPUT_DIR/Catnap-Theatre-Broadcast-Dev-v${SCRIPT_VERSION}.zip.sha256"
printf 'Saved development package: %s\n' "$OUTPUT_DIR/Catnap-Theatre-Broadcast-Dev-v${SCRIPT_VERSION}.zip"
