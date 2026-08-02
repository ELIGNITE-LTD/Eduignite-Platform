#!/usr/bin/env bash
# =============================================================================
#  EduIgnite Backend – Production Setup Script
#
#  Usage:
#    chmod +x setup_production.sh
#    ./setup_production.sh [--seed] [--superuser]
#
#  Flags:
#    --seed       Run setup_production_data management command after migrations
#    --superuser  Create a Django superuser interactively after setup
#    --flush      Pass --flush to setup_production_data (wipe then re-seed)
#
#  Requirements: Python 3.11+, pip, PostgreSQL running, Redis running
# =============================================================================

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── Argument parsing ─────────────────────────────────────────────────────────
SEED=false
CREATE_SUPERUSER=false
FLUSH_FLAG=""

for arg in "$@"; do
  case $arg in
    --seed)       SEED=true ;;
    --superuser)  CREATE_SUPERUSER=true ;;
    --flush)      FLUSH_FLAG="--flush" ;;
  esac
done

# ── Check .env ────────────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    warn ".env not found – copying from .env.example. Edit it before going live!"
    cp .env.example .env
  else
    error ".env file not found. Create one from .env.example first."
    exit 1
  fi
fi

export $(grep -v '^#' .env | grep -v '^$' | xargs)
export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-config.settings.production}"

info "Settings module: $DJANGO_SETTINGS_MODULE"

# ── Python virtual environment ────────────────────────────────────────────────
if [ ! -d "venv" ]; then
  info "Creating virtual environment..."
  python3 -m venv venv
fi

info "Activating virtual environment..."
# shellcheck disable=SC1091
source venv/bin/activate

# ── Install dependencies ──────────────────────────────────────────────────────
info "Installing Python dependencies..."
pip install --upgrade pip --quiet
pip install -r requirements/base.txt --quiet

# Install Pillow explicitly to ensure image support
pip install "Pillow>=12.0.0" --quiet
python -c "from PIL import Image; print('  Pillow', Image.__version__, '✓')"

# ── Create required directories ───────────────────────────────────────────────
info "Creating required directories..."
mkdir -p logs media staticfiles

# ── Wait for PostgreSQL ───────────────────────────────────────────────────────
info "Waiting for PostgreSQL..."
MAX_TRIES=30
COUNT=0
until python -c "
import os
import psycopg2
required = ['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST', 'DB_PORT']
missing = [name for name in required if not os.environ.get(name)]
if missing:
    raise SystemExit('Missing required database variables: ' + ', '.join(missing))
try:
    psycopg2.connect(
        dbname=os.environ['DB_NAME'],
        user=os.environ['DB_USER'],
        password=os.environ['DB_PASSWORD'],
        host=os.environ['DB_HOST'],
        port=os.environ.get('DB_PORT', '5432'),
        sslmode='require',
    )
    print('  PostgreSQL ready ✓')
    exit(0)
except Exception:
    exit(1)
" 2>/dev/null; do
  COUNT=$((COUNT + 1))
  if [ $COUNT -ge $MAX_TRIES ]; then
    error "PostgreSQL not available after ${MAX_TRIES} attempts. Check DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT and RDS network access."
    exit 1
  fi
  warn "  Waiting for database... (attempt $COUNT/$MAX_TRIES)"
  sleep 2
done

# ── Wait for Redis ────────────────────────────────────────────────────────────
info "Waiting for Redis..."
COUNT=0
until python -c "
import redis, os
try:
    r = redis.from_url(os.environ.get('REDIS_URL', 'redis://localhost:6379/0'))
    r.ping()
    print('  Redis ready ✓')
    exit(0)
except Exception:
    exit(1)
" 2>/dev/null; do
  COUNT=$((COUNT + 1))
  if [ $COUNT -ge 15 ]; then
    warn "Redis not available – continuing without it (caching will use in-memory fallback)."
    break
  fi
  warn "  Waiting for Redis... (attempt $COUNT/15)"
  sleep 2
done

# ── Run migrations ────────────────────────────────────────────────────────────
info "Running database migrations..."
python manage.py migrate --noinput

# ── Collect static files ──────────────────────────────────────────────────────
info "Collecting static files..."
python manage.py collectstatic --noinput --clear

# ── Create default PlatformSettings ──────────────────────────────────────────
info "Ensuring platform settings exist..."
python manage.py shell -c "
from apps.platform.models import PlatformSettings
ps = PlatformSettings.load()
print(f'  PlatformSettings pk={ps.pk} ready ✓')
"

# ── Create Django superuser ───────────────────────────────────────────────────
if [ "$CREATE_SUPERUSER" = true ]; then
  info "Creating Django superuser..."
  python manage.py createsuperuser \
    --username EI-SUPER-001 \
    --email superadmin@eduignite.com || warn "Superuser may already exist – skipping."
fi

# ── Seed production data ──────────────────────────────────────────────────────
if [ "$SEED" = true ]; then
  info "Seeding production demo data (all 13 roles, schools, relationships)..."
  python manage.py setup_production_data $FLUSH_FLAG
fi

# ── Generate OpenAPI schema ───────────────────────────────────────────────────
info "Generating OpenAPI schema..."
python manage.py spectacular --file docs/openapi_schema.yml --validate 2>/dev/null || \
  warn "Could not generate OpenAPI schema (non-fatal)."

# ── Health check ─────────────────────────────────────────────────────────────
info "Running system health check..."
python manage.py shell -c "
from django.db import connection
cursor = connection.cursor()
cursor.execute('SELECT COUNT(*) FROM users')
count = cursor.fetchone()[0]
print(f'  Database OK – {count} user(s) in system ✓')

from apps.schools.models import School
schools = School.objects.count()
print(f'  Schools: {schools} ✓')
" 2>/dev/null || warn "Health check could not connect to DB."

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
info "================================================================"
info "  EduIgnite Backend Setup Complete!"
info "================================================================"
info "  Start development server:  python manage.py runserver"
info "  Start production server:   gunicorn config.wsgi:application"
info "  Start ASGI (WebSockets):   daphne config.asgi:application"
info "  Start Celery worker:       celery -A config worker -l info"
info "  Start Celery beat:         celery -A config beat -l info"
info ""
info "  API docs:  http://localhost:8000/api/docs/"
info "  Admin:     http://localhost:8000/admin/"
info "================================================================"
echo ""
