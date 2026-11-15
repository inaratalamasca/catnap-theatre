#!/usr/bin/env bash
# Catnap tracked-file publication guard, version 1.1.0.
# Change summary: block identity spreadsheets, inbox exports and runtime secrets.
# Uses standard Git/grep tools so it also works without ripgrep installed.
set -euo pipefail
SCRIPT_VERSION="1.1.0"
REPO_ROOT="${1:-.}"
FAILURES=0
printf 'Catnap repository check %s\n' "$SCRIPT_VERSION"
git -C "$REPO_ROOT" rev-parse --show-toplevel >/dev/null
while IFS= read -r -d '' FILE_PATH; do
  LOWER_PATH="$(printf '%s' "$FILE_PATH" | tr '[:upper:]' '[:lower:]')"
  case "$LOWER_PATH" in
    *.xls|*.xlsx|*.ods|*.csv|*.pem|*.key|*.p12|*.pfx|*.crx|*.zip|*name_tracker*|*inbox_export*|*connection.local*|*private-connection*|*dev-queue.json|*browser-profile*|private-reference/*|*/private-reference/*|*/node_modules/*|*/backups/*)
      printf 'Excluded/private filename: %s\n' "$FILE_PATH" >&2
      FAILURES=1 ;;
    .env|*/.env|.env.local|*/.env.local|*.private.json|*.local.json)
      printf 'Excluded/private runtime file: %s\n' "$FILE_PATH" >&2
      FAILURES=1 ;;
  esac
  [[ -f "$REPO_ROOT/$FILE_PATH" ]] || continue
  if LC_ALL=C grep -Iq . "$REPO_ROOT/$FILE_PATH"; then
    if LC_ALL=C grep -Eq -- '-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|mfa\.[A-Za-z0-9_-]{40,}' "$REPO_ROOT/$FILE_PATH"; then
      printf 'Potential credential marker in: %s\n' "$FILE_PATH" >&2
      FAILURES=1
    fi
  fi
done < <(git -C "$REPO_ROOT" ls-files -z)
[[ "$FAILURES" == 0 ]] || exit 1
printf 'Tracked-file checks passed. Review history and the staged diff before publication.\n'
