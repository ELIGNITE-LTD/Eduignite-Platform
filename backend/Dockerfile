FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# System deps:
#   postgresql-client  — for pg_isready / psql in scripts
#   netcat-openbsd     — for `nc -z` host/port checks in entrypoint.sh
#   gcc                — for C-extension Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    netcat-openbsd \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements ./requirements
RUN pip install --no-cache-dir -r requirements/production.txt

# Copy application code
COPY . .

# Make entrypoint executable
RUN chmod +x docker/entrypoint.sh

# Set default Django settings module
ENV DJANGO_SETTINGS_MODULE=config.settings.production

# collectstatic is run by entrypoint.sh at container start so it picks up
# the correct STATIC_ROOT from environment variables; remove it from here
# to avoid a missing-env failure at build time.

EXPOSE 5000

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:5000", "--workers", "3", "--timeout", "120"]
