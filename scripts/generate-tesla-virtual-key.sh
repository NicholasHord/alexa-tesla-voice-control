#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

mkdir -p keys public
chmod 700 keys
chmod 755 public

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to run Tesla's official vehicle-command image." >&2
  exit 1
fi

if [ -f keys/private-key.pem ] && [ -f keys/public-key.pem ] && [ "${FORCE:-}" != "1" ]; then
  echo "keys/private-key.pem and keys/public-key.pem already exist. Set FORCE=1 to overwrite them." >&2
  exit 1
fi

docker pull tesla/vehicle-command:latest

keygen_args=(-key-file /keys/private-key.pem)
if [ "${FORCE:-}" = "1" ]; then
  keygen_args=(-f "${keygen_args[@]}")
fi
keygen_args+=(create)

docker run --rm \
  --security-opt=no-new-privileges:true \
  -v "$PWD/keys:/keys" \
  --entrypoint tesla-keygen \
  tesla/vehicle-command:latest \
  "${keygen_args[@]}" > keys/public-key.pem

chmod 600 keys/private-key.pem
chmod 644 keys/public-key.pem
cp keys/public-key.pem public/com.tesla.3p.public-key.pem
chmod 644 public/com.tesla.3p.public-key.pem

cat <<'NEXT'
Generated:
- keys/private-key.pem  KEEP PRIVATE. Do not copy to a web server public root.
- keys/public-key.pem
- public/com.tesla.3p.public-key.pem  Served by the app at:
  https://YOUR_DOMAIN/.well-known/appspecific/com.tesla.3p.public-key.pem
NEXT
