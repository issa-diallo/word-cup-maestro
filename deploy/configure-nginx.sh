#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-}"
APP_DIR="${APP_DIR:-/var/www/worldcup}"
ENABLE_CERTBOT="${ENABLE_CERTBOT:-false}"

if [ -z "$DOMAIN" ]; then
  cat >&2 <<'USAGE'
Usage:
  DOMAIN=api.example.com bash deploy/configure-nginx.sh

Optional:
  APP_DIR=/var/www/worldcup
  ENABLE_CERTBOT=true

This script writes the Nginx reverse proxy config for the app. It does not read,
create, or print .env secrets.
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

if [ ! -f "$APP_DIR/deploy/nginx/worldcup.conf" ]; then
  echo "Missing $APP_DIR/deploy/nginx/worldcup.conf. Clone or update the app first." >&2
  exit 1
fi

target="/etc/nginx/sites-available/worldcup"

run install -d /etc/nginx/sites-available /etc/nginx/sites-enabled
sed "s/api.example.com/${DOMAIN}/g" "$APP_DIR/deploy/nginx/worldcup.conf" \
  | $SUDO tee "$target" >/dev/null

if [ ! -e /etc/nginx/sites-enabled/worldcup ]; then
  run ln -s "$target" /etc/nginx/sites-enabled/worldcup
fi

run nginx -t
run systemctl reload nginx

if [ "$ENABLE_CERTBOT" = "true" ]; then
  run apt install -y certbot python3-certbot-nginx
  run certbot --nginx -d "$DOMAIN"
else
  printf 'WARN HTTPS not installed. Re-run with ENABLE_CERTBOT=true after DNS points to this VPS.\n'
fi
