#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-}"
APP_DIR="${APP_DIR:-/var/www/worldcup}"
NODE_MAJOR="${NODE_MAJOR:-20}"
ENABLE_CERTBOT="${ENABLE_CERTBOT:-false}"

if [ -z "$DOMAIN" ]; then
  cat >&2 <<'USAGE'
Usage:
  DOMAIN=api.example.com bash deploy/setup-hostinger-vps.sh

Optional:
  APP_DIR=/var/www/worldcup
  NODE_MAJOR=20
  ENABLE_CERTBOT=true

This script installs system packages and configures Nginx for the app.
It does not create or print .env secrets.
USAGE
  exit 1
fi

validate_domain() {
  if [[ ! "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$ ]] ||
    [[ "$DOMAIN" != *.* ]] ||
    [[ "$DOMAIN" == *..* ]]; then
    echo "DOMAIN must be a DNS hostname such as api.example.com." >&2
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

run apt update
run apt upgrade -y
run apt install -y curl git nginx ufw ffmpeg python3-pip ca-certificates

if ! command -v node >/dev/null 2>&1; then
  printf '==> Installing Node.js %s.x\n' "$NODE_MAJOR"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | $SUDO bash -
  run apt install -y nodejs
fi

if ! command -v yt-dlp >/dev/null 2>&1; then
  run python3 -m pip install -U yt-dlp --break-system-packages
fi

if ! command -v pm2 >/dev/null 2>&1; then
  run npm install -g pm2
fi

run ufw allow OpenSSH
run ufw allow 'Nginx Full'
run ufw --force enable

if [ -f "$APP_DIR/deploy/configure-nginx.sh" ]; then
  DOMAIN="$DOMAIN" APP_DIR="$APP_DIR" ENABLE_CERTBOT="$ENABLE_CERTBOT" bash "$APP_DIR/deploy/configure-nginx.sh"
else
  printf 'WARN app deploy files not found at %s; run deploy/configure-nginx.sh after cloning.\n' "$APP_DIR"
fi

printf 'VPS base setup complete. Next: clone/update the repo in %s and create %s/.env manually.\n' "$APP_DIR" "$APP_DIR"
