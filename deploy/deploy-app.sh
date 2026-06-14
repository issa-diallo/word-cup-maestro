#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/worldcup}"
BRANCH="${BRANCH:-main}"
REPO_URL="${REPO_URL:-}"
APP_URL_PROD="${APP_URL_PROD:-}"
DOMAIN="${DOMAIN:-}"
ENABLE_CERTBOT="${ENABLE_CERTBOT:-false}"
YOUTUBE_TEST_URL="${YOUTUBE_TEST_URL:-}"

if [ ! -d "$APP_DIR/.git" ] && [ -z "$REPO_URL" ]; then
  cat >&2 <<'USAGE'
Usage for first deploy:
  REPO_URL=https://github.com/owner/repo.git APP_URL_PROD=https://api.your-domain.com bash deploy/deploy-app.sh

Usage for updates from an existing clone:
  APP_URL_PROD=https://api.your-domain.com bash deploy/deploy-app.sh

Optional:
  APP_DIR=/var/www/worldcup
  BRANCH=main
  DOMAIN=api.your-domain.com
  ENABLE_CERTBOT=true
  YOUTUBE_TEST_URL=https://www.youtube.com/watch?v=...

This script never creates or prints .env secrets.
USAGE
  exit 1
fi

if [ -z "$APP_URL_PROD" ]; then
  echo "APP_URL_PROD is required so production verification targets the HTTPS VPS URL." >&2
  exit 1
fi

validate_domain() {
  if [[ -n "$DOMAIN" ]] &&
    ([[ ! "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$ ]] ||
      [[ "$DOMAIN" != *.* ]] ||
      [[ "$DOMAIN" == *..* ]]); then
    echo "DOMAIN must be a DNS hostname such as api.example.com." >&2
    exit 1
  fi
}

validate_app_url_prod() {
  if [[ ! "$APP_URL_PROD" =~ ^https://[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(:[0-9]+)?(/)?$ ]] ||
    [[ "$APP_URL_PROD" == *example.com* ]]; then
    echo "APP_URL_PROD must be the real HTTPS production origin, such as https://api.your-domain.com." >&2
    exit 1
  fi
}

if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
else
  SUDO=""
fi

run() {
  printf '==> %s\n' "$*"
  # shellcheck disable=SC2086
  $SUDO "$@"
}

validate_domain
validate_app_url_prod

if [ ! -d "$APP_DIR/.git" ]; then
  run mkdir -p "$APP_DIR"
  run git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "Missing $APP_DIR/.env. Create it manually from .env.example before deploying." >&2
  exit 1
fi

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

npm ci
npm run verify:prod:local

if [ -n "$DOMAIN" ]; then
  DOMAIN="$DOMAIN" APP_DIR="$APP_DIR" ENABLE_CERTBOT="$ENABLE_CERTBOT" bash deploy/configure-nginx.sh
fi

if pm2 describe worldcup-api >/dev/null 2>&1; then
  pm2 reload deploy/ecosystem.config.cjs --only worldcup-api --update-env
else
  pm2 start deploy/ecosystem.config.cjs
fi

pm2 save

npm run verify:vps
npm run verify:telegram:prod -- "$APP_URL_PROD"

if [ -n "$YOUTUBE_TEST_URL" ]; then
  npm run verify:telegram:clip-live -- --url "$APP_URL_PROD" --youtube "$YOUTUBE_TEST_URL"
else
  printf 'WARN live clipping verification skipped. Set YOUTUBE_TEST_URL to verify VPS clipping and R2 previews.\n'
fi

printf 'Deploy complete for %s\n' "$APP_URL_PROD"
