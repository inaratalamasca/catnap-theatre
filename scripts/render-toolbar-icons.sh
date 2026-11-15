#!/usr/bin/env bash
# Catnap toolbar icon renderer. Version 1.0.0.
# Change summary: preserve the purple/teal Theatre cat and render an original
# amber Host Controller fader icon at the four Chromium toolbar/manager sizes.
# Requires ImageMagick (magick, or its compatible convert command).
set -euo pipefail
SCRIPT_VERSION='1.0.0'
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"

if command -v magick >/dev/null 2>&1; then
  IMAGE_TOOL=(magick)
elif command -v convert >/dev/null 2>&1; then
  IMAGE_TOOL=(convert)
else
  printf 'ImageMagick is required to render Catnap toolbar icons.\n' >&2
  exit 1
fi

CONTROLLER_ASSET_DIR=''
if [[ -d "$PROJECT_DIR/extensions/theatre-integrated/assets" ]]; then
  THEATRE_ASSET_DIR="$PROJECT_DIR/extensions/theatre-integrated/assets/icons"
  CONTROLLER_ASSET_DIR="$PROJECT_DIR/extensions/host-controller/assets/icons"
elif [[ -d "$PROJECT_DIR/extension/assets" ]]; then
  THEATRE_ASSET_DIR="$PROJECT_DIR/extension/assets/icons"
else
  printf 'No supported Catnap Theatre extension directory found.\n' >&2
  exit 1
fi

# theatre-source.png is an unchanged copy of the established Catnap cat art.
# Retain that source and the controller's cover/header art without recolouring.
test -f "$THEATRE_ASSET_DIR/theatre-source.png"
for ICON_SIZE in 16 32 48 128; do
  "${IMAGE_TOOL[@]}" "$THEATRE_ASSET_DIR/theatre-source.png" \
    -filter Lanczos -resize "${ICON_SIZE}x${ICON_SIZE}" -depth 8 -strip \
    "$THEATRE_ASSET_DIR/theatre-${ICON_SIZE}.png"
  if [[ -n "$CONTROLLER_ASSET_DIR" ]]; then
    "${IMAGE_TOOL[@]}" -background none -density 384 \
      "$CONTROLLER_ASSET_DIR/controller.svg" \
      -filter Lanczos -resize "${ICON_SIZE}x${ICON_SIZE}" -depth 8 -strip \
      "$CONTROLLER_ASSET_DIR/controller-${ICON_SIZE}.png"
  fi
done
printf 'Rendered Catnap toolbar icons with renderer %s.\n' "$SCRIPT_VERSION"
