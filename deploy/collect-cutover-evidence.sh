#!/usr/bin/env bash
set -euo pipefail

APP_URL_PROD="${APP_URL_PROD:-}"
YOUTUBE_TEST_URL="${YOUTUBE_TEST_URL:-}"
EVIDENCE_DIR="${EVIDENCE_DIR:-deploy/evidence}"

if [ -z "$APP_URL_PROD" ]; then
  echo "APP_URL_PROD is required." >&2
  exit 1
fi

if [[ ! "$APP_URL_PROD" =~ ^https:// ]]; then
  echo "APP_URL_PROD must be the HTTPS production origin." >&2
  exit 1
fi

mkdir -p "$EVIDENCE_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
report="$EVIDENCE_DIR/worldcup-cutover-$timestamp.md"

run_section() {
  local title="$1"
  shift

  {
    printf '\n## %s\n\n' "$title"
    printf '```text\n'
  } >>"$report"

  if "$@" >>"$report" 2>&1; then
    printf '```\n\nPASS %s\n' "$title" >>"$report"
  else
    local status=$?
    printf '```\n\nFAIL %s (exit %s)\n' "$title" "$status" >>"$report"
    return "$status"
  fi
}

{
  printf '# WorldCup production cutover evidence\n\n'
  printf '- Generated at UTC: %s\n' "$(date -u -Iseconds)"
  printf '- APP_URL_PROD: %s\n' "$APP_URL_PROD"
  printf '- Git commit: %s\n' "$(git rev-parse --short HEAD 2>/dev/null || printf 'unknown')"
  printf '- Live clip verifier: %s\n' "$([ -n "$YOUTUBE_TEST_URL" ] && printf 'enabled' || printf 'skipped')"
  printf '\nThis file should not contain secrets. Review before sharing or committing elsewhere.\n'
} >"$report"

run_section "Runtime versions" bash -c 'node -v && npm -v && ffmpeg -version | head -n 1 && yt-dlp --version && pm2 -v'
run_section "PM2 status" pm2 status worldcup-api
run_section "VPS prerequisites" npm run verify:vps
run_section "Public Telegram production smoke" npm run verify:telegram:prod -- "$APP_URL_PROD"

if [ -n "$YOUTUBE_TEST_URL" ]; then
  run_section "Live Telegram clipping and R2 preview" \
    npm run verify:telegram:clip-live -- --url "$APP_URL_PROD" --youtube "$YOUTUBE_TEST_URL"
else
  {
    printf '\n## Live Telegram clipping and R2 preview\n\n'
    printf 'SKIPPED because YOUTUBE_TEST_URL was not provided.\n'
  } >>"$report"
fi

printf 'Cutover evidence written to %s\n' "$report"
