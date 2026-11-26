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

---

## Doing the move from GitHub (no local folder needed)

Actions > **Server migration (manual)** > Run workflow. Run the steps in this order, typing `MIGRATE` in
`confirm` for every step except `inspect-old` and `test-new`:

| # | Step | What it does | Users affected? |
|---|---|---|---|
| 1 | `inspect-old` | Read-only report: sizes, containers, where private media lives | No |
| 2 | `backup-old` | Encrypted backup on the old server | No |
| 3 | `prepare-new` | Installs Docker, firewall, copies the app files from the old server | No |
| 4 | `restore-new` | Copies the backup old to new, restores it, syncs media, checks row counts | No |
| 5 | `start-new` | Starts the app on the new server | No |
| 6 | `test-new` | Checks the new server answers | No |
| 7 | **Cutover:** `stop-old`, then `backup-old`, `restore-new`, `start-new` again, then change DNS | Brief maintenance | About 5 minutes |

Setup once: a repository secret named `MIGRATION_SSH_KEY` holding a private key that is authorised as root on
both servers. Data goes server to server (the new server pulls from the old one through a forwarded agent), never
through GitHub or the runner. The repository is public, so the logs are too and the steps print only short status
lines. When the move is finished: delete the secret, remove the key from both servers' `authorized_keys`, and
change the repository variable `VPS_HOST` to the new IP so the normal deploy workflow targets the new server.
Do not merge changes under `backend/` while the move is in progress: merging them deploys to `VPS_HOST`.

## Your move: OLD 169.58.48.112 (vmi3701577) to NEW 91.90.83.208 (vmi3758307)

Both are Contabo Cloud VPS 4 in the EU. The data goes server to server over SSH, so it never touches git or
your laptop. Run each block as `root` on the server named in the heading.

### A. On OLD: back up now
    cd /opt/eduignite/backend
    head -c 32 /dev/urandom | base64 > /root/.eduignite-backup-pass && chmod 600 /root/.eduignite-backup-pass
    git clone -q -b claude/server-migration-backup https://github.com/ELIGNITE-LTD/Eduignite-Platform.git /root/eduignite-tools
    cp -r /root/eduignite-tools/scripts/migration ./scripts-migration && chmod +x scripts-migration/*.sh
    BACKUP_PASSPHRASE_FILE=/root/.eduignite-backup-pass ./scripts-migration/backup.sh
Also copy the passphrase into your password manager. Without it the bundle cannot be opened.

### B. On NEW: install and fetch
    apt-get update && apt-get install -y docker.io docker-compose-v2 git rsync gnupg ufw
    ufw allow OpenSSH && ufw allow 80,443/tcp && ufw --force enable
    mkdir -p /opt/eduignite/backups /opt/eduignite/media /opt/eduignite/backend
    ssh-keygen -t ed25519 -N '' -f /root/.ssh/id_ed25519
    ssh-copy-id root@169.58.48.112          # asks for OLD's root password once
    rsync -av root@169.58.48.112:/opt/eduignite/backups/ /opt/eduignite/backups/
    scp root@169.58.48.112:/root/.eduignite-backup-pass /root/ && chmod 600 /root/.eduignite-backup-pass
    git clone -q -b claude/server-migration-backup https://github.com/ELIGNITE-LTD/Eduignite-Platform.git /root/eduignite-repo
    cp -r /root/eduignite-repo/backend/. /opt/eduignite/backend/
    cd /opt/eduignite/backend && chmod +x /root/eduignite-repo/scripts/migration/*.sh

### C. On NEW: restore and start (users are still on OLD)
    cd /opt/eduignite/backend
    BACKUP_PASSPHRASE_FILE=/root/.eduignite-backup-pass /root/eduignite-repo/scripts/migration/restore.sh /opt/eduignite/backups/<stamp>/eduignite-backup-<stamp>.tar.gpg
    docker compose -f docker-compose.prod.yml up -d --build web worker beat
Then copy the reverse-proxy config (Caddyfile) and its certificate data from OLD. Find them there with
`docker ps` and `find / -name Caddyfile 2>/dev/null`.

### D. Test NEW before any user goes there
    curl --resolve api.eduignite.online:443:91.90.83.208 -sk https://api.eduignite.online/ | head
Log in as a test user through a hosts-file entry, open a report card and an admission document, upload a file.

### E. Cutover (about 5 minutes; do it at a quiet hour)
1. **A day before:** at your DNS provider, lower the TTL on `eduignite.online`, `www` and `api` from 1800 to 60.
2. On OLD put the app in maintenance (`docker compose -f docker-compose.prod.yml stop web worker beat`).
3. On OLD run `backup.sh` again, then on NEW rsync the new bundle and `restore.sh` it, and sync media:
   `rsync -az --delete root@169.58.48.112:/opt/eduignite/media/ /opt/eduignite/media/`
4. On NEW start `web worker beat`, check it, then change the A records for `eduignite.online`, `www` and `api`
   from `169.58.48.112` to `91.90.83.208`.
5. Keep OLD stopped but not deleted for a week. Raise the TTL back to 1800 once all is well.
