#!/usr/bin/env bash
# Private admission documents live in the web container at $PRIVATE_MEDIA_ROOT (default /app/private_media).
# That folder is NOT on a volume on the old server, so it is lost whenever the container is recreated.
# Run on the OLD server:   bash -s -- check   |   bash -s -- rescue      (see .github/workflows/migrate-server.yml)
# Output is short on purpose (public Actions log): counts and sizes only, never file names.
set -euo pipefail
cd /opt/eduignite/backend
dc() { docker compose -f docker-compose.prod.yml "$@" </dev/null; }
dir="$(dc exec -T web sh -c 'printf %s "${PRIVATE_MEDIA_ROOT:-/app/private_media}"')"
case "${1:-check}" in
  check)
    if dc exec -T web test -d "$dir"; then
      files="$(dc exec -T web sh -c "find '$dir' -type f | wc -l")"
      size="$(dc exec -T web sh -c "du -sh '$dir' | cut -f1")"
      echo "private folder: $dir   files: $files   size: $size"
      case "$dir" in
        /app/media*) echo "On a mounted volume: safe across redeploys." ;;
        *) echo "INSIDE THE CONTAINER, not on a volume: these files are lost if the container is recreated." ;;
      esac
    else
      echo "No private folder at $dir: nothing stored (or already lost)."
    fi ;;
  rescue)
    out="/opt/eduignite/backups/private-files-$(date -u +%Y%m%d-%H%M%S).tar.gz"
    dc exec -T web tar -C "$dir" -czf - . > "$out"
    chmod 600 "$out"
    echo "Saved $(stat -c %s "$out") bytes to $out on the old server (kept there; not printed or uploaded)." ;;
  *) echo "usage: check|rescue" >&2; exit 1 ;;
esac
