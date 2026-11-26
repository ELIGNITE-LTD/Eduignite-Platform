#!/usr/bin/env bash
# EduIgnite restore. Run ON THE NEW SERVER, from an empty backend directory that already holds
# docker-compose.prod.yml (copy it from the repo). Restores a bundle made by backup.sh.
#
#   BACKUP_PASSPHRASE_FILE=/root/.eduignite-backup-pass  ./restore.sh /path/eduignite-backup-<stamp>.tar.gpg
#
# It restores the database, public + private media and the original .env (so the SECRET_KEY and
# every other key stay identical and existing logins keep working), then compares row counts with
# the source. It does NOT switch traffic; see docs/SERVER_MIGRATION.md.
set -euo pipefail

bundle="${1:?Usage: restore.sh <eduignite-backup-....tar.gpg>}"
PASS_FILE="${BACKUP_PASSPHRASE_FILE:?Set BACKUP_PASSPHRASE_FILE}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
MEDIA_DIR="${MEDIA_DIR:-/opt/eduignite/media}"
dc() { docker compose -f "$COMPOSE_FILE" "$@" </dev/null; }

[ -f "$bundle.sha256" ] && ( cd "$(dirname "$bundle")" && sha256sum -c "$(basename "$bundle").sha256" ) \
  || echo "WARNING: no .sha256 file next to the bundle; integrity not verified"

umask 077
tmp="$(mktemp -d)"; trap 'shred -u "$tmp"/* 2>/dev/null || true; rm -rf "$tmp"' EXIT
gpg --batch --pinentry-mode loopback --passphrase-file "$PASS_FILE" -d "$bundle" | tar -C "$tmp" -xf -
( cd "$tmp" && sha256sum -c SHA256SUMS ) || { echo "ABORT: contents do not match their checksums" >&2; exit 1; }

if [ -f .env ]; then
  echo "A .env already exists here; keeping it. Make sure it matches the original (same keys)." >&2
else
  cp "$tmp/env.file" .env
fi
env_get() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }
DB_NAME="$(env_get DB_NAME)"; DB_USER="$(env_get DB_USER)"

echo "==> Starting database and redis"
dc up -d db redis
for _ in $(seq 1 60); do dc exec -T db pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1 && break; sleep 2; done

echo "==> Restoring database (this replaces the contents of $DB_NAME on THIS server)"
dc exec -T db pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner --no-privileges < "$tmp/db.dump"

echo "==> Restoring media"
mkdir -p "$MEDIA_DIR"
[ -f "$tmp/media.tar.gz" ] && tar -C "$MEDIA_DIR" -xzf "$tmp/media.tar.gz"
if [ -f "$tmp/private_media.tar.gz" ]; then
  # The private directory must live on a persistent volume here. Default: inside the media mount.
  PRIVATE_DIR="${PRIVATE_DIR:-$MEDIA_DIR/_private}"
  mkdir -p "$PRIVATE_DIR"; tar -C "$PRIVATE_DIR" -xzf "$tmp/private_media.tar.gz"
  echo "    private media restored to $PRIVATE_DIR."
  echo "    Set PRIVATE_MEDIA_ROOT=/app/media/_private in .env so the app reads it from the mounted volume."
fi

echo "==> Verifying row counts against the source"
dc exec -T db psql -U "$DB_USER" -d "$DB_NAME" -At -F ' ' <<'SQL' > "$tmp/row_counts.new"
SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text
FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;
SQL
if diff -u "$tmp/row_counts.txt" "$tmp/row_counts.new"; then
  echo "OK: every table has the same number of rows as the source."
else
  echo "MISMATCH: counts above differ (rows added to the source after the backup are expected to differ)." >&2
  exit 2
fi
echo "Restore complete. Start the app with: docker compose -f $COMPOSE_FILE up -d web worker beat"
