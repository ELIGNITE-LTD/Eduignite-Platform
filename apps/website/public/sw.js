/**
 * Makes the website itself open with no connection.
 *
 * The mobile and desktop apps already carry their own files, so they start
 * offline whatever the network is doing. The website is fetched from a server,
 * and without this it would show the browser's dinosaur instead of the work
 * saved on the device.
 *
 * What this does NOT do is cache the API. Data is handled by the app's own
 * store, which knows what is safe to keep, how old it is and what is still
 * waiting to be sent. A service worker quietly answering an API call from a
 * stale copy would undo that, and could show a payment as unrecorded when the
 * device is holding it.
 */

/**
 * Cache policy (read before changing):
 *  - Bump VERSION whenever a cached shell could be wrong. The activate step
 *    deletes every cache that is not the current version, so a bad cache can
 *    never outlive the fix.
 *  - install calls skipWaiting() and activate calls clients.claim(): a fixed
 *    worker takes over open tabs immediately instead of waiting for every tab
 *    to close.
 *  - Only successful (2xx) responses are ever stored. A 502/503/404 page served
 *    during an outage must never be kept and replayed as the "offline" page.
 *  - API calls (/api/...) and anything cross-origin are never intercepted, so
 *    sign-in, refresh and /me always go straight to the network.
 *  - v2: purge v1 caches, which could hold an error page cached by mistake.
 */
const VERSION = "v2";
const SHELL_CACHE = `eduignite-shell-${VERSION}`;
const PAGE_CACHE = `eduignite-pages-${VERSION}`;

/** The page shown when a page is asked for that was never visited. */
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== SHELL_CACHE && name !== PAGE_CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/") || url.pathname.includes("/api/v1/");
}

/** Build output is content hashed, so a cached copy is never the wrong one. */
function isBuildAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fonts/");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isApiRequest(url)) return;

  if (isBuildAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    // The network first, so a page is never stale while there is a
    // connection; the last copy of that page when there is not.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match(OFFLINE_URL))
            .then((cached) => cached || Response.error()),
        ),
    );
  }
});
