#!/usr/bin/env bash
# Catnap Theatre release package, version 0.5.0.
# Change summary: explicit public contents, licensing notices and SHA-256 checksum.
set -euo pipefail
SCRIPT_VERSION="0.5.0"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="${1:-$PROJECT_DIR/dist}"
mkdir -p -- "$OUTPUT_DIR"
OUTPUT_DIR="$(cd -- "$OUTPUT_DIR" && pwd)"
cd -- "$PROJECT_DIR"
bash scripts/check.sh
STAGING_DIR="$(mktemp -d "$OUTPUT_DIR/.catnap-release.XXXXXX")"
trap 'rm -rf -- "$STAGING_DIR"' EXIT
PACKAGE_NAME="Catnap-Theatre-v${SCRIPT_VERSION}.zip"
zip -qr "$STAGING_DIR/$PACKAGE_NAME" extension README.md CHANGELOG.md docs LICENSE NOTICE LICENSING.md
mv -- "$STAGING_DIR/$PACKAGE_NAME" "$OUTPUT_DIR/$PACKAGE_NAME"
(cd -- "$OUTPUT_DIR" && sha256sum "$PACKAGE_NAME" > "$PACKAGE_NAME.sha256")
printf 'Saved Catnap Theatre %s: %s\n' "$SCRIPT_VERSION" "$OUTPUT_DIR/$PACKAGE_NAME"
