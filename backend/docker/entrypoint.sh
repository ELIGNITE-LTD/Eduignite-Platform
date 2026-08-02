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

echo "🔄 Running database migrations..."
python manage.py migrate --noinput

echo "📦 Collecting static files..."
python manage.py collectstatic --noinput --clear

echo "🚀 Starting application..."
exec "$@"
