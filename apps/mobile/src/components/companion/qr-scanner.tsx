"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import jsQR from "jsqr";
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, RefreshCw, ScanLine, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface QrScannerProps {
  /** Called with the raw decoded text as soon as a QR frame is read. */
  onDecode: (raw: string) => void;
  /** Optional surface-level error (camera denied, decode failure, etc). */
  onError?: (message: string) => void;
  className?: string;
}

/**
 * Camera capture + client-side QR decode for the Companion app.
 *
 * - On the native Android build (Capacitor), uses the official
 *   `@capacitor/camera` plugin to take a single photo, then decodes it with
 *   `jsQR` on a canvas — this needs no extra native permission wiring beyond
 *   what the Camera plugin already declares.
 * - In a plain browser (local dev / testing this screen without the APK),
 *   falls back to `getUserMedia` + a live `jsQR` scan loop, matching the
 *   same decode approach the offline desktop app uses for its own webcam
 *   scan.
 */
export function QrScanner({ onDecode, onError, className }: QrScannerProps) {
  const isNative = typeof window !== "undefined" && Capacitor.isNativePlatform();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const [isBusy, setIsBusy] = useState(false);
  const [webScanActive, setWebScanActive] = useState(false);

  const stopWebStream = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setWebScanActive(false);
  }, []);

  useEffect(() => stopWebStream, [stopWebStream]);

  const decodeDataUrl = useCallback(
    (dataUrl: string) =>
      new Promise<string | null>((resolve) => {
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.drawImage(image, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(imageData.data, imageData.width, imageData.height);
          resolve(result?.data ?? null);
        };
        image.onerror = () => resolve(null);
        image.src = dataUrl;
      }),
    []
  );

  const captureNative = useCallback(async () => {
    setIsBusy(true);
    try {
      const photo = await CapacitorCamera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        quality: 90,
        allowEditing: false,
        saveToGallery: false,
      });
      if (!photo.dataUrl) {
        onError?.("No photo was captured.");
        return;
      }
      const decoded = await decodeDataUrl(photo.dataUrl);
      if (decoded) {
        onDecode(decoded);
      } else {
        onError?.("No QR code was found in that photo. Line the code up in the frame and try again.");
      }
    } catch (error: any) {
      // The user cancelling the camera sheet is not a real error.
      const message = String(error?.message || "");
      if (!/cancel/i.test(message)) {
        onError?.("Could not access the camera. Check that EduIgnite has camera permission.");
      }
    } finally {
      setIsBusy(false);
    }
  }, [decodeDataUrl, onDecode, onError]);

  const scanWebFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanWebFrame);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      rafRef.current = requestAnimationFrame(scanWebFrame);
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(imageData.data, imageData.width, imageData.height);
    if (result?.data) {
      onDecode(result.data);
      stopWebStream();
      return;
    }
    rafRef.current = requestAnimationFrame(scanWebFrame);
  }, [onDecode, stopWebStream]);

  const startWebScan = useCallback(async () => {
    setIsBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setWebScanActive(true);
      rafRef.current = requestAnimationFrame(scanWebFrame);
    } catch {
      onError?.("Could not access the camera. Check your browser's camera permission for this site.");
    } finally {
      setIsBusy(false);
    }
  }, [onError, scanWebFrame]);

  if (isNative) {
    return (
      <div className={cn("flex flex-col items-center gap-4", className)}>
        <div className="flex h-48 w-48 items-center justify-center rounded-3xl border-2 border-dashed border-primary/30 bg-primary/5">
          {isBusy ? (
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          ) : (
            <ScanLine className="h-16 w-16 text-primary/40" />
          )}
        </div>
        <Button onClick={captureNative} disabled={isBusy} className="h-12 rounded-xl font-black">
          {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
          Open Camera to Scan QR
        </Button>
        <p className="max-w-xs text-center text-xs text-muted-foreground">
          Point the camera at the QR code shown on the offline desktop screen, then take the photo.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div className="relative flex h-56 w-56 items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-primary/30 bg-black/90">
        <video ref={videoRef} className={cn("h-full w-full object-cover", !webScanActive && "hidden")} muted playsInline />
        <canvas ref={canvasRef} className="hidden" />
        {!webScanActive ? <ScanLine className="h-16 w-16 text-white/30" /> : null}
      </div>
      {webScanActive ? (
        <Button variant="outline" onClick={stopWebStream} className="h-12 rounded-xl font-black">
          <X className="mr-2 h-4 w-4" />
          Stop Scanning
        </Button>
      ) : (
        <Button onClick={startWebScan} disabled={isBusy} className="h-12 rounded-xl font-black">
          {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Start Camera Scan
        </Button>
      )}
      <p className="max-w-xs text-center text-xs text-muted-foreground">
        Browser preview mode (dev/testing). On the Android app this uses the device camera directly.
      </p>
    </div>
  );
}
