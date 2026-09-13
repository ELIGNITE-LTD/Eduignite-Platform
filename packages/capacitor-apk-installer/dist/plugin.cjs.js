'use strict';

const { registerPlugin } = require('@capacitor/core');
const { Filesystem, Directory } = require('@capacitor/filesystem');

const ApkInstaller = registerPlugin('ApkInstaller');

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      resolve(result.substring(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read the downloaded file'));
    reader.readAsDataURL(blob);
  });
}

async function downloadApkToCache(url, fileName, onProgress) {
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

exports.ApkInstaller = ApkInstaller;
exports.downloadApkToCache = downloadApkToCache;
