"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { imageProblem, MAX_IMAGE_BYTES } from "@/lib/api/services/public-site-content.service";
import { useTr } from "./shared";

export function imageProblemText(tr: ReturnType<typeof useTr>, kind: "type" | "size" | null) {
  if (kind === "type") return tr("Use a JPEG, PNG or WEBP image.", "Utilisez une image JPEG, PNG ou WEBP.");
  if (kind === "size") {
    return tr(
      `This image is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
      `Cette image depasse ${MAX_IMAGE_BYTES / 1024 / 1024} Mo.`,
    );
  }
  return "";
}

/**
 * Pick one image with an instant preview and validation of type and size.
 * `currentUrl` is the image already saved. `progress` (0-100) shows while uploading.
 */
export function ImagePicker({
  id,
  file,
  onFile,
  currentUrl,
  onRemoveCurrent,
  progress,
  disabled,
  error,
}: {
  id: string;
  file: File | null;
  onFile: (file: File | null) => void;
  currentUrl?: string | null;
  onRemoveCurrent?: () => void;
  progress?: number | null;
  disabled?: boolean;
  error?: string;
}) {
  const tr = useTr();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const shown = preview || currentUrl || null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-24 w-40 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt={tr("Selected image preview", "Apercu de l'image choisie")} className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-6 w-6 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={input}
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={disabled}
            onChange={(e) => {
              const picked = e.target.files?.[0] ?? null;
              const bad = picked ? imageProblem(picked) : null;
              setProblem(imageProblemText(tr, bad));
              onFile(picked && !bad ? picked : null);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => input.current?.click()}>
            <ImagePlus className="mr-2 h-4 w-4" aria-hidden />
            {shown ? tr("Change image", "Changer l'image") : tr("Choose image", "Choisir une image")}
          </Button>
          {file ? (
            <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onFile(null)}>
              {tr("Discard selection", "Annuler la selection")}
            </Button>
          ) : currentUrl && onRemoveCurrent ? (
            <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onRemoveCurrent}>
              <Trash2 className="mr-2 h-4 w-4" aria-hidden /> {tr("Remove image", "Retirer l'image")}
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {tr("JPEG, PNG or WEBP, up to 5 MB. Location data is removed automatically.", "JPEG, PNG ou WEBP, 5 Mo maximum. Les donnees de localisation sont supprimees automatiquement.")}
      </p>
      {typeof progress === "number" ? (
        <div role="status" aria-live="polite" className="space-y-1">
          <Progress value={progress} className="h-2" aria-label={tr("Upload progress", "Progression du televersement")} />
          <p className="text-xs text-muted-foreground">{progress}%</p>
        </div>
      ) : null}
      {problem || error ? <p role="alert" className="text-xs text-destructive">{problem || error}</p> : null}
    </div>
  );
}
