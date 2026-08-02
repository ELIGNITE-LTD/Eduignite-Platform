# EduIgnite AWS EC2 Deployment Guide

This backend is configured for **AWS EC2 + AWS RDS PostgreSQL only**. SQLite and database fallback logic are intentionally unsupported.

The current production host runs the backend from:

```bash
/home/ubuntu/eduignite-official-website-2026/studio-main/backend
```

Gunicorn is managed by `eduignite.service` and binds to `127.0.0.1:8000`. Nginx proxies `api.eduignite.online` to that local port.

## 1. Server Preparation

Install system packages on Ubuntu EC2:

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nginx postgresql-client
```

Clone the repository under `/home/ubuntu/eduignite-official-website-2026`, then create and activate the backend virtual environment:

```bash
cd /home/ubuntu/eduignite-official-website-2026/studio-main/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

## 2. Environment Configuration

Copy `.env.example` to `.env` and replace every placeholder value:

```bash
cp .env.example .env
nano .env
```

The database must use the RDS endpoint and DB variables:

```ini
DJANGO_SETTINGS_MODULE=config.settings.production
DB_NAME=replace-with-rds-database-name
DB_USER=replace-with-rds-username
DB_PASSWORD=replace-with-rds-password
DB_HOST=eduignite-db.covciwuwadhr.us-east-1.rds.amazonaws.com
DB_PORT=5432
```

Django enforces PostgreSQL with `sslmode=require` in settings.

## 3. Database Migration and Static Files

```bash
cd /home/ubuntu/eduignite-official-website-2026/studio-main/backend
source venv/bin/activate
python manage.py check --deploy
python manage.py migrate --noinput
python manage.py collectstatic --noinput
```

## 4. Gunicorn Systemd Service

Install the service template. The repository file is named `eduignite-gunicorn.service`, but production installs it as `eduignite.service`:

```bash
sudo cp deploy/eduignite-gunicorn.service /etc/systemd/system/eduignite.service
sudo systemctl daemon-reload
sudo systemctl enable eduignite.service
sudo systemctl start eduignite.service
sudo systemctl status eduignite.service --no-pager -l
```

Gunicorn binds to `127.0.0.1:8000`, and Nginx proxies to `http://127.0.0.1:8000`.

If deploy logs show `Connection in use: ('127.0.0.1', 8000)`, a stale Gunicorn process is still holding the port. Restart with:

```bash
sudo systemctl stop eduignite.service || true
sudo fuser -k 8000/tcp || true
sudo systemctl restart eduignite.service
sudo systemctl status eduignite.service --no-pager -l
```

## 5. Nginx Reverse Proxy

Install the Nginx config and remove the default landing page:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo cp deploy/nginx-api.eduignite.online.conf /etc/nginx/sites-available/api.eduignite.online.conf
sudo ln -sf /etc/nginx/sites-available/api.eduignite.online.conf /etc/nginx/sites-enabled/api.eduignite.online.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 6. Frontend Build

From the frontend project root:

```bash
cd /home/ubuntu/eduignite-official-website-2026/studio-main
npm install
npm run build
```

Set `NEXT_PUBLIC_API_URL` to the backend API origin before building the frontend.

## 7. One-Command Backend Restart

For production updates, prefer the checked-in restart script:

```bash
cd /home/ubuntu/eduignite-official-website-2026/studio-main/backend
bash deploy/restart_eduignite_api.sh
```

The script pulls latest `main`, ensures `LIBRETRANSLATE_URL` is set, starts/checks the local LibreTranslate Docker container when Docker is available, installs backend dependencies, runs Django checks, applies migrations, collects static files, installs the production systemd config, clears stale port `8000` listeners, restarts `eduignite.service`, and checks the translation and timetable routes.

By default the script does not overwrite the live Nginx site because production may already contain Certbot-managed HTTPS blocks. To intentionally reinstall the checked-in Nginx template:

```bash
INSTALL_NGINX=1 bash deploy/restart_eduignite_api.sh
```

For protected routes such as `/api/v1/timetable/`, an unauthenticated `401` or `403` after restart means the route exists and the frontend can call it with a token. A `404` means production is still serving stale code.
