"""Serving an app screen into a sandboxed frame.

Two responses live here:

``frame``   the HTML document the iframe loads. It carries the bridge shim and
            a script tag for the app's bundle, under a Content-Security-Policy
            that gives the document **no network access whatsoever**.
``asset``   a file out of the package — the bundle itself, images, styles.

The security story, in order of what it buys:

* the iframe is rendered with ``sandbox="allow-scripts"`` and *not*
  ``allow-same-origin``, so the document runs in an opaque origin: it cannot
  read EduIgnite's cookies, localStorage or DOM, and it has no session;
* ``connect-src 'none'`` means app UI cannot fetch, XHR or open a socket. It
  has no way to reach the API even if it wanted to, and no way to send what it
  sees anywhere;
* everything the app needs therefore goes through ``postMessage`` to the host,
  which makes the real request with its own session and its own permission
  checks.

The frame is served without the caller's session on purpose: it is a static
shell, and nothing in it should depend on who is looking at it. Identity
arrives from the host, over the bridge, after the frame has loaded.
"""

import mimetypes
import posixpath
import zipfile

from django.http import Http404, HttpResponse
from django.views.decorators.clickjacking import xframe_options_exempt
from django.utils.decorators import method_decorator
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from .build_models import AppPackage
from .storage import PackageUnavailable, local_package_path

#: What the frame document may do. Deliberately close to nothing.
FRAME_CSP = (
    "default-src 'none'; "
    "script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; "
    "font-src 'self' data:; "
    "connect-src 'none'; "
    "form-action 'none'; "
    "base-uri 'none'; "
    "frame-ancestors 'self'"
)

#: The shim the app talks to. Kept small and readable: it is the entire
#: contract between an app and the platform on the client side.
BRIDGE_SHIM = """
(function () {
  var pending = {};
  var seq = 0;
  var ready = false;
  var queue = [];
  var listeners = { init: [], theme: [] };

  function post(message) {
    parent.postMessage(Object.assign({ __eduignite: 1 }, message), '*');
  }

  function request(type, payload) {
    return new Promise(function (resolve, reject) {
      var id = 'r' + (++seq);
      pending[id] = { resolve: resolve, reject: reject };
      var message = { id: id, type: type, payload: payload || {} };
      if (ready) post(message); else queue.push(message);
    });
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.__eduignite !== 1) return;

    if (data.type === 'init') {
      ready = true;
      bridge.context = data.payload || {};
      queue.splice(0).forEach(post);
      listeners.init.forEach(function (fn) { fn(bridge.context); });
      return;
    }
    if (data.type === 'theme') {
      bridge.theme = data.payload || {};
      listeners.theme.forEach(function (fn) { fn(bridge.theme); });
      return;
    }
    var entry = pending[data.id];
    if (!entry) return;
    delete pending[data.id];
    if (data.ok) entry.resolve(data.value);
    else entry.reject(new Error(data.error || 'Request failed'));
  });

  var bridge = {
    context: {},
    theme: {},
    on: function (name, fn) { (listeners[name] || []).push(fn); },
    data: {
      query: function (c, o) { return request('data.query', { collection: c, ...(o || {}) }); },
      get: function (c, id) { return request('data.get', { collection: c, id: id }); },
      count: function (c, o) { return request('data.count', { collection: c, ...(o || {}) }); },
      insert: function (c, v) { return request('data.insert', { collection: c, values: v }); },
      update: function (c, id, v) { return request('data.update', { collection: c, id: id, values: v }); },
      remove: function (c, id) { return request('data.delete', { collection: c, id: id }); }
    },
    core: {
      students: function (o) { return request('core.students', o || {}); },
      staff: function (o) { return request('core.staff', o || {}); },
      classes: function () { return request('core.classes', {}); }
    },
    call: function (handler, args) { return request('call', { handler: handler, args: args || {} }); },
    ui: {
      toast: function (text) { return request('ui.toast', { text: String(text) }); },
      resize: function (height) { post({ type: 'ui.resize', payload: { height: height } }); }
    }
  };

  // Height is reported continuously so the host can size the frame to the
  // content; a fixed-height frame with an inner scrollbar reads as an
  // embedded stranger rather than part of the page.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(function () {
      bridge.ui.resize(document.documentElement.scrollHeight);
    }).observe(document.documentElement);
  }

  window.eduignite = bridge;
  post({ type: 'hello' });
})();
"""


