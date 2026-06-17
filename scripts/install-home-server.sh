#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/NicholasHord/alexa-tesla-voice-control.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/alexa-tesla}"
BRANCH="${BRANCH:-master}"

need_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_command git
need_command docker

docker compose version >/dev/null 2>&1 || {
  echo "Docker Compose is required. Install the Docker Compose plugin and rerun this installer." >&2
  exit 1
}

if [ ! -d "$INSTALL_DIR" ]; then
  sudo mkdir -p "$INSTALL_DIR"
  sudo chown "$USER:$USER" "$INSTALL_DIR"
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  cd "$INSTALL_DIR"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

./scripts/home-server-setup.sh
docker compose up -d --build

setup_token="$(grep -E '^SETUP_ADMIN_TOKEN=' .env | tail -n 1 | cut -d= -f2-)"
host_port="$(grep -E '^HOST_PORT=' .env | tail -n 1 | cut -d= -f2-)"
if [ -z "$host_port" ]; then
  host_port="18765"
fi
host_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [ -z "$host_ip" ]; then
  host_ip="SERVER_IP"
fi

cat <<NEXT

Install complete.

Open setup from your workstation:
http://${host_ip}:${host_port}/setup?token=${setup_token}

If that address is not reachable, replace ${host_ip} with the server hostname or LAN IP.
Keep the setup token private and disable setup after configuration.
NEXT
