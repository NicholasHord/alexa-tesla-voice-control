#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/NicholasHord/alexa-tesla-voice-control.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/alexa-tesla}"
BRANCH="${BRANCH:-master}"
INSTALL_DOCKER="${INSTALL_DOCKER:-0}"

need_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_command git

install_docker_if_requested() {
  if command -v docker >/dev/null 2>&1; then
    return 0
  fi

  if [ "$INSTALL_DOCKER" != "1" ]; then
    echo "Missing required command: docker" >&2
    echo "Install Docker first, or rerun with INSTALL_DOCKER=1 to use Docker's official convenience installer." >&2
    exit 1
  fi

  need_command curl
  tmp_script="$(mktemp)"
  curl -fsSL https://get.docker.com -o "$tmp_script"
  sudo sh "$tmp_script"
  rm -f "$tmp_script"

  if getent group docker >/dev/null 2>&1; then
    sudo usermod -aG docker "$USER" || true
  fi
}

docker_compose() {
  if docker ps >/dev/null 2>&1; then
    docker compose "$@"
  else
    sudo docker compose "$@"
  fi
}

port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "( sport = :$port )" | tail -n +2 | grep -q .
  elif command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  elif command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 "$port" >/dev/null 2>&1
  else
    return 1
  fi
}

install_docker_if_requested

docker_compose version >/dev/null 2>&1 || {
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

setup_token="$(grep -E '^SETUP_ADMIN_TOKEN=' .env | tail -n 1 | cut -d= -f2-)"
host_port="$(grep -E '^HOST_PORT=' .env | tail -n 1 | cut -d= -f2-)"
if [ -z "$host_port" ]; then
  host_port="18765"
fi

if port_in_use "$host_port"; then
  echo "Host port $host_port is already in use." >&2
  echo "Edit HOST_PORT in $INSTALL_DIR/.env, then rerun this installer." >&2
  exit 1
fi

docker_compose up -d --build

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
