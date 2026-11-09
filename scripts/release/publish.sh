#!/usr/bin/env bash
# Publish one built installer to the download host (VPS) and update its manifest.
# Runs on the GitHub Actions runner AFTER the build succeeded.
#
#   publish.sh <mobile|desktop> <artifact> [extra-file ...]
#
# Env (set by the workflow): VPS_HOST, VPS_USER, APP_VERSION, APP_VERSION_CODE,
#   GITHUB_SHA, and an SSH key at ~/.ssh/id_deploy.
# Layout on the VPS ($DL, default /opt/eduignite/downloads, served by Caddy at /downloads/):
#   <app>/<artifact>              versioned file (newest 3 kept)
#   <alias>                       latest alias (hard link) - the long-standing stable URL
#   releases-<app>.json           manifest the website reads
# Everything lands in $DL/.incoming first and is moved with rename(2), so a visitor
# never sees a half-uploaded file or a half-written manifest.
set -euo pipefail

APP="${1:?app (mobile|desktop)}"
ARTIFACT="${2:?artifact path}"
DL="${DL:-/opt/eduignite/downloads}"
BASE_URL="${BASE_URL:-https://eduignite.online/downloads}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST="${VPS_USER:?}@${VPS_HOST:?}"
SSH_OPTS=(-i "$HOME/.ssh/id_deploy" -o IdentitiesOnly=yes)
SSH=(ssh "${SSH_OPTS[@]}" "$HOST")
SCP=(scp "${SSH_OPTS[@]}")

case "$APP" in
  mobile)  ALIAS="eduignite-mobile.apk";        MIN_OS="Android 7.0"; PATHS="apps/mobile release scripts/release" ;;
  desktop) ALIAS="eduignite-desktop-setup.exe"; MIN_OS="Windows 10 (64-bit)"; PATHS="apps/desktop release scripts/release" ;;
  *) echo "unknown app: $APP" >&2; exit 2 ;;
esac

[ -s "$ARTIFACT" ] || { echo "artifact missing or empty: $ARTIFACT" >&2; exit 1; }
NAME="$(basename "$ARTIFACT")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 1. current manifest (absent on the very first release)
if "${SSH[@]}" "test -f '$DL/releases-$APP.json'"; then
  "${SCP[@]}" "$HOST:$DL/releases-$APP.json" "$WORK/current.json"
else
  echo '{}' > "$WORK/current.json"
fi

# 2. release notes = merged PR titles since the previous release
LAST_SHA="$(node "$HERE/manifest.mjs" last-sha --manifest "$WORK/current.json")"
node "$HERE/manifest.mjs" notes --from-sha "$LAST_SHA" --paths "$PATHS" > "$WORK/notes.json"

# 3. new manifest
node "$HERE/manifest.mjs" add --manifest "$WORK/current.json" --app "$APP" --file "$ARTIFACT" \
  --version "$APP_VERSION" --version-code "${APP_VERSION_CODE:-}" --sha "${GITHUB_SHA:-}" \
  --built-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --min-os "$MIN_OS" --notes-file "$WORK/notes.json" \
  --base-url "$BASE_URL" --out "$WORK/new.json" --removed-out "$WORK/removed.txt"
LOCAL_SHA="$(sha256sum "$ARTIFACT" | cut -d' ' -f1)"

# 4. upload to a temp name, verify the checksum on the server, then rename into place
"${SSH[@]}" "mkdir -p '$DL/.incoming' '$DL/$APP'"
"${SCP[@]}" "$ARTIFACT" "$HOST:$DL/.incoming/$APP-$NAME.part"
"${SSH[@]}" "set -e; cd '$DL'; \
  [ \"\$(sha256sum '.incoming/$APP-$NAME.part' | cut -d' ' -f1)\" = '$LOCAL_SHA' ] || { echo 'checksum mismatch after upload' >&2; rm -f '.incoming/$APP-$NAME.part'; exit 1; }; \
  chmod 644 '.incoming/$APP-$NAME.part'; \
  mv -f '.incoming/$APP-$NAME.part' '$APP/$NAME'; \
  echo '$LOCAL_SHA  $NAME' > '$APP/$NAME.sha256'; \
  ln -f '$APP/$NAME' '.alias-$APP.tmp' 2>/dev/null || cp '$APP/$NAME' '.alias-$APP.tmp'; \
  mv -f '.alias-$APP.tmp' '$ALIAS'"

# 5. extra files for the desktop auto-update feed (electron-updater, generic provider)
if [ "$APP" = "desktop" ] && [ "$#" -gt 2 ]; then
  shift 2
  # the feed's installer is the same bytes as the versioned download: hard link, no second upload
  "${SSH[@]}" "mkdir -p '$DL/updates/desktop'; ln -f '$DL/$APP/$NAME' '$DL/updates/desktop/$NAME' 2>/dev/null || cp '$DL/$APP/$NAME' '$DL/updates/desktop/$NAME'"
  for f in "$@"; do
    b="$(basename "$f")"
    "${SCP[@]}" "$f" "$HOST:$DL/.incoming/$b.part"
    "${SSH[@]}" "chmod 644 '$DL/.incoming/$b.part'"
    if [ "$b" = "latest.yml" ]; then
      # keep a per-version copy so a rollback can restore the previous feed
      "${SSH[@]}" "cp '$DL/.incoming/$b.part' '$DL/$APP/latest-$APP_VERSION.yml'; mv -f '$DL/.incoming/$b.part' '$DL/updates/desktop/$b'"
    else
      "${SSH[@]}" "mv -f '$DL/.incoming/$b.part' '$DL/updates/desktop/$b'"
    fi
  done
fi

# 6. manifest last (so the website never advertises a file that is not there yet)
"${SCP[@]}" "$WORK/new.json" "$HOST:$DL/.incoming/releases-$APP.json.part"
"${SSH[@]}" "chmod 644 '$DL/.incoming/releases-$APP.json.part'; mv -f '$DL/.incoming/releases-$APP.json.part' '$DL/releases-$APP.json'"

# 7. prune builds that fell out of the newest-3 window
while IFS= read -r old; do
  [ -n "$old" ] || continue
  case "$old" in */*|*..*) echo "refusing to delete odd name: $old" >&2; continue ;; esac
  "${SSH[@]}" "rm -f '$DL/$APP/$old' '$DL/$APP/$old.sha256' '$DL/updates/desktop/$old'"
done < "$WORK/removed.txt"

echo "published $APP $APP_VERSION ($NAME, sha256 $LOCAL_SHA)"
# one-line release notes for the backend app-versions record (read by the workflow)
if [ -n "${RELEASE_NOTES_OUT:-}" ]; then
  node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).join("; "))' "$WORK/notes.json" > "$RELEASE_NOTES_OUT"
fi
