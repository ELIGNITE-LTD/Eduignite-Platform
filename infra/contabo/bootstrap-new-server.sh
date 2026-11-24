#!/usr/bin/env bash
# Prepare a fresh Contabo VPS to run the EduIgnite stack. Run ON THE NEW SERVER as root
# (the "Server migration" workflow streams it over ssh: `ssh new 'bash -s' < bootstrap-new-server.sh`).
# Idempotent: safe to run again. It installs software and creates folders; it never touches data.
set -euo pipefail
log() { printf '[bootstrap %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

export DEBIAN_FRONTEND=noninteractive
log "packages"
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg ufw rsync tar gzip cron >/dev/null

if ! command -v docker >/dev/null; then
  log "installing Docker (official script)"
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
docker compose version >/dev/null || { echo "Docker Compose plugin missing"; exit 1; }
systemctl enable --now docker >/dev/null 2>&1 || true

if ! command -v caddy >/dev/null; then
  log "installing Caddy (official apt repository)"
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi

log "firewall: 22, 80, 443 only"
ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null   # HTTP/3
ufw --force enable >/dev/null

# Swap protects the box when a build and live traffic overlap. Only if there is none.
if [ "$(swapon --show --noheadings | wc -l)" -eq 0 ]; then
  log "creating 4G swap file"
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10 >/dev/null
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
fi

log "folders"
mkdir -p /opt/eduignite/media /opt/eduignite/backend /opt/eduignite/frontend /opt/eduignite/backups

log "done: $(docker --version | cut -d, -f1); $(caddy version | cut -d' ' -f1)"
