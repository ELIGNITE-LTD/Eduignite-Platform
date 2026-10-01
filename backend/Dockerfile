# Pinned to Debian 12 (bookworm). The bare 3.11-slim tag moved to Debian 13,
# where Playwright cannot install Chromium's system libraries, and the backend
# image failed to build. Move both together, never the base image alone.
FROM python:3.11-slim-bookworm

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

# Headless Chromium for the chat bots' PDFs: an answer with a chart or
# mathematics is printed from the website's own answer page, so the PDF is
# drawn exactly as the app draws it (apps/bots/rendering.py). --with-deps
# pulls the system libraries Chromium needs on this slim image.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN python -m playwright install --with-deps chromium     && rm -rf /var/lib/apt/lists/*

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

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:5000", "--workers", "3", "--threads", "4", "--timeout", "300"]
