# Moving EduIgnite to a new Contabo server (1-year plan)

> **Automated version.** The steps below are also available as a hand-started GitHub workflow, **Server migration**
> (`.github/workflows/migrate-server.yml`), with the stages `inventory`, `prepare-new`, `rehearse-copy`, `cutover-copy`,
> `start-new`, `verify`, `activate-caddy`, `mark-live` and `rollback-old`. It moves the SAME database and files (nothing is
> rebuilt from scratch), never deletes anything on the old server, proves at cutover that every table's row count and the
> media totals are identical (`infra/contabo/table-counts.sh`), and refuses to overwrite a new server once it is marked live.
> It needs the repo secret `NEW_VPS_SSH_KEY` and variables `NEW_VPS_HOST`, `NEW_VPS_USER`. Cloudflare is in `CLOUDFLARE_SETUP.md`;
> a CI-built website deploy (no building on the server) is `.github/workflows/deploy-frontend-ci.yml`.
> None of this has been run against the real servers yet: run `inventory`, then `prepare-new` and `rehearse-copy` first.

Goal: move the whole stack from the current one-month Contabo VPS to the new one-year VPS with a few minutes of downtime and an instant way back. Nothing here has been run yet; the repo does not hold the server's own files, so step 0 is an inventory of the old server.

## What lives on the server (from the repo)

| Part | Where | Moves by |
|---|---|---|
| Backend stack (`web`, `worker`, `beat`, `db`, `redis`) | `/opt/eduignite/backend`, `docker-compose.prod.yml` | CI deploy (code) + data copy |
| Database | Docker volume `pgdata` (Postgres 15) | `pg_dump` / restore |
| Uploaded files | `/opt/eduignite/media` (bind mount) | `rsync` |
| Private files (admission documents) | `PRIVATE_MEDIA_ROOT` (check `.env`; the compose file mounts only `/opt/eduignite/media`) | `rsync`, once its real path is known |
| Redis | volume `redisdata` | not copied (cache + job queue; see step 5) |
| Secrets | `/opt/eduignite/backend/.env` (chmod 600) | copied by hand, never through git or chat |
| Website | `/opt/eduignite/frontend`, `deploy-frontend.sh`, `docker-compose.frontend.yml` | CI deploy |
| Reverse proxy and TLS | Caddy (Caddyfile is NOT in the repo) | copy the file |
| Backups | `/opt/eduignite/backup.sh` and its cron entry (NOT in the repo) | copy file + cron |
| CI access | repo secret `VPS_SSH_KEY`, variables `VPS_HOST`, `VPS_USER` | change `VPS_HOST` at cutover |

## Step 0: inventory the old server (read-only)

Run on the OLD server and keep the output. Do not paste secret values anywhere.

```bash
ls -la /opt/eduignite /opt/eduignite/backend /opt/eduignite/media | head -60
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
docker volume ls
du -sh /opt/eduignite/media /var/lib/docker/volumes/*pgdata* 2>/dev/null
grep -E '^(PRIVATE_MEDIA_ROOT|DB_HOST|REDIS_URL|ALLOWED_HOSTS)=' /opt/eduignite/backend/.env | sed 's/=.*/=<set>/'
cat /etc/caddy/Caddyfile
crontab -l; ls /etc/cron.d
cat /opt/eduignite/backup.sh
```

## Step 1: prepare the new server (no traffic yet)

1. Same OS family and Docker as the old one. Install Docker + Compose plugin and Caddy.
2. Firewall: open 22, 80, 443 only. Create a non-root sudo user if the old one has one.
3. Create `/opt/eduignite` and `/opt/eduignite/media`.
4. Add the CI deploy public key to `authorized_keys` (same key as the old server, so `VPS_SSH_KEY` does not change).
5. Lower the DNS TTL of `eduignite.online`, `www`, and `api` to 300 seconds at least a day before cutover.

## Step 2: first copy while the old server keeps serving

