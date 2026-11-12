#!/usr/bin/env bash
# Catnap Theatre development package. Version 0.4.0.
# Change summary: separate controls/metadata pilot, installation guides and checksum.
set -euo pipefail
SCRIPT_VERSION='0.4.0'
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="${1:-$PROJECT_DIR/dist}"
mkdir -p -- "$OUTPUT_DIR"
OUTPUT_DIR="$(cd -- "$OUTPUT_DIR" && pwd)"
cd -- "$PROJECT_DIR"
bash scripts/check.sh
PACKAGE_NAME="Catnap-Theatre-Controls-Dev-v${SCRIPT_VERSION}.zip"
zip -qr "$OUTPUT_DIR/$PACKAGE_NAME" extension README.md docs/BROADCAST-PILOT.md docs/PRESENTATION-CONTROLS.md
(cd -- "$OUTPUT_DIR" && sha256sum "$PACKAGE_NAME" > "$PACKAGE_NAME.sha256")
printf 'Saved development package: %s\n' "$OUTPUT_DIR/$PACKAGE_NAME"
