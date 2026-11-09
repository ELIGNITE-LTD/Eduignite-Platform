# Backend deploy runbook

## How a deploy works

Merging to `main` with changes under `backend/` triggers `.github/workflows/deploy-backend.yml`.

Before merge, `.github/workflows/backend-checks.yml` runs on every pull request: it fails on conflicting or missing migrations, applies every migration to an empty Postgres, runs `manage.py check` and boots the app. Make "Migrations & boot" a required check in the branch protection of `main`.

The deploy, in order (`backend/deploy/deploy-safe.sh` runs the last four steps on the VPS):

1. Database backup (`/opt/eduignite/backup.sh`).
2. rsync of `backend/` to `/opt/eduignite/backend` (`.env` is never touched).
3. Remember the running image as `eduignite-backend:last-good`, but only if it answers its health check now.
4. Build the new image. Running containers are untouched.
5. `migrate --plan` then `migrate` in a one-off container from the NEW image. If either fails, the deploy aborts, the old containers keep serving, and the job is red with the migrate error in the log.
6. Recreate `web`, `worker`, `beat` from the new image.
7. Poll `GET /api/v1/health/` (up to 120 s). It answers 200 `{"status":"ok"}` only if the app booted and the database answers.
8. If unhealthy: retag `last-good` as `current`, recreate the three services, check `/api/health/`, and fail the job.
9. If healthy: tag the new image `last-good`.

Migrations run before the new code starts, so a migration must stay compatible with the code still running (additive: new tables, nullable or defaulted columns; drop or rename in a later deploy). A rollback restores the old code, not the old schema.

## When a deploy fails

Read the red job log, then:

| Log says | Meaning | Action |
|---|---|---|
| `ABORT: migration graph is broken` | conflicting migrations | Production is unaffected. Resolve (below), push, redeploy. |
| `ABORT: migrate failed` | a migration raised | Production is unaffected. Fix the migration in a new PR. The DB may be partly migrated if the migration was not atomic; restore from backup only if data is wrong. |
| `new web not healthy ... ROLLING BACK` then `rollback succeeded` | new code does not boot | Old version is serving. Read the printed web log lines, fix, redeploy. |
| `CRITICAL: rollback did not become healthy` or `no earlier healthy image` | manual work | See below. |

## Rolling back by hand (on the VPS)

```
cd /opt/eduignite/backend
docker image ls eduignite-backend          # :current, :last-good
docker tag eduignite-backend:last-good eduignite-backend:current
docker compose -f docker-compose.prod.yml up -d --no-build --force-recreate web worker beat
docker compose -f docker-compose.prod.yml logs --tail 50 web
```

To restore data, use the backup taken at the start of the deploy (`/opt/eduignite/backup.sh` writes them; check the script for the location). Restoring discards everything written since, so prefer fixing forward.

## Conflicting migrations

Two PRs that each add a migration to the same app both pick the next number, e.g. two `0015_*`. Each is fine alone; together Django refuses to migrate ("Conflicting migrations detected"). Rules:

- Never number a migration by hand. Always run `python manage.py makemigrations`.
- Before merging a PR that has migrations, merge or rebase `main` into it and re-run `python manage.py makemigrations --check --dry-run`. The PR check does the same on the merge result.
- To fix a conflict: `python manage.py makemigrations --merge`, review the generated merge migration, commit it, push.

## What "Login problem: You appear to be offline" means

The apps show it when the login request gets no usable HTTP response from the API: a network error, a timeout, or a response the browser blocks. A gateway error (502/503) from Caddy while the backend is down looks exactly like that, because Caddy's own error page has no CORS headers and the browser reports the request as a network error. So it usually means "the API is down", not "your phone has no signal". Check `https://api.eduignite.online/api/v1/health/` first: 200 means the API is fine and the user's connection is the problem.

## CORS headers on proxy errors (not applied, optional)

The Caddyfile that serves the VPS is not in this repository (`infra/aws/Caddyfile` is the AWS one), so this was not changed. To let the apps see a real 502/503 instead of a network error, the API site block on the VPS can get a `handle_errors` block. Untested sketch; validate with `caddy validate` before reloading:

```
api.eduignite.online {
	reverse_proxy 127.0.0.1:5000

	handle_errors {
		@cors header_regexp origin Origin ^https://(www\.)?eduignite\.online$
		header @cors Access-Control-Allow-Origin "{http.request.header.Origin}"
		header @cors Vary Origin
		respond "{http.error.status_code} {http.error.status_text}" {http.error.status_code}
	}
}
```

## First-deploy checks

- `docker image ls eduignite-backend` shows `current` and `last-good`.
- `curl -s https://api.eduignite.online/api/v1/health/` returns `{"status":"ok"}`.
- `docker ps` shows `backend-web-1`, `backend-worker-1`, `backend-beat-1` up with RestartCount 0.
