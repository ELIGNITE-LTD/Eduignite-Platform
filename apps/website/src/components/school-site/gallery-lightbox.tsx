"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import type { GalleryImage } from "@/lib/school-site-content";

type Labels = { close: string; previous: string; next: string; image: string; of: string; enlarge: string };

const BTN =
  "flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";

/**
 * Thumbnail grid with an accessible lightbox. It uses a native modal <dialog>:
 * focus is trapped inside, Escape closes it, and focus returns to the thumbnail
 * that opened it. Left/Right arrows move between images; the counter is
 * announced politely. Thumbnails load lazily.
 */
export function GalleryGrid({ images, labels, label }: { images: GalleryImage[]; labels: Labels; label: string }) {
  const [index, setIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const count = images.length;

  const open = (i: number, el: HTMLElement) => {
    opener.current = el;
    setIndex(i);
  };
  const close = useCallback(() => dialogRef.current?.close(), []);
  const step = useCallback(
    (delta: number) => setIndex((i) => (i === null ? i : (i + delta + count) % count)),
    [count],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (index !== null && !dialog.open) dialog.showModal();
  }, [index]);

  // Preload the neighbours so arrow navigation feels instant.
  useEffect(() => {
    if (index === null) return;
    [index - 1, index + 1].forEach((n) => {
      const target = images[(n + count) % count];
      if (target) new window.Image().src = target.url;
    });
  }, [index, images, count]);

  const current = index === null ? null : images[index];

  return (
    <>
      <ul aria-label={label} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {images.map((image, i) => (
          <li key={image.id}>
            <button
              type="button"
              onClick={(e) => open(i, e.currentTarget)}
              aria-label={`${labels.enlarge}: ${image.alt || image.caption || `${labels.image} ${i + 1}`}`}
              className="group block w-full overflow-hidden rounded-xl bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.thumb || image.url}
                alt={image.alt || image.caption}
                width={image.width || undefined}
                height={image.height || undefined}
                loading="lazy"
                decoding="async"
                className="aspect-square w-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
            </button>
            {image.caption ? <p className="mt-1 truncate text-xs text-slate-600">{image.caption}</p> : null}
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        aria-label={label}
        onClose={() => {
          setIndex(null);
          opener.current?.focus();
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            step(1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            step(-1);
          }
        }}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 backdrop:bg-black/90"
      >
        {current ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4">
            <div className="flex w-full max-w-5xl items-center justify-between text-white">
              <p aria-live="polite" className="text-sm">
                {labels.image} {(index ?? 0) + 1} {labels.of} {count}
              </p>
              <button type="button" onClick={close} aria-label={labels.close} className={BTN} autoFocus>
                <X className="h-6 w-6" aria-hidden />
              </button>
            </div>
            <div className="flex min-h-0 w-full max-w-5xl flex-1 items-center gap-2">
              {count > 1 ? (
                <button type="button" onClick={() => step(-1)} aria-label={labels.previous} className={BTN}>
                  <ChevronLeft className="h-6 w-6" aria-hidden />
                </button>
              ) : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.url}
                alt={current.alt || current.caption}
                className="mx-auto max-h-full min-w-0 max-w-full flex-1 object-contain"
                style={{ maxHeight: "calc(100dvh - 10rem)" }}
              />
              {count > 1 ? (
                <button type="button" onClick={() => step(1)} aria-label={labels.next} className={BTN}>
                  <ChevronRight className="h-6 w-6" aria-hidden />
                </button>
              ) : null}
            </div>
            {current.caption ? <p className="max-w-3xl text-center text-sm text-white">{current.caption}</p> : null}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
