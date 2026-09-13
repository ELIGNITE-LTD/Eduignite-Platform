FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# System deps:
#   postgresql-client        — for pg_isready / psql in scripts
#   netcat-openbsd           — for `nc -z` host/port checks in entrypoint.sh
#   gcc                      — for C-extension Python packages
#   libpango-1.0-0,
#   libpangoft2-1.0-0        — WeasyPrint's actual native dependency (text
#                              shaping via Pango) on WeasyPrint>=60 -- older
#                              cairo/gdk-pixbuf requirements were dropped
#                              upstream. Without these, every PDF export on
#                              this backend (certificates, exam questions,
#                              career/guidance reports) silently degrades to
#                              the much more limited xhtml2pdf fallback (no
#                              flexbox, position, transform, or opacity
#                              support) -- see apps/ai_features/pdf_utils.py.
#   fonts-liberation         — a base image has NO fonts installed at all
#                              otherwise, which breaks text rendering/
#                              metrics for both PDF engines.
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    netcat-openbsd \
    gcc \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    fonts-liberation \
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
