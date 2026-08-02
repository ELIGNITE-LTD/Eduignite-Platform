"use client";

import { useEffect } from "react";
import { isNativeApp, saveToEduignite } from "@/lib/native-download";
import { useToast } from "@/hooks/use-toast";

/**
 * On the native (Capacitor) build, browser downloads don't reach the device.
 * This bridge intercepts every download-style anchor click — <a download>,
 * data:/blob: links, and jsPDF's doc.save() (which clicks a hidden download
 * anchor) — and instead writes the file into the device Documents/eduignite
 * folder. On the web build it does nothing, so normal browser downloads run.
 */

function guessFileName(href: string, fallback: string): string {
  try {
    if (href.startsWith("data:")) {
      const mime = href.slice(5, href.indexOf(";") >= 0 ? href.indexOf(";") : href.indexOf(","));
      const ext = (mime.split("/")[1] || "bin").split("+")[0];
      return `${fallback}.${ext}`;
    }
    if (href.startsWith("blob:") || /^https?:/.test(href)) {
      const clean = href.split("?")[0].split("#")[0];
      const last = clean.substring(clean.lastIndexOf("/") + 1);
      if (last && last.includes(".")) return decodeURIComponent(last);
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export function NativeDownloadBridge() {
  const { toast } = useToast();

  useEffect(() => {
    if (!isNativeApp()) return;

    const handler = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.("a") as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href") || "";
      const hasDownloadAttr = anchor.hasAttribute("download");
      const isFileHref = href.startsWith("blob:") || href.startsWith("data:");

      // Only take over genuine downloads — an explicit download attribute, or a
      // blob:/data: link (which is always a generated file, never navigation).
      if (!hasDownloadAttr && !isFileHref) return;

      event.preventDefault();
      event.stopPropagation();

      const downloadName = anchor.getAttribute("download") || "";
      const fileName = downloadName || guessFileName(href, `eduignite-${Date.now()}`);

      toast({ title: "Saving to EduIgnite…", description: fileName });
      saveToEduignite({ fileName, url: href })
        .then(() => {
          toast({
            title: "Saved",
            description: `${fileName} is in your eduignite folder (Pictures for images, Documents for files).`,
          });
        })
        .catch((err: any) => {
          toast({
            variant: "destructive",
            title: "Download failed",
            description: err?.message || "Could not save the file to your device.",
          });
        });
    };

    // Capture phase so we run before the browser's own download handling.
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [toast]);

  return null;
}
