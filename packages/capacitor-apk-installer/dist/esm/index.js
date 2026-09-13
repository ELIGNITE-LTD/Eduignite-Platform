import { registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

// Android-only native plugin (see ../android/src/main/java/online/eduignite/apkinstaller/ApkInstallerPlugin.java).
// No web implementation is registered: Capacitor's registerPlugin() falls
// back to rejecting any call with "not implemented" on web/iOS, which is
// the correct behaviour here -- this plugin only ever makes sense on
// Android (see apps/mobile and apps/offline-companion's own
// android-only in-app-update flow).
export const ApkInstaller = registerPlugin('ApkInstaller');

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // readAsDataURL() result is "data:<mime>;base64,<data>" -- Filesystem.writeFile wants just <data>.
      const result = String(reader.result || '');
      resolve(result.substring(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read the downloaded file'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Downloads `url` into this app's cache directory and returns a URI
 * `ApkInstaller.install()` can consume. Shared by apps/mobile and
 * apps/offline-companion so the two in-app update flows can't drift.
 *
 * `onProgress` (0-100) fires from real byte counts when the response
 * supports streaming (a plain fetch() does); when it doesn't -- notably
 * Capacitor's own CapacitorHttp fetch() shim, which both apps enable
 * globally for CORS and which buffers the whole response before handing it
 * back -- this falls back to reporting 0 then 100 so callers can still show
 * an indeterminate "downloading" state without crashing on a missing
 * `content-length`/stream.
 */
export async function downloadApkToCache(url, fileName, onProgress) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }

  const total = Number(response.headers.get('content-length')) || 0;
  let blob;
  if (response.body && typeof response.body.getReader === 'function' && total > 0) {
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        if (onProgress) onProgress(Math.min(100, (received / total) * 100));
      }
    }
    blob = new Blob(chunks);
  } else {
    if (onProgress) onProgress(0);
    blob = await response.blob();
  }

  const base64 = await blobToBase64(blob);
  await Filesystem.writeFile({ path: fileName, directory: Directory.Cache, data: base64 });
  if (onProgress) onProgress(100);

  const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
  return uri;
}
