#!/bin/bash
set -e

DB_PORT="${DB_PORT:-5432}"

echo "⏳ Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT}..."
until nc -z "${DB_HOST}" "${DB_PORT}"; do
  sleep 0.5
done
echo "✅ PostgreSQL is ready"

echo "⏳ Waiting for Redis at ${REDIS_HOST}:${REDIS_PORT:-6379}..."
until nc -z "${REDIS_HOST:-localhost}" "${REDIS_PORT:-6379}"; do
  sleep 0.5
done
echo "✅ Redis is ready"

# The production deploy (backend/deploy/deploy-safe.sh) already ran `migrate` in
# a one-off container before replacing this one, so it sets SKIP_MIGRATE_ON_START=1
# and the web container does not run it a second time on every (re)start.
if [ "${SKIP_MIGRATE_ON_START:-0}" != "1" ]; then
  echo "🔄 Running database migrations..."
  python manage.py migrate --noinput
else
  echo "⏭  Migrations already applied by the deploy; skipping."
fi

# Incremental (no --clear): the static volume persists between restarts, so only
# changed files are copied. --clear deleted and recompressed ~800 files on every
# start, which kept the site down for a minute or more after each deploy.
echo "📦 Collecting static files..."
python manage.py collectstatic --noinput

echo "🚀 Starting application..."
exec "$@"
