#!/usr/bin/env bash
# Deploy or update TechSara Placement League on this server (idempotent).
#
#   sudo bash deploy.sh <release.tar.gz>   — secrets are read from stdin as KEY=VALUE lines:
#     CLOUDFLARE_TUNNEL_TOKEN  required on the first deploy (kept in shared/.env afterwards; a new value replaces it)
#     ADMIN_PASSWORD           optional, first deploy only (otherwise a random one is generated)
#     PUBLIC_URL               optional, default https://tpl.techsarasolutions.com
#     RELEASE                  optional release id (the git commit)
#
# Layout:  /opt/techsara-placement-league/{shared/.env, releases/<id>/, current -> releases/<id>}
# Data lives in Docker volumes (tpl_pg, tpl_uploads) and survives every deploy.
# Nothing secret is ever printed (the GitHub Actions log of a public repository is public).
set -euo pipefail

BASE=/opt/techsara-placement-league
SHARED="$BASE/shared"
ENV_FILE="$SHARED/.env"
TARBALL="${1:?usage: deploy.sh <release.tar.gz>}"
log() { printf '\n==> %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "run with sudo"; exit 1; }

# ---- secrets from stdin ---------------------------------------------------------------
IN_TOKEN="" IN_ADMIN="" IN_URL="" RELEASE=""
if [ ! -t 0 ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    key="${line%%=*}"; val="${line#*=}"
    case "$key" in
      CLOUDFLARE_TUNNEL_TOKEN) IN_TOKEN="$val" ;;
      ADMIN_PASSWORD) IN_ADMIN="$val" ;;
      PUBLIC_URL) IN_URL="$val" ;;
      RELEASE) RELEASE="$val" ;;
    esac
  done
fi
RELEASE="${RELEASE:-$(date -u +%Y%m%d%H%M%S)}"
RELEASE="${RELEASE:0:12}"

# ---- Docker -------------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  log "Installing Docker"
  . /etc/os-release
  case "${ID:-}" in
    ubuntu | debian)
      curl -fsSL https://get.docker.com | sh
      ;;
    amzn | rhel | centos | rocky | almalinux | fedora)
      (command -v dnf >/dev/null && dnf install -y docker) || yum install -y docker
      mkdir -p /usr/local/lib/docker/cli-plugins
      arch="$(uname -m)"; [ "$arch" = "aarch64" ] && arch=arm64 || arch=x86_64
      curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$arch" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose
      bx="$(curl -fsSL https://api.github.com/repos/docker/buildx/releases/latest | grep -o '"tag_name": *"[^"]*"' | cut -d'"' -f4)"
      barch=$([ "$arch" = arm64 ] && echo arm64 || echo amd64)
      curl -fsSL "https://github.com/docker/buildx/releases/download/$bx/buildx-$bx.linux-$barch" \
        -o /usr/local/lib/docker/cli-plugins/docker-buildx
      chmod +x /usr/local/lib/docker/cli-plugins/docker-compose /usr/local/lib/docker/cli-plugins/docker-buildx
      ;;
    *) echo "Unsupported OS '${ID:-unknown}': install Docker with the Compose plugin, then deploy again."; exit 1 ;;
  esac
  systemctl enable --now docker
fi
docker compose version

# ---- swap (Next.js builds need headroom on small instances) -----------------------------
if [ "$(swapon --noheadings | wc -l)" -eq 0 ] && [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 8000000 ]; then
  log "Adding a 2 GB swap file"
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

# ---- shared/.env (created once; never printed) ------------------------------------------
mkdir -p "$SHARED" "$BASE/releases"
touch "$ENV_FILE" && chmod 600 "$ENV_FILE"
rand() { head -c 64 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "$1"; }
has() { grep -q "^$1=" "$ENV_FILE"; }
setv() { # setv KEY VALUE — replace or append, value single-quoted (no interpolation)
  case "$2" in *"'"* | *$'\n'*) echo "$1 must not contain quotes or new lines"; exit 1 ;; esac
  local tmp; tmp="$(mktemp)"
  grep -v "^$1=" "$ENV_FILE" >"$tmp" || true
  printf "%s='%s'\n" "$1" "$2" >>"$tmp"
  install -m 600 "$tmp" "$ENV_FILE" && rm -f "$tmp"
}
has POSTGRES_PASSWORD || setv POSTGRES_PASSWORD "$(rand 32)"
ADMIN_NOTE=""
if ! has ADMIN_PASSWORD; then
  if [ -n "$IN_ADMIN" ]; then setv ADMIN_PASSWORD "$IN_ADMIN"; else setv ADMIN_PASSWORD "tpl-$(rand 16)"; ADMIN_NOTE=generated; fi
fi
if [ -n "$IN_TOKEN" ]; then setv CLOUDFLARE_TUNNEL_TOKEN "$IN_TOKEN"; fi
if ! has CLOUDFLARE_TUNNEL_TOKEN; then echo "CLOUDFLARE_TUNNEL_TOKEN is missing (GitHub secret)."; exit 1; fi
if [ -n "$IN_URL" ]; then setv PUBLIC_URL "$IN_URL"; fi
has PUBLIC_URL || setv PUBLIC_URL "https://tpl.techsarasolutions.com"

# ---- release ------------------------------------------------------------------------------
log "Unpacking release $RELEASE"
DIR="$BASE/releases/$RELEASE"
rm -rf "$DIR" && mkdir -p "$DIR"
tar -xzf "$TARBALL" -C "$DIR"
ln -sfn "$DIR" "$BASE/current"

log "Building and starting containers"
cd "$BASE/current"
docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml up -d --build --remove-orphans

log "Waiting for the app"
for _ in $(seq 1 100); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then ok=1; break; fi
  sleep 3
done
if [ "${ok:-0}" != 1 ]; then
  echo "The app did not become healthy. Recent logs:"
  docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml logs --tail 80 app
  exit 1
fi

# ---- tidy up: keep the 3 newest releases, drop unused images and old build cache --------
ls -1dt "$BASE"/releases/*/ | tail -n +4 | xargs -r rm -rf
docker image prune -f >/dev/null
docker builder prune -f --filter until=168h >/dev/null 2>&1 || true

log "Deployed $RELEASE"
docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml ps --format 'table {{.Service}}\t{{.Status}}'
if [ "$ADMIN_NOTE" = generated ]; then
  echo
  echo "First deploy: an organizer password was generated (user: admin). Read it on the server with:"
  echo "  sudo grep ADMIN_PASSWORD $ENV_FILE"
fi
