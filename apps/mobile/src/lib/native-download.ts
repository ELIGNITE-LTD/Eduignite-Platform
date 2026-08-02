import { Capacitor } from "@capacitor/core";

/**
 * Native file saving for the Capacitor (Android/iOS) build.
 *
 * In a WebView, the browser's normal "download" (an <a download> or a jsPDF
 * doc.save()) does nothing useful — nothing lands on the device. This module
 * writes the file into a dedicated, user-visible "eduignite" folder inside the
 * device Documents directory using @capacitor/filesystem.
 */

export const EDUIGNITE_FOLDER = "eduignite";

export function isNativeApp(): boolean {
  try {
    return Capacitor?.isNativePlatform?.() ?? false;
  } catch {
    return false;
  }
}

function sanitizeFileName(name: string): string {
  const cleaned = (name || "")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || `eduignite-${Date.now()}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file data."));
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

function parseDataUrl(dataUrl: string): { base64: string; mime: string } {
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!match) return { base64: "", mime: "application/octet-stream" };
  const mime = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";
  if (isBase64) return { base64: payload, mime };
  // Plain (URL-encoded) data URL -> base64.
  const text = decodeURIComponent(payload);
  const base64 = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(text))) : "";
  return { base64, mime };
}

async function resolveBase64(source: {
  url?: string;
  base64?: string;
  mimeType?: string;
}): Promise<{ base64: string; mime: string }> {
  if (source.base64) {
    return { base64: source.base64, mime: source.mimeType || "application/octet-stream" };
  }
  const url = source.url || "";
  if (url.startsWith("data:")) {
    const parsed = parseDataUrl(url);
    return { base64: parsed.base64, mime: source.mimeType || parsed.mime };
  }
  // blob: URLs and remote/http(s) URLs — fetch then encode.
  const res = await fetch(url);
  const blob = await res.blob();
  const base64 = await blobToBase64(blob);
  return { base64, mime: source.mimeType || blob.type || "application/octet-stream" };
}

/**
 * Save a file into the device's Documents/eduignite folder.
 * Returns the platform file URI on success.
 */
// Map a content type to the file extension it should be saved with, so a PDF
// is saved as a .pdf document (openable in a PDF viewer) rather than a raw or
// image file.
const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/zip": "zip",
};

function withCorrectExtension(name: string, mime?: string): string {
  const ext = MIME_TO_EXT[(mime || "").split(";")[0].trim().toLowerCase()];
  if (!ext) return name;
  if (new RegExp(`\\.${ext}$`, "i").test(name)) return name; // already correct
  // Replace a wrong/mismatched extension, or append if there is none.
  if (/\.[a-z0-9]{1,5}$/i.test(name)) return name.replace(/\.[a-z0-9]{1,5}$/i, `.${ext}`);
  return `${name}.${ext}`;
}

// Pictures go in eduignite/Pictures, everything else (PDF, docs, csv, ...) in
// eduignite/Documents — so images and documents are never mixed together.
export const EDUIGNITE_PICTURES = "Pictures";
export const EDUIGNITE_DOCUMENTS = "Documents";
function subFolderForMime(mime?: string): string {
  return (mime || "").toLowerCase().startsWith("image/") ? EDUIGNITE_PICTURES : EDUIGNITE_DOCUMENTS;
}

export async function saveToEduignite(opts: {
  fileName: string;
  url?: string;
  base64?: string;
  mimeType?: string;
}): Promise<string> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { base64, mime } = await resolveBase64(opts);
  if (!base64) throw new Error("There was no file data to save.");

  // On older Android the public storage folders need a grant. Ask for it
  // best-effort; on Android 13+ this is a no-op and always resolves.
  try {
    const status = await Filesystem.checkPermissions();
    if (status.publicStorage !== "granted") {
      await Filesystem.requestPermissions();
    }
  } catch {
    /* permission API not available on this platform — continue */
  }

  // Save with the extension the real content type implies, so a PDF lands as a
  // .pdf document (not an image), and route it into the matching subfolder.
  const effectiveMime = opts.mimeType || mime;
  const finalName = withCorrectExtension(sanitizeFileName(opts.fileName), effectiveMime);
  const path = `${EDUIGNITE_FOLDER}/${subFolderForMime(effectiveMime)}/${finalName}`;

  // Prefer the shared external-storage root so the "eduignite" folder sits next
  // to the user's other files (visible in any file manager / gallery); fall back
  // to the app Documents directory if the platform blocks the shared root.
  const targets = [Directory.ExternalStorage, Directory.Documents];
  let lastError: unknown;
  for (const directory of targets) {
    try {
      const result = await Filesystem.writeFile({ path, data: base64, directory, recursive: true });
      return result.uri;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not save the file to your device.");
}


/**
 * Save a remote or generated file to the eduignite folder on the native app,
 * or open it in the browser on the web.
 *
 * Used for files the user "opens" from the app — a course material, a library
 * book, a generated PDF — so that on the phone they land in the eduignite
 * folder (Pictures for images, Documents for everything else) rather than
 * opening in a viewer that never saves them.
 */
export async function saveOrOpenUrl(
  url: string,
  fileName: string,
  mimeType?: string,
): Promise<void> {
  if (!url) return;
  if (isNativeApp()) {
    await saveToEduignite({ url, fileName, mimeType });
    return;
  }
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * Save a generated jsPDF document to the eduignite folder on native, or run the
 * normal browser download on the web. The single place every PDF export should
 * go through, so a document saved anywhere in the app lands in the same folder.
 */
export async function savePdfDoc(doc: any, fileName: string): Promise<void> {
  const name = /\.pdf$/i.test(fileName) ? fileName : `${fileName}.pdf`;
  if (isNativeApp()) {
    try {
      const base64 = String(doc.output("datauristring")).split(",")[1] || "";
      await saveToEduignite({ fileName: name, base64, mimeType: "application/pdf" });
      return;
    } catch {
      /* fall through to the browser save */
    }
  }
  doc.save(name);
}
