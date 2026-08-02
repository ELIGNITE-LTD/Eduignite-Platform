import { getApiErrorMessage } from "@/lib/api/errors";

export const MAX_IMAGE_UPLOAD_BYTES = 6 * 1024 * 1024;
export const MAX_IMAGE_UPLOAD_LABEL = "6MB";

const BASE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
const SVG_IMAGE_TYPE = "image/svg+xml";

export function validateImageFile(file: File, label = "image", allowSvg = false): string | null {
  const allowedTypes = allowSvg ? [...BASE_IMAGE_TYPES, SVG_IMAGE_TYPE] : [...BASE_IMAGE_TYPES];
  const typeLabel = allowSvg ? "JPG, PNG, GIF, WebP, or SVG" : "JPG, PNG, GIF, or WebP";

  if (!allowedTypes.includes(file.type as (typeof allowedTypes)[number])) {
    return `Unsupported ${label} type. Please upload ${typeLabel}.`;
  }

  if (file.size <= 0) {
    return `The selected ${label} appears to be empty. Please choose a valid image under ${MAX_IMAGE_UPLOAD_LABEL}.`;
  }

  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return `This ${label} is too large. Maximum upload size is ${MAX_IMAGE_UPLOAD_LABEL}.`;
  }

  return null;
}

export function getUploadErrorMessage(error: unknown, label = "image") {
  const maybeNetworkError = error as { code?: string; response?: unknown; message?: string };
  if (maybeNetworkError?.code === "ERR_NETWORK" || (!maybeNetworkError?.response && maybeNetworkError?.message?.toLowerCase().includes("network"))) {
    return `You appear to be offline. Please try uploading the ${label} again once your connection is back.`;
  }

  return getApiErrorMessage(
    error,
    `The ${label} could not be uploaded. Check your connection and try again with a valid image under ${MAX_IMAGE_UPLOAD_LABEL}.`
  );
}
