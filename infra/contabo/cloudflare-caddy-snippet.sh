#!/usr/bin/env bash
# Print the Caddy global-options block that makes Caddy trust Cloudflare and read the visitor's real IP.
# Without it every visitor looks like a Cloudflare address, which breaks per-IP rate limits and System Watch's
# login-attack detection. Run on the server (it fetches Cloudflare's official, current address lists):
#   bash cloudflare-caddy-snippet.sh
# Then put the block at the very top of /etc/caddy/Caddyfile (inside or merged with the existing `{ ... }` global block),
# run `caddy validate --config /etc/caddy/Caddyfile`, then `systemctl reload caddy`.
set -euo pipefail
ranges=$( (curl -fsSL https://www.cloudflare.com/ips-v4; echo; curl -fsSL https://www.cloudflare.com/ips-v6) | tr '\n' ' ' | sed 's/  */ /g')
[ -n "$ranges" ] || { echo "could not fetch Cloudflare ranges" >&2; exit 1; }
cat <<BLOCK
{
	servers {
		trusted_proxies static ${ranges}
		client_ip_headers CF-Connecting-IP X-Forwarded-For
	}
}
BLOCK
