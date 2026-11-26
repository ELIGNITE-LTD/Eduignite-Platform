#!/usr/bin/env bash
# EduIgnite full backup. Run ON THE CURRENT PRODUCTION SERVER, from the backend directory
# that holds docker-compose.prod.yml and .env (normally /opt/eduignite/backend).
#
# Produces ONE encrypted bundle + checksums + a manifest of table row counts, under
# $BACKUP_ROOT (default /opt/eduignite/backups). It never writes into the git repository:
# this repository is public, and the bundle contains personal data and secrets.
#
#   BACKUP_PASSPHRASE_FILE=/root/.eduignite-backup-pass  ./backup.sh
#
# Contents: PostgreSQL dump (custom format), public media, private media (admission
# documents), the .env file, and the Redis append-only file. Safe to re-run; read-only for
# the live system apart from a brief consistent snapshot read by pg_dump.
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/eduignite/backups}"
MEDIA_DIR="${MEDIA_DIR:-/opt/eduignite/media}"
PASS_FILE="${BACKUP_PASSPHRASE_FILE:?Set BACKUP_PASSPHRASE_FILE to a file holding the encryption passphrase (chmod 600)}"
[ -s "$PASS_FILE" ] || { echo "ABORT: $PASS_FILE is missing or empty" >&2; exit 1; }
[ -f .env ] || { echo "ABORT: run this from the directory containing .env" >&2; exit 1; }

dc() { docker compose -f "$COMPOSE_FILE" "$@" </dev/null; }
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
work="$BACKUP_ROOT/$stamp"
umask 077
mkdir -p "$work/payload"
echo "==> Backup $stamp -> $work"

# Read DB settings from .env without echoing them.
env_get() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }
DB_NAME="$(env_get DB_NAME)"; DB_USER="$(env_get DB_USER)"
[ -n "$DB_NAME" ] && [ -n "$DB_USER" ] || { echo "ABORT: DB_NAME/DB_USER not found in .env" >&2; exit 1; }

echo "==> 1/5 PostgreSQL dump"
dc exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc --no-owner --no-privileges > "$work/payload/db.dump"
[ -s "$work/payload/db.dump" ] || { echo "ABORT: empty database dump" >&2; exit 1; }

echo "==> 2/5 Row counts (for verifying the restore)"
dc exec -T db psql -U "$DB_USER" -d "$DB_NAME" -At -F ' ' -c "
  SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname" > "$work/payload/table_estimates.txt" || true
dc exec -T db psql -U "$DB_USER" -d "$DB_NAME" -At -F ' ' <<'SQL' > "$work/payload/row_counts.txt"
SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text
FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;
SQL

echo "==> 3/5 Media files"
if [ -d "$MEDIA_DIR" ]; then
  tar -C "$MEDIA_DIR" -czf "$work/payload/media.tar.gz" .
else
  echo "    (no $MEDIA_DIR on this host; skipped. If media lives on S3, copy the bucket separately)"
fi

echo "==> 4/5 Private media (admission documents) from inside the web container"
private_root="$(dc exec -T web python - <<'PY' 2>/dev/null | tail -1
import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.production")
django.setup()
from django.conf import settings
print(settings.PRIVATE_MEDIA_ROOT)
PY
)"
if [ -n "$private_root" ] && dc exec -T web test -d "$private_root"; then
  dc exec -T web tar -C "$private_root" -cz . > "$work/payload/private_media.tar.gz"
  echo "    private media root: $private_root"
  case "$private_root" in
    /app/media*) : ;;
    *) echo "    WARNING: $private_root is NOT on a mounted volume. These files exist only inside the container" \
            "and are lost if it is recreated. This backup is their only copy: keep it." ;;
  esac
else
  echo "    (no private media directory found; skipped)"
fi

echo "==> 5/5 Configuration and Redis"
cp .env "$work/payload/env.file"
cp "$COMPOSE_FILE" "$work/payload/"
dc exec -T redis sh -c 'redis-cli BGSAVE >/dev/null 2>&1; sleep 2; tar -C /data -c .' > "$work/payload/redis-data.tar" 2>/dev/null || true

( cd "$work/payload" && sha256sum * > SHA256SUMS )
tar -C "$work/payload" -cf - . | gpg --batch --yes --pinentry-mode loopback --passphrase-file "$PASS_FILE" \
  --symmetric --cipher-algo AES256 -o "$work/eduignite-backup-$stamp.tar.gpg"
cp "$work/payload/row_counts.txt" "$work/row_counts.txt"
( cd "$work" && sha256sum "eduignite-backup-$stamp.tar.gpg" > "eduignite-backup-$stamp.tar.gpg.sha256" )
shred -u "$work"/payload/* 2>/dev/null || rm -f "$work"/payload/*; rmdir "$work/payload"

echo
echo "DONE. Encrypted bundle: $work/eduignite-backup-$stamp.tar.gpg"
ls -lh "$work"
echo "Copy the bundle and the passphrase to the new server by separate channels (never via git)."
