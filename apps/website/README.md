# EduIgnite

EduIgnite is a full-stack school management platform built with **Next.js 15** for the frontend and **Django 4.2** for the backend.

## Deployment Model

- Frontend: deploy `studio-main/` to **Vercel**
- Backend: deploy `studio-main/backend/` to a Python host
- Database: use **PostgreSQL**

The frontend is Vercel-ready. The backend should be hosted separately because the Django stack includes API, Channels, and Celery concerns that are better suited to a full Python runtime than an all-in-one Vercel deployment.

## Local Development

### Backend

Prerequisites:

- Python 3.11+
- PostgreSQL 15+
- Redis 7+ for Channels/Celery features

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements/development.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver
```

API: `http://localhost:8000/api/v1/`

### Frontend

Prerequisites:

- Node.js 20+

```bash
cd ..
npm install
cp .env.example .env.local
npm run dev
```

App: `http://localhost:3000`

## Vercel Frontend Setup

1. Import the repository into Vercel.
2. Set the project root directory to `studio-main`.
3. Install command: `npm install`
4. Build command: `npm run build`
5. Add the required environment variables.

Frontend environment variables:

```ini
NEXT_PUBLIC_API_URL=https://your-backend-domain/api/v1
NEXT_PUBLIC_APP_URL=https://your-vercel-domain.vercel.app
NEXT_PUBLIC_APP_NAME=EduIgnite
NEXT_PUBLIC_CONTACT_EMAIL=info@eduignite.online
```

## Backend Hosting Setup

Deploy `backend/` to AWS EC2 behind Nginx and connect it only to AWS RDS PostgreSQL.

Required backend environment variables:

```ini
DJANGO_SECRET_KEY=replace-me
DEBUG=False
DJANGO_ENV=production
NODE_ENV=production
ENVIRONMENT=production
DJANGO_SETTINGS_MODULE=config.settings.production
DB_NAME=replace-with-rds-database-name
DB_USER=replace-with-rds-username
DB_PASSWORD=replace-with-rds-password
DB_HOST=eduignite-db.covciwuwadhr.us-east-1.rds.amazonaws.com
DB_PORT=5432
ALLOWED_HOSTS=api.eduignite.online,eduignite.com,www.eduignite.com,<EC2_PUBLIC_IP>
FRONTEND_URLS=https://eduignite.com,https://www.eduignite.com,https://admin.eduignite.com,https://dashboard.eduignite.com
CORS_ALLOWED_ORIGINS=https://eduignite.com,https://www.eduignite.com,https://admin.eduignite.com,https://dashboard.eduignite.com
CSRF_TRUSTED_ORIGINS=https://eduignite.com,https://www.eduignite.com,https://admin.eduignite.com,https://dashboard.eduignite.com,https://api.eduignite.online
```

SQLite and database fallback configuration are intentionally unsupported.

Useful optional variables:

```ini
REDIS_URL=redis://HOST:6379/1
CELERY_BROKER_URL=redis://HOST:6379/0
CELERY_RESULT_BACKEND=redis://HOST:6379/0
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_STORAGE_BUCKET_NAME=
SENTRY_DSN=
```

After deploy:

```bash
python manage.py migrate
python manage.py collectstatic --noinput
```

## Environment Notes

- PostgreSQL is the intended production database.
- If `REDIS_URL` is not set, the backend now falls back to local in-memory cache/channel settings for simpler non-realtime environments.
- No demo seed step is required or documented in this repository.

## Repo Structure

```text
studio-main/
├── backend/      Django API
├── src/          Next.js app source
├── package.json
└── next.config.ts
```
