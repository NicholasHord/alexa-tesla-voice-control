#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

fail=0

check_file() {
  if [ ! -f "$1" ]; then
    echo "missing file: $1" >&2
    fail=1
  else
    echo "ok: $1"
  fi
}

check_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing command: $1" >&2
    fail=1
  else
    echo "ok: $1"
  fi
}

check_env_value() {
  local name="$1"
  local line
  line="$(grep -E "^${name}=" .env 2>/dev/null || true)"
  if [ -z "$line" ] || [ "$line" = "${name}=" ]; then
    echo "missing env value: $name" >&2
    fail=1
  else
    echo "ok: $name"
  fi
}

check_file .env
check_file certs/proxy-key.pem
check_file certs/proxy-cert.pem
check_file keys/private-key.pem
check_file keys/public-key.pem
check_file public/com.tesla.3p.public-key.pem

check_command docker

if command -v docker >/dev/null 2>&1; then
  docker compose version >/dev/null 2>&1 || {
    echo "missing command: docker compose" >&2
    fail=1
  }
fi

for name in \
  PUBLIC_BASE_URL \
  ALEXA_SKILL_ID \
  TESLA_CLIENT_ID \
  TESLA_CLIENT_SECRET \
  TESLA_VIN \
  TESLA_AUDIENCE \
  TESLA_AUTH_BASE_URL \
  TESLA_FLEET_BASE_URL \
  TESLA_TOKEN_FILE \
  TESLA_COMMAND_PROXY_URL \
  TESLA_COMMAND_PROXY_CA_CERT \
  TESLA_PUBLIC_KEY_FILE
do
  check_env_value "$name"
done

if [ "$fail" -ne 0 ]; then
  echo "Home server validation failed." >&2
  exit 1
fi

echo "Home server validation passed."
