#!/usr/bin/env bash
# Runs ONE migration step from GitHub Actions (see .github/workflows/server-migration.yml).
# Data never passes through GitHub or the runner: the NEW server pulls straight from the OLD server using a
# forwarded ssh-agent, so the key is never written onto either server. Output is kept short because the
# repository is public and so are its Actions logs.
set -euo pipefail
: "${STEP:?}" "${OLD:?}" "${NEW:?}" "${MIGRATION_SSH_KEY:?Add the MIGRATION_SSH_KEY secret}"
CONFIRM="${CONFIRM:-}"
ipv4='^[0-9]{1,3}(\.[0-9]{1,3}){3}$'
[[ $OLD =~ $ipv4 && $NEW =~ $ipv4 ]] || { echo "old_host/new_host must be IPv4 addresses" >&2; exit 1; }
[ "$OLD" != "$NEW" ] || { echo "old_host and new_host are the same" >&2; exit 1; }
echo "::add-mask::$OLD"; echo "::add-mask::$NEW"

case "$STEP" in
  inspect-old|test-new) ;;
  *) [ "$CONFIRM" = "MIGRATE" ] || { echo "This step changes a server. Re-run with confirm = MIGRATE." >&2; exit 1; } ;;
esac

install -m 700 -d ~/.ssh
eval "$(ssh-agent -s)" >/dev/null
printf '%s\n' "$MIGRATION_SSH_KEY" | tr -d '\r' | ssh-add - >/dev/null 2>&1 || { echo "MIGRATION_SSH_KEY is not a valid private key" >&2; exit 1; }
trap 'ssh-agent -k >/dev/null 2>&1 || true' EXIT
SSH=(ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ServerAliveInterval=30 -o ConnectTimeout=20)
on_old() { "${SSH[@]}" "root@$OLD" "$@"; }
on_new() { "${SSH[@]}" -A "root@$NEW" "$@"; }          # -A: NEW may use our key to reach OLD
ssh_inner="ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes"   # runs ON the new server
APP=/opt/eduignite/backend
PASS=/root/.eduignite-backup-pass

push_scripts() {  # $1 = old|new
  local fn="on_$1"
  $fn "mkdir -p $APP/scripts-migration"
  tar -C scripts/migration -cf - . | $fn "tar -C $APP/scripts-migration -xf - && sed -i 's/\r\$//' $APP/scripts-migration/*.sh && chmod +x $APP/scripts-migration/*.sh"
}

case "$STEP" in
  inspect-old)
    on_old 'bash -s' < scripts/migration/inspect.sh ;;

  backup-old)
    push_scripts old
    on_old "[ -s $PASS ] || { umask 077; head -c 32 /dev/urandom | base64 > $PASS; echo 'created a new backup passphrase on the old server'; }"
    on_old "cd $APP && BACKUP_PASSPHRASE_FILE=$PASS bash scripts-migration/backup.sh" ;;

  prepare-new)
    on_new 'bash -s' <<'R'
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq docker.io rsync gnupg ufw curl >/dev/null
apt-get install -y -qq docker-compose-v2 >/dev/null 2>&1 || apt-get install -y -qq docker-compose-plugin >/dev/null
ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
mkdir -p /opt/eduignite/backups /opt/eduignite/media /opt/eduignite/backend
systemctl enable --now docker >/dev/null 2>&1
docker compose version | head -1
R
    # Same code that is running now, copied from the old server. Keys, data and media are NOT part of this.
    on_new "rsync -az --exclude=media --exclude=backups --exclude=.env --exclude=scripts-migration -e '$ssh_inner' root@$OLD:/opt/eduignite/ /opt/eduignite/ && echo 'app files copied from the old server'"
    # Keep every deploy key that works on the old server working on the new one (the GitHub deploy key too).
    on_new "$ssh_inner root@$OLD 'cat /root/.ssh/authorized_keys' >> /root/.ssh/authorized_keys && sort -u -o /root/.ssh/authorized_keys /root/.ssh/authorized_keys && echo 'authorized keys merged'"
    push_scripts new ;;

  restore-new)
    push_scripts new
    bundle="$(on_old 'ls -1dt /opt/eduignite/backups/*/ | head -1' | tr -d '\r\n')"
    [ -n "$bundle" ] || { echo "no backup found on the old server; run backup-old first" >&2; exit 1; }
    name="$(basename "$bundle")"
    echo "latest backup: $name"
    on_new "mkdir -p /opt/eduignite/backups/$name && rsync -a -e '$ssh_inner' root@$OLD:${bundle%/}/ /opt/eduignite/backups/$name/ && scp -q -o StrictHostKeyChecking=accept-new root@$OLD:$PASS $PASS && chmod 600 $PASS && echo 'backup copied from old to new'"
    on_new "cd $APP && BACKUP_PASSPHRASE_FILE=$PASS bash scripts-migration/restore.sh /opt/eduignite/backups/$name/eduignite-backup-$name.tar.gpg"
    # Exact mirror of the current public media; the restored private files (_private) are kept.
    on_new "rsync -az --delete --exclude=_private -e '$ssh_inner' root@$OLD:/opt/eduignite/media/ /opt/eduignite/media/ && echo 'media in sync'" ;;

  start-new)
    on_new "cd $APP && docker compose -f docker-compose.prod.yml up -d --build web worker beat >/dev/null 2>&1; for i in \$(seq 1 40); do c=\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5000/api/v1/health/ 2>/dev/null || true); [ \"\$c\" != 000 ] && [ -n \"\$c\" ] && break; sleep 3; done; echo \"app answered with HTTP \$c\"; docker compose -f docker-compose.prod.yml ps --format '{{.Name}}: {{.State}}'" ;;

  test-new)
    code="$(curl --resolve "api.eduignite.online:443:$NEW" -sk -o /dev/null -m 20 -w '%{http_code}' https://api.eduignite.online/ || true)"
    echo "new server (through the proxy) answered with HTTP $code" ;;

  stop-old)
    on_old "cd $APP && docker compose -f docker-compose.prod.yml stop web worker beat && echo 'old app stopped (data untouched)'" ;;

  *) echo "unknown step: $STEP" >&2; exit 1 ;;
esac
