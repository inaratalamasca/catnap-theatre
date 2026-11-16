#!/usr/bin/env bash
# Catnap development package builder, version 0.6.8.
# Change summary: explicit public source allowlists, independently loadable
# combined/Inbox-only packages, root manifests and SHA-256 checksums.
# Builds files only. It never installs extensions, registers a native host,
# contacts services, reads browser profiles or deploys a package.
set -euo pipefail
SCRIPT_VERSION='0.6.8'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR=''
PACKAGE_FLAVOR='both'

usage() {
  printf 'Catnap development builder %s\n' "$SCRIPT_VERSION"
  printf 'Usage: bash scripts/build-dev.sh --output DIRECTORY [--flavor both|theatre|inbox]\n'
  printf 'Use a fresh output directory. Existing package targets are never overwritten.\n'
}
while (($#)); do
  case "$1" in
    --output)
      [[ $# -ge 2 && -n "$2" ]] || { printf 'Missing output directory.\n' >&2; exit 2; }
      OUTPUT_DIR="$2"; shift 2 ;;
    --flavor)
      [[ $# -ge 2 ]] || { printf 'Missing package flavor.\n' >&2; exit 2; }
      PACKAGE_FLAVOR="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done
[[ -n "$OUTPUT_DIR" ]] || { usage >&2; exit 2; }
case "$PACKAGE_FLAVOR" in both|theatre|inbox) ;; *) printf 'Choose both, theatre or inbox.\n' >&2; exit 2 ;; esac
for tool in node zip; do
  command -v "$tool" >/dev/null 2>&1 || { printf 'Required build tool missing: %s\n' "$tool" >&2; exit 2; }
done
if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
  printf 'Install sha256sum or shasum to generate package checksums.\n' >&2; exit 2
fi
mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"
case "$OUTPUT_DIR/" in
  "$PROJECT_DIR/"|"$PROJECT_DIR/extension/"*|"$PROJECT_DIR/docs/"*|"$PROJECT_DIR/native/"*|"$PROJECT_DIR/packaging/"*)
    printf 'Choose an output directory outside the source folders.\n' >&2; exit 2 ;;
esac
STAGING_DIR="$(mktemp -d "$OUTPUT_DIR/.catnap-build.XXXXXX")"
trap 'rm -rf "$STAGING_DIR"' EXIT

# Reviewing this list is deliberate: never recursively copy private runtime
# configuration or event files merely because they are near extension code.
COMMON_FILES=(
  inbox-core.js inbox-reader.js suno-mcp.js show-worker.js show-panel.js
  show.html show.css presentation-panel.css package-mode.js
)
THEATRE_FILES=(
  helpers.js content.js lyric-scroll.js visual-media.js standalone.js visualizer.js
  managed-player.js managed-native-guard.js managed-media.js managed-show.js
  broadcast-core.js broadcast-metadata-core.js broadcast-metadata.js
  broadcast-worker.js broadcast-panel.js broadcast-offscreen.js
  broadcast.html broadcast.css broadcast-offscreen.html
  presentation-control-worker.js presentation-tab-controller.js
  presentation-panel.html presentation-panel.js lounge.html lounge.css lounge.js
)
copy_source() {
  local source_path="$1" destination_path="$2"
  [[ -f "$source_path" ]] || { printf 'Missing package source: %s\n' "$source_path" >&2; exit 1; }
  mkdir -p "$(dirname "$destination_path")"
  cp "$source_path" "$destination_path"
}
checksum() {
  local archive_name="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$archive_name" > "$archive_name.sha256"
  else
    shasum -a 256 "$archive_name" > "$archive_name.sha256"
  fi
}
build_flavor() {
  local flavor="$1" package_name manifest_path file package_dir archive_path
  if [[ "$flavor" == 'inbox' ]]; then
    package_name="Catnap-Inbox-Dev-v${SCRIPT_VERSION}"
    manifest_path="$PROJECT_DIR/packaging/inbox/manifest.json"
  else
    package_name="Catnap-Theatre-Inbox-Dev-v${SCRIPT_VERSION}"
    manifest_path="$PROJECT_DIR/extension/manifest.json"
  fi
  for file in "$OUTPUT_DIR/$package_name" "$OUTPUT_DIR/$package_name.zip" "$OUTPUT_DIR/$package_name.zip.sha256"; do
    [[ ! -e "$file" ]] || { printf 'Package target already exists: %s\n' "$file" >&2; exit 1; }
  done
  package_dir="$STAGING_DIR/$package_name"
  mkdir -p "$package_dir"
  for file in "${COMMON_FILES[@]}"; do copy_source "$PROJECT_DIR/extension/$file" "$package_dir/$file"; done
  copy_source "$manifest_path" "$package_dir/manifest.json"
  if [[ "$flavor" == 'inbox' ]]; then
    copy_source "$PROJECT_DIR/extension/inbox-worker.js" "$package_dir/inbox-worker.js"
    printf '/* Generated Catnap Inbox package configuration, version %s. */\nglobalThis.CatnapPackage = Object.freeze({version:"%s",inboxOnly:true});\n' "$SCRIPT_VERSION" "$SCRIPT_VERSION" > "$package_dir/package-mode.js"
  else
    for file in "${THEATRE_FILES[@]}"; do copy_source "$PROJECT_DIR/extension/$file" "$package_dir/$file"; done
    copy_source "$PROJECT_DIR/extension/assets/aiu-logo.png" "$package_dir/assets/aiu-logo.png"
  fi
  for file in 16 32 48 128; do
    if [[ "$flavor" == inbox ]]; then
      copy_source "$PROJECT_DIR/packaging/inbox/assets/icons/inbox-$file.png" "$package_dir/assets/icons/inbox-$file.png"
    else
      copy_source "$PROJECT_DIR/extension/assets/icons/theatre-$file.png" "$package_dir/assets/icons/theatre-$file.png"
    fi
  done
  for file in README.md CHANGELOG.md LICENSE NOTICE LICENSING.md; do copy_source "$PROJECT_DIR/$file" "$package_dir/$file"; done
  for file in README.md catnap-suno-host.mjs install-linux.sh install-windows.cmd install-windows.ps1 CatnapSunoLauncher.cs install-macos.sh; do copy_source "$PROJECT_DIR/native/$file" "$package_dir/native/$file"; done
  # Only maintained Markdown documentation is distributed. Screenshots are not
  # needed for installation; no historical/event/input folders are copied.
  while IFS= read -r file; do
    copy_source "$file" "$package_dir/docs/${file#"$PROJECT_DIR/docs/"}"
  done < <(find "$PROJECT_DIR/docs" -type f -name '*.md' -print)
  cat > "$package_dir/PACKAGE-README.md" <<EOF
# Catnap ${flavor} development package ${SCRIPT_VERSION}

Load this folder (the one containing manifest.json) using Load unpacked in an
isolated Chrome/Brave test profile. This is a development build, not the Store
beta and not a live-show update. Stop a show before changing extensions.

The Inbox-only package creates/updates Suno playlists; it does not provide
Theatre playback, audio capture or YouTube playback. It lists external-only
submissions for separate handling. The combined Theatre package adds the managed
show controls. Both use your signed-in uploader tab and your own Suno account.

For the optional Suno companion, install Node.js 22 or later (24 LTS recommended),
read native/README.md and register the exact extension ID assigned to this
unpacked folder. Linux, Windows and macOS installer/source files are provided.
Isolated installer/launcher checks pass on Linux, Windows and macOS; actual
browser connection and own-account Suno authorization still need rehearsal. Packaging does not
install the companion or grant account access. No account credentials are included.

The source README and docs describe the shared project; this file identifies
the selected package. First-party licensing and branding terms are in LICENSE,
NOTICE and LICENSING.md. See maintained acceptance documentation for test limits.
EOF
  # Validate the selected manifest and every declared local entry point before
  # archiving; this does not run any extension code.
  node - "$package_dir" "$SCRIPT_VERSION" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const folder = process.argv[2], version = process.argv[3];
const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3 || manifest.version !== version) throw Error('Expected an MV3 manifest for version ' + version);
const references = [manifest.background?.service_worker, manifest.options_page, manifest.action?.default_popup,
  ...Object.values(manifest.icons || {}), ...Object.values(manifest.action?.default_icon || {}),
  ...(manifest.content_scripts || []).flatMap(script => [...(script.js || []), ...(script.css || [])])].filter(Boolean);
for (const relative of references) {
  if (path.isAbsolute(relative) || relative.split('/').includes('..') || !fs.existsSync(path.join(folder, relative))) throw Error('Missing/invalid manifest resource: ' + relative);
}
NODE
  archive_path="$STAGING_DIR/$package_name.zip"
  (cd "$package_dir" && zip -qr "$archive_path" .)
  mv "$package_dir" "$OUTPUT_DIR/$package_name"
  mv "$archive_path" "$OUTPUT_DIR/$package_name.zip"
  (cd "$OUTPUT_DIR" && checksum "$package_name.zip")
  printf 'Built %s\nFolder: %s\nZIP: %s\n' "$flavor" "$OUTPUT_DIR/$package_name" "$OUTPUT_DIR/$package_name.zip"
}

if [[ "$PACKAGE_FLAVOR" == both || "$PACKAGE_FLAVOR" == theatre ]]; then build_flavor theatre; fi
if [[ "$PACKAGE_FLAVOR" == both || "$PACKAGE_FLAVOR" == inbox ]]; then build_flavor inbox; fi
