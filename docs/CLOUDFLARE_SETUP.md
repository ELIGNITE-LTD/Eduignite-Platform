# Cloudflare in front of EduIgnite (free plan)

Why: visitors in Cameroon connect to a nearby Cloudflare data centre instead of crossing to Europe for every file, static files are cached close to them, and the server is shielded from junk traffic. Cost: nothing.

Do this while moving servers (see `SERVER_MIGRATION.md`), after the new server passes `verify` and before the DNS cutover, because the nameserver change is the same moment.

## 1. Add the site

1. Create a free account at https://dash.cloudflare.com and choose **Add a site**: `eduignite.online`, plan **Free**.
2. Cloudflare reads the existing DNS records. Check that every record is there (A for `@`, `www`, `api`, MX, TXT for email: SPF, DKIM, DMARC for Brevo). Missing email records break email, so compare with the current DNS before continuing.
3. Lower the TTL of the current records to 300 s a day ahead (the migration doc says why).
4. At the domain registrar, replace the nameservers with the two Cloudflare gives you. This is the only step that cannot be done by Claude. Propagation takes minutes to hours.

## 2. DNS records (point them at the NEW server when you cut over)

| Name | Type | Value | Proxy |
|---|---|---|---|
| `@` (eduignite.online) | A | new server IP | **Proxied** (orange) |
| `www` | A or CNAME | same | **Proxied** |
| `api` | A | new server IP | **Proxied after step 6; DNS only (grey) until then** |
| Mail records (MX, SPF, DKIM, DMARC) | as they are | | **DNS only** (mail is never proxied) |

## 3. SSL/TLS

- Mode **Full (strict)** once Caddy has its certificates (about a minute after DNS points to the new server). Use **Full** (not strict) during the switch so nothing breaks while Caddy fetches them. Never use "Flexible": it causes redirect loops.
- Turn on **Always Use HTTPS** and **Automatic HTTPS Rewrites**.
- Under Network: **HTTP/3** on, **WebSockets** on.

## 4. Speed settings

- Speed > Optimization: **Brotli** on. Leave **Rocket Loader** off (it can break the Next.js scripts). Leave **Auto Minify** off.
- Caching > Configuration: **Browser Cache TTL** = Respect Existing Headers.

## 5. Cache rules (Rules > Cache Rules). Order matters.

1. **Bypass the API:** if URL path starts with `/api/` or hostname is `api.eduignite.online` then **Bypass cache**. Responses hold private school data and must never be cached.
2. **Cache website files:** if URL path starts with `/_next/static/` then **Eligible for cache**, Edge TTL 1 year (these file names change with every build).
3. **Cache uploaded public images:** if URL path starts with `/media/` then **Eligible for cache**, Edge TTL 7 days. (Private admission documents are not served from `/media/`: they are streamed by the API.)
4. Leave everything else on the default (HTML pages are not cached).

## 6. The API subdomain: check before proxying

Cloudflare cuts a request that takes longer than **100 seconds** (error 524) and rejects request bodies over **100 MB** on the free plan. The app's AI marking and mark-sheet scans should finish well inside that, but check once: run an AI marking of a few scripts and a scan upload with `api` proxied. If either fails with 524 or 413, set the `api` record back to **DNS only** (grey cloud). The website still gets the benefit, and the API simply connects directly.

## 7. The server must see the real visitor address

Behind Cloudflare, every request arrives from a Cloudflare address. EduIgnite uses the visitor address for rate limits and for System Watch's login-attack detection, so without this step those would treat all visitors as one.

On the new server:

```bash
bash cloudflare-caddy-snippet.sh        # infra/contabo/cloudflare-caddy-snippet.sh; prints a block with Cloudflare's current ranges
```

Put the printed block at the top of `/etc/caddy/Caddyfile` (merge it with an existing `{ ... }` block if there is one), then:

```bash
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
```

Check it worked: in System Watch, a failed login from your own phone should be recorded against your own address, not a Cloudflare one (Cloudflare ranges start with 104., 172.64., 162.158., 108.162., and similar).

Cloudflare changes its ranges rarely; re-run the script and reload every few months.

## 8. Optional, later

- Restrict ports 80/443 on the server's firewall to Cloudflare's ranges so nobody can bypass Cloudflare by using the server IP.
- Turn on **Bot Fight Mode** (Security > Bots) once everything works.
- Page Rules / Rate Limiting for `/api/v1/auth/login/` (the free plan allows one rate-limit rule).
