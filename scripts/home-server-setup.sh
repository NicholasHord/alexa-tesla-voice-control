#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

umask 077

mkdir -p data keys certs public
chmod 700 data keys certs
chmod 755 public

set_env_value() {
  local key="$1"
  local value="$2"
  if grep -qE "^${key}=" .env; then
    if [ -z "$(grep -E "^${key}=" .env | tail -n 1 | cut -d= -f2-)" ]; then
      sed -i.bak "s|^${key}=.*|${key}=${value}|" .env
      rm -f .env.bak
    fi
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  echo "Created .env from .env.example. Edit it before starting the stack."
else
  chmod 600 .env
  echo ".env already exists; leaving it in place."
fi

if ! grep -qE '^SETUP_ENABLED=true$' .env; then
  if grep -qE '^SETUP_ENABLED=' .env; then
    sed -i.bak 's|^SETUP_ENABLED=.*|SETUP_ENABLED=true|' .env
    rm -f .env.bak
  else
    printf 'SETUP_ENABLED=true\n' >> .env
  fi
fi

if ! grep -qE '^SETUP_ADMIN_TOKEN=.+$' .env; then
  if command -v openssl >/dev/null 2>&1; then
    setup_token="$(openssl rand -hex 24)"
  else
    setup_token="$(date +%s | sha256sum | awk '{print $1}')"
  fi
  set_env_value "SETUP_ADMIN_TOKEN" "$setup_token"
else
  setup_token="$(grep -E '^SETUP_ADMIN_TOKEN=' .env | tail -n 1 | cut -d= -f2-)"
fi

set_env_value "APP_ENV_FILE" "/app/.env"
set_env_value "TESLA_PUBLIC_KEY_FILE" "/app/public/com.tesla.3p.public-key.pem"

if ! command -v openssl >/dev/null 2>&1; then
  echo "OpenSSL is required to generate the local Tesla command proxy TLS certificate." >&2
  exit 1
fi

if [ ! -f certs/proxy-key.pem ] || [ ! -f certs/proxy-cert.pem ]; then
  openssl req -x509 -nodes -newkey ec \
    -pkeyopt ec_paramgen_curve:secp384r1 \
    -pkeyopt ec_param_enc:named_curve \
    -subj "/CN=tesla-command-proxy" \
    -keyout certs/proxy-key.pem \
    -out certs/proxy-cert.pem \
    -sha256 \
    -days 3650 \
    -addext "subjectAltName=DNS:tesla-command-proxy" \
    -addext "extendedKeyUsage=serverAuth" \
    -addext "keyUsage=digitalSignature,keyCertSign,keyAgreement"
  chmod 600 certs/proxy-key.pem
  chmod 644 certs/proxy-cert.pem
  echo "Generated certs/proxy-key.pem and certs/proxy-cert.pem."
else
  echo "Proxy TLS certificate already exists; leaving it in place."
fi

if command -v docker >/dev/null 2>&1; then
  docker compose version >/dev/null 2>&1 || {
    echo "Docker is installed, but 'docker compose' is not available." >&2
    exit 1
  }
  echo "Docker Compose is available."
else
  echo "Docker was not found. Install Docker before running the service." >&2
fi

cat <<'NEXT'

Next steps:
1. Start with docker compose up -d --build.
2. Open /setup with the setup token printed by scripts/install-home-server.sh or from .env.
3. Fill in the Tesla, Alexa, and domain values.
4. Run ./scripts/generate-tesla-virtual-key.sh if you do not already have a Tesla virtual key.
5. Enroll the virtual key with https://tesla.com/_ak/YOUR_DOMAIN?vin=YOUR_VIN.
6. Complete Tesla OAuth from the setup page.

See docs/HOME_SERVER_INSTALL.md for the full checklist.
NEXT
