#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/worldcup}"
APP_PORT="${APP_PORT:-3000}"

failures=0

check_command() {
  local name="$1"
  local command="$2"

  if command -v "$command" >/dev/null 2>&1; then
    printf 'PASS %s: installed\n' "$name"
  else
    printf 'FAIL %s: missing command %s\n' "$name" "$command"
    failures=$((failures + 1))
  fi
}

check_env_key() {
  local name="$1"

  if [ ! -f "$APP_DIR/.env" ]; then
    printf 'FAIL env file: %s/.env missing\n' "$APP_DIR"
    failures=$((failures + 1))
    return
  fi

  if grep -Eq "^${name}=.+" "$APP_DIR/.env"; then
    printf 'PASS env %s: present\n' "$name"
  else
    printf 'FAIL env %s: missing or empty\n' "$name"
    failures=$((failures + 1))
  fi
}

read_env_value() {
  local name="$1"

  if [ ! -f "$APP_DIR/.env" ]; then
    return
  fi

  grep -E "^${name}=" "$APP_DIR/.env" | tail -n 1 | cut -d= -f2- | sed 's/^ *//;s/ *$//'
}

check_env_equals() {
  local name="$1"
  local expected="$2"
  local value

  value="$(read_env_value "$name")"
  if [ "$value" = "$expected" ]; then
    printf 'PASS env %s: expected value\n' "$name"
  else
    printf 'FAIL env %s: expected %s\n' "$name" "$expected"
    failures=$((failures + 1))
  fi
}

check_env_https_url() {
  local name="$1"
  local value

  value="$(read_env_value "$name")"
  if [[ "$value" =~ ^https://[^[:space:]]+$ ]] && [[ "$value" != *example.com* ]]; then
    printf 'PASS env %s: HTTPS URL\n' "$name"
  else
    printf 'FAIL env %s: must be a real HTTPS URL\n' "$name"
    failures=$((failures + 1))
  fi
}

check_env_positive_integer() {
  local name="$1"
  local value

  value="$(read_env_value "$name")"
  if [[ "$value" =~ ^[1-9][0-9]*$ ]]; then
    printf 'PASS env %s: positive integer\n' "$name"
  else
    printf 'FAIL env %s: must be a positive integer\n' "$name"
    failures=$((failures + 1))
  fi
}

check_http() {
  local name="$1"
  local url="$2"
  local expected="$3"
  local method="${4:-GET}"
  local status

  status="$(curl -s -o /dev/null -w '%{http_code}' -X "$method" "$url" || true)"
  if [ "$status" = "$expected" ]; then
    printf 'PASS %s: %s HTTP %s\n' "$name" "$method" "$status"
  else
    printf 'FAIL %s: expected %s HTTP %s, got %s\n' "$name" "$method" "$expected" "${status:-000}"
    failures=$((failures + 1))
  fi
}

printf 'Checking VPS prerequisites for %s\n' "$APP_DIR"

check_command "curl" "curl"
check_command "git" "git"
check_command "nginx" "nginx"
check_command "ffmpeg" "ffmpeg"
check_command "python3" "python3"
check_command "node" "node"
check_command "npm" "npm"
check_command "yt-dlp" "yt-dlp"
check_command "pm2" "pm2"

if command -v ufw >/dev/null 2>&1; then
  printf 'PASS ufw: installed\n'
else
  printf 'WARN ufw: not installed or not in PATH\n'
fi

if [ -d "$APP_DIR" ]; then
  printf 'PASS app dir: exists\n'
else
  printf 'FAIL app dir: %s missing\n' "$APP_DIR"
  failures=$((failures + 1))
fi

check_env_key "OPENAI_API_KEY"
check_env_key "CLOUDFLARE_R2_ACCOUNT_ID"
check_env_key "CLOUDFLARE_R2_ACCESS_KEY_ID"
check_env_key "CLOUDFLARE_R2_SECRET_ACCESS_KEY"
check_env_key "CLOUDFLARE_R2_BUCKET"
check_env_key "CLOUDFLARE_R2_PUBLIC_URL"
check_env_key "N8N_WEBHOOK_URL"
check_env_key "TELEGRAM_AGENT_SECRET"
check_env_key "APP_URL_PROD"
check_env_key "NODE_ENV"
check_env_key "CLIPPING_MAX_SOURCE_SECONDS"
check_env_key "TELEGRAM_CLIP_MAX_QUEUED_JOBS"

check_env_https_url "APP_URL_PROD"
check_env_https_url "CLOUDFLARE_R2_PUBLIC_URL"
check_env_equals "NODE_ENV" "production"
check_env_positive_integer "CLIPPING_MAX_SOURCE_SECONDS"
check_env_positive_integer "TELEGRAM_CLIP_MAX_QUEUED_JOBS"

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe worldcup-api >/dev/null 2>&1; then
    printf 'PASS pm2 app: worldcup-api exists\n'
  else
    printf 'WARN pm2 app: worldcup-api not found\n'
  fi
fi

check_http "local health" "http://127.0.0.1:${APP_PORT}/api/health" "200"
check_http "telegram auth guard" "http://127.0.0.1:${APP_PORT}/api/telegram/clip" "401" "POST"

if [ "$failures" -gt 0 ]; then
  printf 'VPS prerequisite check failed with %s issue(s).\n' "$failures"
  exit 1
fi

printf 'VPS prerequisite check passed.\n'
