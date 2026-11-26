# Moving EduIgnite to a new server without users noticing

**Do not put the data in this repository.** It is public, and the data holds students' records, admission
documents, password hashes and the keys in `.env`. Anyone could download it, and deleting it later does not
remove it from git history. Backups go to encrypted storage you control. This repository holds only the tools
and this plan.

## What has to move
| What | Where it lives now | How |
|---|---|---|
| Database | `db` container (Postgres 15), volume `pgdata` | `pg_dump`, restored with `pg_restore` |
| Public media | `/opt/eduignite/media` on the host | tar, then rsync for the final delta |
| **Private media** (admission documents) | `PRIVATE_MEDIA_ROOT`, default `/app/private_media` **inside the container** | `backup.sh` copies it out |
| Secrets and keys | `.env` | inside the encrypted bundle only |
| Redis | `redisdata` volume | cache and queues; copied but safe to lose |
| Code | this repository | `git clone`, `docker compose build` |

### Check this first: private media may not be on a volume
`docker-compose.prod.yml` mounts only `/opt/eduignite/media`. Unless `PRIVATE_MEDIA_ROOT` in the live `.env`
points inside `/app/media`, admission documents are stored in the container's own filesystem. A container
recreate (`deploy-safe.sh` uses `--force-recreate`) would then delete them. Run on the server:

    docker compose -f docker-compose.prod.yml exec web python -c "import django,os;os.environ['DJANGO_SETTINGS_MODULE']='config.settings.production';django.setup();from django.conf import settings;print(settings.PRIVATE_MEDIA_ROOT)"

If it prints something outside `/app/media`, take the backup **now** before any redeploy.

## Step 1. Back up now (on the current server)
    cd /opt/eduignite/backend
    head -c 32 /dev/urandom | base64 > /root/.eduignite-backup-pass && chmod 600 /root/.eduignite-backup-pass
    BACKUP_PASSPHRASE_FILE=/root/.eduignite-backup-pass ./scripts/migration/backup.sh

The script prints where the encrypted bundle is. Copy the **bundle** to storage off this server (another
cloud account, your own computer), and keep the **passphrase** somewhere separate (password manager). Never
send either through git, chat or email. Do this before anything else: a server that may be scratched needs a
copy that lives elsewhere.

## Step 2. Prepare the new server (no users affected)
1. Install Docker; clone this repository; copy `backend/docker-compose.prod.yml` and your `Caddyfile`.
2. Copy the bundle and passphrase over, then run `scripts/migration/restore.sh <bundle>`.
   It restores the database, media and the original `.env`, then compares row counts with the source.
3. Keep the **same `.env` secrets** (`DJANGO_SECRET_KEY`, JWT/signing keys, encryption keys, mail and payment
   credentials). Same keys mean existing logins, reset links and signed QR codes on report cards stay valid.
4. Start `web worker beat`, then test through the new server's IP (hosts-file entry for `api.eduignite.online`)
   before any real traffic: log in, open a report card, open an admission document, upload a file.

## Step 3. Make the switch invisible
1. **A day before:** lower the DNS TTL for the site and API records to 60 seconds.
2. **Cutover (a few minutes):** put the old server in maintenance mode so nothing is written, take a final
   backup, restore it on the new server (`restore.sh` again), rsync `/opt/eduignite/media` one last time, start
   the app, check it, then point DNS to the new server. Because the data is identical and the keys are the same,
   users see the same site, the same accounts and the same data. At most they see a brief maintenance page.
3. Leave the old server running read-only for a few days, then re-check that new writes went to the new one.
4. Raise the TTL back and keep the final bundle until you are sure.

For a switch with no maintenance window at all, set up PostgreSQL streaming replication to the new server first
and promote it at cutover. It takes more setup; ask for it if a few minutes of maintenance is not acceptable.

## Also move or re-point
The apps (Android, Windows, offline) use the API domain, so keep `api.eduignite.online` and the site domain
unchanged. If media is on S3 rather than local disk, copy the bucket (`aws s3 sync`) and keep
`AWS_STORAGE_BUCKET_NAME` the same. Re-issue TLS certificates on the new host (Caddy does this automatically
once DNS points to it). Schedule `backup.sh` daily with the output copied off the server.
