#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/home/ubuntu/eduignite-official-website-2026}"
BACKEND_DIR="$PROJECT_ROOT/studio-main/backend"
SERVICE_NAME="${SERVICE_NAME:-eduignite.service}"
NGINX_SITE="api.eduignite.online.conf"

cd "$BACKEND_DIR"

echo "Pulling latest backend code..."
git fetch origin main
git checkout main
git pull --ff-only origin main

echo "Activating virtual environment..."
source "$BACKEND_DIR/venv/bin/activate"

if ! grep -q '^LIBRETRANSLATE_URL=' "$BACKEND_DIR/.env" 2>/dev/null; then
  echo "LIBRETRANSLATE_URL=http://127.0.0.1:5000" | sudo tee -a "$BACKEND_DIR/.env" >/dev/null
fi

if command -v docker >/dev/null 2>&1; then
  echo "Checking LibreTranslate container..."
  DOCKER_CMD="docker"
  if ! docker ps >/dev/null 2>&1; then
    DOCKER_CMD="sudo docker"
  fi
  if ! $DOCKER_CMD ps --format '{{.Names}}' | grep -qx 'eduignite-libretranslate'; then
    $DOCKER_CMD rm -f eduignite-libretranslate >/dev/null 2>&1 || true
    $DOCKER_CMD run -d --name eduignite-libretranslate --restart unless-stopped -p 127.0.0.1:5000:5000 libretranslate/libretranslate >/dev/null
  fi
else
  echo "Docker is not installed. LibreTranslate fallback remains available, but install Docker for full live translation."
fi

echo "Installing backend requirements..."
pip install -r requirements.txt

echo "Running Django checks, migrations, and static collection..."
python manage.py check --deploy
python manage.py migrate --noinput
python manage.py collectstatic --noinput

echo "Installing systemd service..."
sudo cp "$BACKEND_DIR/deploy/eduignite-gunicorn.service" "/etc/systemd/system/$SERVICE_NAME"

if [[ "${INSTALL_NGINX:-0}" == "1" ]]; then
  sudo cp "$BACKEND_DIR/deploy/nginx-api.eduignite.online.conf" "/etc/nginx/sites-available/$NGINX_SITE"
  sudo ln -sf "/etc/nginx/sites-available/$NGINX_SITE" "/etc/nginx/sites-enabled/$NGINX_SITE"
else
  echo "Skipping Nginx config overwrite. Set INSTALL_NGINX=1 only if you need to replace the live Nginx site."
fi

echo "Reloading systemd..."
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"

echo "Clearing any stale process still bound to 127.0.0.1:8000..."
sudo systemctl stop "$SERVICE_NAME" || true
if command -v fuser >/dev/null 2>&1; then
  sudo fuser -k 8000/tcp || true
else
  echo "fuser is not installed. Install psmisc if stale port cleanup is needed: sudo apt install -y psmisc"
fi

echo "Validating and reloading Nginx..."
sudo nginx -t
sudo systemctl reload nginx

echo "Starting EduIgnite API service..."
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl status "$SERVICE_NAME" --no-pager -l

echo "Checking public API health..."
curl -fsS https://api.eduignite.online/api/health/ || true

echo
echo "Checking translation endpoint. A 200 response means the frontend language switcher will not see a 503."
curl -fsS -X POST https://api.eduignite.online/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text":"Dashboard Settings","targetLang":"fr","sourceLang":"en"}' || true

echo
echo "Checking timetable route. A 401/403 means the route exists and auth is required; 404 means stale code is still serving."
curl -i https://api.eduignite.online/api/v1/timetable/ || true