def _open_package(app_key: str, version: str | None):
    package = (
        AppPackage.objects.select_related('live_build').filter(key=app_key).first()
    )
    if package is None or package.live_build is None:
        raise Http404('No such app.')

    build = package.live_build
    if version:
        from .build_models import AppBuild

        candidate = AppBuild.objects.filter(package=package, version=version).first()
        if candidate is not None and candidate.is_runnable:
            build = candidate

    if not build.is_runnable:
        raise Http404('App is not available.')
    return build


def _safe_member(path: str) -> str:
    if path.startswith('/') or '\\' in path:
        raise Http404('Bad path.')
    normalised = posixpath.normpath(path)
    if normalised.startswith('..') or '/../' in f'/{normalised}':
        raise Http404('Bad path.')
    if not (normalised.startswith('web/') or normalised.startswith('assets/')):
        raise Http404('Only web/ and assets/ are served.')
    return normalised


@method_decorator(xframe_options_exempt, name='dispatch')
class AppFrameView(APIView):
    """
    GET /registry/apps/<app_key>/frame/<screen_id>/
    The HTML shell an app screen runs inside.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request, app_key, screen_id):
        build = _open_package(app_key, request.GET.get('version'))
        manifest = build.manifest or {}

        screen = next(
            (
                s for s in manifest.get('screens') or []
                if isinstance(s, dict) and s.get('id') == screen_id
            ),
            None,
        )
        if screen is None:
            raise Http404('No such screen.')

        entry = screen.get('entry') or ''
        _safe_member(entry)
        bundle_url = (
            f'/api/v1/registry/apps/{app_key}/asset/{entry}?version={build.version}'
        )

        document = (
            '<!doctype html><html><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">'
            '<style>'
            'html,body{margin:0;padding:0;background:transparent;'
            "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;}"
            '</style>'
            f'<script>{BRIDGE_SHIM}</script>'
            '</head><body><div id="root"></div>'
            f'<script type="module" src="{bundle_url}"></script>'
            '</body></html>'
        )

        response = HttpResponse(document, content_type='text/html; charset=utf-8')
        response['Content-Security-Policy'] = FRAME_CSP
        response['X-Content-Type-Options'] = 'nosniff'
        # A screen shell is per build, not per person, so it caches well and
        # a new version busts it by URL.
        response['Cache-Control'] = 'private, max-age=300'
        return response


class AppAssetView(APIView):
    """
    GET /registry/apps/<app_key>/asset/<path>
    A file out of the package: the bundle, an image, a stylesheet.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request, app_key, path):
        build = _open_package(app_key, request.GET.get('version'))
        member = _safe_member(path)

        try:
            path = local_package_path(build)
            with open(path, 'rb') as package:
                with zipfile.ZipFile(package) as archive:
                    try:
                        payload = archive.read(member)
                    except KeyError:
                        raise Http404('No such file in this app.')
        except (OSError, zipfile.BadZipFile, PackageUnavailable):
            raise Http404('App package could not be read.')

        content_type, _ = mimetypes.guess_type(member)
        if member.endswith('.js'):
            content_type = 'text/javascript'
        response = HttpResponse(payload, content_type=content_type or 'application/octet-stream')
        response['X-Content-Type-Options'] = 'nosniff'
        response['Cache-Control'] = 'public, max-age=31536000, immutable'
        # Serving app-authored files: never let a browser sniff one into
        # something executable in our own origin.
        response['Content-Security-Policy'] = "default-src 'none'; sandbox"
        return response
