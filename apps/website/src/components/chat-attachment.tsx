"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api/client";

/**
 * Renders a chat image or document reliably on every platform. Instead of
 * pointing an <img> at a cross-origin, token-in-query URL (which the Android
 * WebView blocks), it fetches the attachment as a JSON data URL through the
 * authenticated apiClient (native HTTP on mobile, CORS-bypassed on desktop)
 * and renders that data URL — which any WebView displays and downloads.
 */
export function ChatAttachment({
  messageId,
  isImage,
  isOwn,
  localPreview,
  localFileName,
  remoteName,
}: {
  messageId: string;
  isImage: boolean;
  isOwn: boolean;
  localPreview?: string | null;
  localFileName?: string | null;
  remoteName?: string | null;
}) {
  const [dataUrl, setDataUrl] = useState<string>(localPreview || "");
  const [name, setName] = useState<string>(localFileName || remoteName || "Document");
  const [loading, setLoading] = useState<boolean>(!localPreview);
  const [failed, setFailed] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (localPreview) {
      setDataUrl(localPreview);
      setLoading(false);
      return;
    }
    if (String(messageId).startsWith("tmp_")) return;
    let alive = true;
    setLoading(true);
    apiClient
      .get(`/chat/messages/${messageId}/attachment-file/`, { params: { as: "json" } })
      .then((res) => {
        if (!alive) return;
        if (res.data?.expired) {
          setExpired(true);
          if (res.data?.name) setName(res.data.name);
          return;
        }
        setDataUrl(res.data?.data_url || "");
        if (res.data?.name) setName(res.data.name);
      })
      .catch((err: any) => {
        if (!alive) return;
        // 410 = the 1-month retention job cleared this file.
        if (err?.response?.status === 410) setExpired(true);
        else setFailed(true);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [messageId, localPreview]);

  const ExpiredNotice = (
    <div className="mb-1 flex w-full items-start gap-2 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-2.5 text-left">
      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-bold text-amber-800">{name}</span>
        <span className="text-[11px] leading-tight text-amber-700">
          This file is no longer available. Please ask the sender to resend it.
        </span>
      </span>
    </div>
  );

  const openInNewTab = () => {
    if (!dataUrl) return;
    const win = window.open();
    if (win) {
      win.document.write(
        isImage
          ? `<img src="${dataUrl}" style="max-width:100%"/>`
          : `<iframe src="${dataUrl}" style="border:0;width:100%;height:100%"></iframe>`
      );
    }
  };

  if (expired) return ExpiredNotice;

  if (isImage) {
    if (loading) {
      return (
        <div className="mb-1 flex h-40 w-56 items-center justify-center rounded-xl bg-black/10">
          <Loader2 className="h-5 w-5 animate-spin text-white/70" />
        </div>
      );
    }
    if (failed || !dataUrl) return null;
    return (
      <button type="button" onClick={openInNewTab} className="mb-1 block">
        <img src={dataUrl} alt="Photo" className="max-h-72 w-full rounded-xl object-cover" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={openInNewTab}
      disabled={loading || !dataUrl}
      className={cn(
        "mb-1 flex w-full items-center gap-2.5 rounded-xl p-2.5 text-left",
        isOwn ? "bg-white/15" : "bg-accent/40"
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          isOwn ? "bg-white/20" : "bg-primary/10"
        )}
      >
        {loading ? (
          <Loader2 className={cn("h-4 w-4 animate-spin", isOwn ? "text-white" : "text-primary")} />
        ) : (
          <FileText className={cn("h-5 w-5", isOwn ? "text-white" : "text-primary")} />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold">{name}</span>
        <span className={cn("text-[11px]", isOwn ? "text-white/70" : "text-muted-foreground")}>
          {failed ? "Tap to retry" : "Document"}
        </span>
      </span>
    </button>
  );
}
