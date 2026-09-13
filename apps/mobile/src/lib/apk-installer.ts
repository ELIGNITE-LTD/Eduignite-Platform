import { registerPlugin } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";

/**
 * JS binding for the native plugin in packages/capacitor-apk-installer
 * (android/src/main/java/online/eduignite/apkinstaller/ApkInstallerPlugin.java).
 * `cap sync` discovers and links that package's native android/ module via
 * its package.json's `capacitor.android.src` field -- but this binding
 * itself lives here, in the app's own src/lib, rather than in that shared
 * package: a JS file at the shared package's own (symlinked-from) path
 * can't resolve `@capacitor/core`, since that only exists inside this
 * app's node_modules, not the shared package's. See
 * apps/offline-companion/src/lib/apk-installer.ts for the identical copy
 * used there.
 */
export interface CanInstallResult {
  /** Whether this app currently has the OS's "install unknown apps" permission. Always `false` on iOS/web (never used there). */
  value: boolean;
}

export interface ApkInstallerPlugin {
  canInstall(): Promise<CanInstallResult>;
  openInstallPermissionSettings(): Promise<void>;
  install(options: { path: string }): Promise<void>;
}

export const ApkInstaller = registerPlugin<ApkInstallerPlugin>("ApkInstaller");

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      resolve(result.substring(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read the downloaded file"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Downloads `url` into this app's cache directory (as `fileName`) and
 * resolves to a URI usable with `ApkInstaller.install()`. `onProgress`
 * receives 0-100; it may only ever report 0 then 100 when the response
 * doesn't support streamed reads -- notably Capacitor's own CapacitorHttp
 * fetch() shim (enabled globally in capacitor.config.ts for CORS), which
 * buffers the whole response before handing it back.
 */
export async function downloadApkToCache(
  url: string,
  fileName: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }

  const total = Number(response.headers.get("content-length")) || 0;
  let blob: Blob;
  if (response.body && typeof response.body.getReader === "function" && total > 0) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        onProgress?.(Math.min(100, (received / total) * 100));
      }
    }
    // Cast needed because @types/node's ambient Uint8Array (buffer:
    // ArrayBufferLike, which includes SharedArrayBuffer) conflicts with
    // lib.dom's stricter BlobPart (ArrayBufferView<ArrayBuffer>) -- a
    // typing mismatch only, not a runtime one; `value` here always comes
    // from a real fetch() ReadableStream, never a SharedArrayBuffer.
    blob = new Blob(chunks as BlobPart[]);
  } else {
    onProgress?.(0);
    blob = await response.blob();
  }

  const base64 = await blobToBase64(blob);
  await Filesystem.writeFile({ path: fileName, directory: Directory.Cache, data: base64 });
  onProgress?.(100);

  const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
  return uri;
}