```bash
# from the old server to the new one (replace NEW with its address)
rsync -a /opt/eduignite/media/ NEW:/opt/eduignite/media/
rsync -a <private media path>/ NEW:<same path>/
scp /opt/eduignite/backend/.env NEW:/opt/eduignite/backend/.env   # then chmod 600 on NEW
scp /etc/caddy/Caddyfile NEW:/etc/caddy/Caddyfile
scp /opt/eduignite/backup.sh /opt/eduignite/deploy-frontend.sh NEW:/opt/eduignite/
```

Edit the new `.env` only if something is tied to the old address (for example a webhook URL or an IP allow-list).

## Step 3: rehearsal on the new server

1. Point `VPS_HOST` at the NEW server and run the **Deploy backend** workflow by hand (`workflow_dispatch`). It builds the stack and migrates an empty database.
2. Restore a fresh dump into it:
   ```bash
   # old server
   docker compose -f /opt/eduignite/backend/docker-compose.prod.yml exec -T db sh -c 'pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc' > /tmp/eduignite.dump
   scp /tmp/eduignite.dump NEW:/tmp/
   # new server
   docker compose -f /opt/eduignite/backend/docker-compose.prod.yml exec -T db sh -c 'pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner' < /tmp/eduignite.dump
   ```
3. Test it without DNS: `curl --resolve api.eduignite.online:443:NEW https://api.eduignite.online/api/v1/health/` (Caddy gets its certificate only after DNS points here, so use `-k` for the rehearsal or test on the server's localhost:5000).
4. Run the Deploy frontend workflow and check the site responds on :3000.

Put `VPS_HOST` back to the OLD server after the rehearsal if you are not cutting over the same day.

## Step 4: cutover (pick a quiet hour; about 10-20 minutes)

1. Announce a short maintenance window.
2. OLD server: stop writes: `docker compose -f /opt/eduignite/backend/docker-compose.prod.yml stop web worker beat`.
3. Final data copy: dump the database again (step 3.2), restore on the new server, and `rsync -a` the media and private-media folders again.
4. NEW server: start everything (`up -d`), confirm `/api/v1/health/` on localhost and that `backend-web-1`, `backend-worker-1`, `backend-beat-1` run with RestartCount 0.
5. Change DNS (A records for `@`, `www`, `api`) to the new IP. Caddy on the new server fetches the certificates on the first request.
6. Set `VPS_HOST` (repo variable) to the new IP so future deploys go to the new server.
7. Copy the backup cron entry; run `backup.sh` once and check the file appears.

## Step 5: verify (use the test accounts)

- `https://api.eduignite.online/api/v1/health/` returns 200 and `https://api.eduignite.online/api/v1/watch/ping/` returns 200.
- Log in as the school admin, a lecturer, a student, a parent; open a page with an uploaded image and an admission document.
- System Watch (CEO/CTO): the health checks are green and "Send a test alert" reaches both founders.
- Redis was not copied: users stay logged in (tokens are stateless) but queued background jobs on the old server are lost, which is why step 4.2 stops the worker and lets it finish first. Check nothing was mid-job (`docker compose logs --tail 20 worker`).
- Payments and email: confirm the Fapshi and Brevo webhooks/senders do not depend on the old IP.

## Rollback

Until the old server is cancelled: switch DNS back and set `VPS_HOST` back, then start the old stack (`up -d`). Any data written on the new server after the cutover would be missing on the old one, so decide within the first hour; after that, fix forward.

## After a week

1. Take a last backup of the old server and keep a copy off-server.
2. Cancel or let the old one-month plan lapse.
3. Raise the DNS TTL back to 3600.
4. Add the new server to the uptime monitor on `/api/v1/watch/ping/`.

## Things to confirm before starting

- The new server has the same or better CPU, RAM and disk (the database + media sizes from step 0 must fit with room to spare) and the same CPU architecture (Docker images are built on the server, so x86 vs ARM works either way, but confirm).
- Where the private (admission) documents really live.
- Whether any service uses the old server's IP (webhooks, allow-lists, email SPF, firewall rules at Brevo or Fapshi).
