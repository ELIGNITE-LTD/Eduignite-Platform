#!/usr/bin/env bash
# Withdraw a bad build: mark it withdrawn in the manifest, point the latest alias
# (and, for desktop, the auto-update feed) back at the newest remaining good build.
#
#   withdraw.sh <mobile|desktop> <version>
#
# Env: VPS_HOST, VPS_USER, SSH key at ~/.ssh/id_deploy. Prints "<version> <file>" of the new latest.
# The files stay on disk (they are pruned by the normal newest-3 rule), so a withdrawal is reversible
# by re-running a publish; installed copies are untouched.
set -euo pipefail

APP="${1:?app (mobile|desktop)}"
VERSION="${2:?version}"
DL="${DL:-/opt/eduignite/downloads}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST="${VPS_USER:?}@${VPS_HOST:?}"
SSH_OPTS=(-i "$HOME/.ssh/id_deploy" -o IdentitiesOnly=yes)
SSH=(ssh "${SSH_OPTS[@]}" "$HOST")
SCP=(scp "${SSH_OPTS[@]}")

case "$APP" in
  mobile)  ALIAS="eduignite-mobile.apk" ;;
  desktop) ALIAS="eduignite-desktop-setup.exe" ;;
  *) echo "unknown app: $APP" >&2; exit 2 ;;
esac

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
"${SCP[@]}" "$HOST:$DL/releases-$APP.json" "$WORK/current.json"
node "$HERE/manifest.mjs" withdraw --manifest "$WORK/current.json" --version "$VERSION" --out "$WORK/new.json"
read -r NEW_VERSION NEW_FILE < <(node "$HERE/manifest.mjs" latest --manifest "$WORK/new.json" || true) || true

"${SSH[@]}" "mkdir -p '$DL/.incoming'"
if [ -n "${NEW_FILE:-}" ]; then
  "${SSH[@]}" "set -e; cd '$DL'; test -f '$APP/$NEW_FILE'; \
    ln -f '$APP/$NEW_FILE' '.alias-$APP.tmp' 2>/dev/null || cp '$APP/$NEW_FILE' '.alias-$APP.tmp'; \
    mv -f '.alias-$APP.tmp' '$ALIAS'; \
    if [ '$APP' = desktop ] && [ -f '$APP/latest-$NEW_VERSION.yml' ]; then cp '$APP/latest-$NEW_VERSION.yml' 'updates/desktop/latest.yml'; fi"
else
  echo "warning: no good build remains; the alias still points at the withdrawn file. Remove it by hand if needed." >&2
fi
"${SCP[@]}" "$WORK/new.json" "$HOST:$DL/.incoming/releases-$APP.json.part"
"${SSH[@]}" "chmod 644 '$DL/.incoming/releases-$APP.json.part'; mv -f '$DL/.incoming/releases-$APP.json.part' '$DL/releases-$APP.json'"
echo "withdrawn $APP $VERSION; latest is now ${NEW_VERSION:-none} ${NEW_FILE:-}"
