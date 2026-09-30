/**
 * Photos of questions, prepared on the device before they are sent.
 *
 * A phone photo is often 3-8 MB, far more than the AI needs to read a page of
 * homework and more than a school's data bundle should carry. Each photo is
 * redrawn at a readable size and re-encoded as JPEG, which also drops the
 * location and camera details a photo carries.
 */

export const MAX_QUESTION_IMAGES = 3;
/** Long edge of the photo sent to the AI: enough to read small print. */
const SEND_EDGE = 1600;
/** Long edge of the copy kept in the conversation. */
const THUMB_EDGE = 320;
/** Keep all the photos of one question under the server's limit together. */
const MAX_SEND_BYTES = 900 * 1024;

export interface PreparedImage {
  /** What is sent to the AI. */
  dataUrl: string;
  /** A small copy for the conversation on screen. */
  thumb: string;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be opened as a picture."));
    };
    image.src = url;
  });
}

function draw(image: HTMLImageElement, edge: number, quality: number): string {
  const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This device cannot prepare the picture.");
  // White behind transparent PNGs, so a screenshot does not turn black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

function bytesOf(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((base64.length * 3) / 4);
}

export async function prepareQuestionImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a photo or a screenshot.");
  }
  const image = await loadImage(file);
  let edge = SEND_EDGE;
  let quality = 0.85;
  let dataUrl = draw(image, edge, quality);
  // Step down until it fits, keeping the text readable as long as possible.
  while (bytesOf(dataUrl) > MAX_SEND_BYTES && (quality > 0.55 || edge > 900)) {
    if (quality > 0.55) quality -= 0.1;
    else edge -= 200;
    dataUrl = draw(image, edge, quality);
  }
  return { dataUrl, thumb: draw(image, THUMB_EDGE, 0.7) };
}
