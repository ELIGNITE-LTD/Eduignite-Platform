#!/usr/bin/env bash
# Read-only look at the CURRENT production server. Changes nothing and prints only low-sensitivity facts
# (sizes, OK/NO flags, paths): it may run in a public GitHub Actions log. Run via: ssh server 'bash -s' < inspect.sh
set -uo pipefail
APP="${APP_DIR:-/opt/eduignite/backend}"
echo "host: $(hostname)  up: $(uptime -p 2>/dev/null)"
echo "-- disk"; df -h --output=target,size,used,avail,pcent / /opt 2>/dev/null | sort -u
echo "-- containers"; docker ps --format '{{.Names}}: {{.Status}}' 2>/dev/null || echo "docker not available"
echo "-- sizes"; du -sh /opt/eduignite/media 2>/dev/null || echo "no /opt/eduignite/media"
if [ ! -f "$APP/docker-compose.prod.yml" ]; then echo "app dir: NOT FOUND at $APP"; exit 0; fi
cd "$APP" || exit 0
echo "app dir: $APP"
dc() { docker compose -f docker-compose.prod.yml "$@" </dev/null; }
echo -n "database size: "
dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select pg_size_pretty(pg_database_size(current_database()))"' 2>/dev/null || echo "unavailable"
root="$(dc exec -T web python -c "import os,django; os.environ['DJANGO_SETTINGS_MODULE']='config.settings.production'; django.setup(); from django.conf import settings; print(settings.PRIVATE_MEDIA_ROOT)" 2>/dev/null | tail -1)"
case "$root" in
  /app/media*) echo "private media: on the mounted volume (safe): $root" ;;
  "")          echo "private media: could not be determined" ;;
  *)           echo "private media: NOT on a mounted volume ($root). TAKE A BACKUP BEFORE ANY REDEPLOY." ;;
esac
for v in AWS_STORAGE_BUCKET_NAME AWS_S3_CUSTOM_DOMAIN PRIVATE_MEDIA_ROOT; do
  if grep -qE "^$v=.+" .env 2>/dev/null; then echo "$v: set"; else echo "$v: not set"; fi
done
echo "-- proxy config files"; find /opt /etc /root /srv -maxdepth 4 \( -name 'Caddyfile*' -o -name 'caddy*.yml' \) -not -path '*/node_modules/*' 2>/dev/null | head -5
echo "-- last backup"; ls -1dt /opt/eduignite/backups/*/ 2>/dev/null | head -1 || true
