#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/worldcup}"
OUTPUT_DIR="${OUTPUT_DIR:-$APP_DIR/output/viral-shorts}"
MAX_AGE_DAYS="${MAX_AGE_DAYS:-3}"
DELETE="${DELETE:-false}"

case "$OUTPUT_DIR" in
  "$APP_DIR"/output/viral-shorts|"$APP_DIR"/output/viral-shorts/*) ;;
  *)
    echo "Refusing to clean outside $APP_DIR/output/viral-shorts: $OUTPUT_DIR" >&2
    exit 1
    ;;
esac

if ! [[ "$MAX_AGE_DAYS" =~ ^[0-9]+$ ]] || [ "$MAX_AGE_DAYS" -lt 1 ]; then
  echo "MAX_AGE_DAYS must be an integer >= 1." >&2
  exit 1
fi

if [ ! -d "$OUTPUT_DIR" ]; then
  printf 'Output directory does not exist yet: %s\n' "$OUTPUT_DIR"
  exit 0
fi

printf 'Scanning %s for files older than %s day(s).\n' "$OUTPUT_DIR" "$MAX_AGE_DAYS"

if [ "$DELETE" = "true" ]; then
  find "$OUTPUT_DIR" -type f -mtime "+$MAX_AGE_DAYS" -print -delete
  find "$OUTPUT_DIR" -type d -empty -mindepth 1 -print -delete
  printf 'Cleanup complete.\n'
else
  find "$OUTPUT_DIR" -type f -mtime "+$MAX_AGE_DAYS" -print
  printf 'Dry run only. Re-run with DELETE=true to remove these files.\n'
fi
