/**
 * Shrink a picture in the browser before it is uploaded, so school websites stay light on slow
 * mobile connections. Keeps transparency (WebP), never enlarges, and never fails the upload:
 * any problem, or a result that is not smaller, returns the original file.
 */

/** Longest edge after shrinking, and the target format. Pure, so it can be unit tested. */
export function targetSize(width: number, height: number, maxEdge = 800): { width: number; height: number; scaled: boolean } {
  const longest = Math.max(width, height);
  if (!longest || longest <= maxEdge) return { width, height, scaled: false };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scaled: true };
}

export async function compressImage(file: File, maxEdge = 800, quality = 0.85): Promise<File> {
  try {
    if (typeof document === "undefined" || !file.type.startsWith("image/") || file.type === "image/svg+xml" || file.type === "image/gif") return file;
    const url = URL.createObjectURL(file);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("unreadable"));
      img.src = url;
    }).finally(() => URL.revokeObjectURL(url));
    const size = targetSize(image.naturalWidth, image.naturalHeight, maxEdge);
    if (!size.scaled && file.size < 150 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, size.width, size.height);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (!blob || blob.type !== "image/webp" || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
    return new File([blob], name, { type: "image/webp" });
  } catch {
    return file;
  }
}
