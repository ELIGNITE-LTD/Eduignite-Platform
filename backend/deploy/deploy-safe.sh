#!/usr/bin/env bash
# Safe backend deploy, executed ON THE VPS (streamed over ssh by
# .github/workflows/deploy-backend.yml: `ssh host 'bash -s' < deploy-safe.sh`).
# The code has already been rsynced to /opt/eduignite/backend and the database
# backed up. The running stack is only replaced after the new image is built
# AND its migrations applied cleanly; if the new stack is not healthy
# afterwards it is rolled back automatically.
#
#   1. remember the running image as :last-good (only if it is healthy now)
#   2. build the new image (running containers untouched)
#   3. run `migrate` in a one-off container from the NEW image
#        -> on failure: abort, old containers keep running, exit 1
#   4. recreate web, worker, beat from the new image
#   5. poll GET /api/v1/health/ until healthy or timeout
#        -> on failure: retag :last-good as :current, recreate, exit 1
#   6. tag the new image :last-good
#
# Never prints .env values. Safe to re-run.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/eduignite/backend}"
API_HOST="${API_HOST:-api.eduignite.online}"     # Host header; must be in ALLOWED_HOSTS
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"           # seconds to wait for the new web
IMG="eduignite-backend"

cd "$APP_DIR"
# The script itself arrives on stdin (`bash -s`), so no docker command may read
# stdin or it would swallow the rest of the script: hence </dev/null.
compose() { docker compose -f docker-compose.prod.yml "$@" </dev/null; }
log() { printf '[deploy %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

# probe PATH: true when web answers 200 "ok" on PATH. Runs inside the web
# container (no curl needed on the host). X-Forwarded-Proto avoids the
# production HTTPS redirect.
probe() {
  docker compose -f docker-compose.prod.yml exec -T -e PROBE_PATH="$1" -e PROBE_HOST="$API_HOST" web python - >/dev/null 2>&1 <<'PY'
import os, sys, urllib.request
req = urllib.request.Request(
    "http://127.0.0.1:5000" + os.environ["PROBE_PATH"],
    headers={"Host": os.environ["PROBE_HOST"], "X-Forwarded-Proto": "https"},
)
try:
    with urllib.request.urlopen(req, timeout=5) as r:
        sys.exit(0 if r.status == 200 and b'"ok"' in r.read() else 1)
except Exception:
    sys.exit(1)
PY
}

# wait_healthy PATH SECONDS
wait_healthy() {
  local deadline=$((SECONDS + $2))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if probe "$1"; then return 0; fi
    sleep 3
  done
  return 1
}

# --- 1. remember what is running, if (and only if) it is proven healthy ------
if probe /api/health/; then
  running_id="$(docker inspect -f '{{.Image}}' "$(compose ps -q web)" 2>/dev/null || true)"
  if [ -n "$running_id" ]; then
    docker tag "$running_id" "$IMG:last-good"
    log "current stack is healthy; kept as $IMG:last-good"
  fi
else
  log "WARNING: current web is not healthy; keeping the existing :last-good tag (if any)"
fi

# --- 2. build the new image; nothing running is touched ----------------------
log "building new image"
compose build web

# --- 3. migrate in a one-off container from the new image --------------------
# `run` replaces the command, so docker/entrypoint.sh is skipped. Starts db and
# redis only if they are not already up. `migrate --plan` exits non-zero on
# conflicting migrations ("Conflicting migrations detected") and on a broken
# graph, before anything is written.
log "checking the migration graph"
if ! compose run --rm -T web python manage.py migrate --plan >/dev/null; then
  log "ABORT: migration graph is broken (conflicting migrations?). Old containers left running. Fix: see docs/DEPLOY_RUNBOOK.md"
  compose run --rm -T web python manage.py migrate --plan || true
  exit 1
fi
log "applying migrations"
if ! timeout 900 compose run --rm -T web python manage.py migrate --noinput; then
  log "ABORT: migrate failed. Old containers left running and untouched."
  exit 1
fi

# --- 4. replace the running stack --------------------------------------------
log "recreating web, worker, beat"
compose up -d --no-build web worker beat

# --- 5. real health check, automatic rollback --------------------------------
if wait_healthy /api/v1/health/ "$HEALTH_TIMEOUT"; then
  docker tag "$IMG:current" "$IMG:last-good"
  log "new stack is healthy; tagged $IMG:last-good"
  exit 0
fi

log "ERROR: new web not healthy after ${HEALTH_TIMEOUT}s. Last web log lines:"
compose logs --no-color --tail 40 web || true

if docker image inspect "$IMG:last-good" >/dev/null 2>&1 \
   && [ "$(docker image inspect -f '{{.Id}}' "$IMG:last-good")" != "$(docker image inspect -f '{{.Id}}' "$IMG:current")" ]; then
  log "ROLLING BACK to $IMG:last-good"
  docker tag "$IMG:last-good" "$IMG:current"
  compose up -d --no-build --force-recreate web worker beat
  # The previous image predates /api/v1/health/, so check the old endpoint.
  if wait_healthy /api/health/ 90; then
    log "rollback succeeded; previous version is serving again"
  else
    log "CRITICAL: rollback did not become healthy either. Manual action needed (docs/DEPLOY_RUNBOOK.md)."
  fi
else
  log "no earlier healthy image to roll back to. Manual action needed (docs/DEPLOY_RUNBOOK.md)."
fi
exit 1
