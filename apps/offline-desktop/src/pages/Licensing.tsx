import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import type { LicenseGateResult } from '../licensing/gate';
import type { ChallengePurpose, LicenseChallenge } from '../licensing/types';

// QR Activation UI (spec section 6). Three ways a signed License
// Certificate response can reach this app, all converging on the same
// `window.api.licensing.installCertificateResponse` IPC call:
//   1. Scan the companion app's response QR with the webcam (jsQR).
//   2. Paste the response JSON directly (no phone/camera needed — this is
//      the path exercised in automated tests and in this sandbox, which has
//      no real camera).
// Also supports `purpose: "device_replacement"` from the same screen (spec
// section 9's "Authorized Device Replacement Protocol").

type PendingPurpose = Exclude<ChallengePurpose, 'device_replacement'>;

export default function Licensing() {
  const [gate, setGate] = useState<LicenseGateResult | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<{ deviceId: string; schoolId: string | null } | null>(null);
  const [challenge, setChallenge] = useState<LicenseChallenge | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [previousDeviceId, setPreviousDeviceId] = useState('');
  const [wantsReplacement, setWantsReplacement] = useState(false);
  const [pasteValue, setPasteValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanFrameRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const [gateResult, info] = await Promise.all([
      window.api.licensing.getStatus(),
      window.api.licensing.getDeviceInfo(),
    ]);
    setGate(gateResult);
    setDeviceInfo(info);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const pendingPurpose: PendingPurpose = gate && gate.status !== 'unknown' && gate.plan ? 'renewal' : 'activation';

  async function onGenerateChallenge() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const purpose: ChallengePurpose = wantsReplacement ? 'device_replacement' : pendingPurpose;
      if (purpose === 'device_replacement' && !previousDeviceId.trim()) {
        throw new Error('Enter the previous device\'s HW-XXXX-XXXX id before requesting a replacement.');
      }
      const result = await window.api.licensing.generateChallenge(
        purpose,
        purpose === 'device_replacement' ? previousDeviceId.trim() : undefined
      );
      setChallenge(result);
      const dataUrl = await QRCode.toDataURL(JSON.stringify(result), { errorCorrectionLevel: 'M', width: 320 });
      setQrDataUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const installResponse = useCallback(
    async (responseJson: string) => {
      setError(null);
      setNotice(null);
      setBusy(true);
      try {
        const result = await window.api.licensing.installCertificateResponse(responseJson);
        setGate(result);
        setChallenge(null);
        setQrDataUrl(null);
        setPasteValue('');
        setNotice(`License installed — status is now "${result.status}".`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    []
  );

  function stopScanning() {
    if (scanFrameRef.current !== null) {
      cancelAnimationFrame(scanFrameRef.current);
      scanFrameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }

  async function startScanning() {
    setError(null);
    setNotice(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);

      const tick = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
          scanFrameRef.current = requestAnimationFrame(tick);
          return;
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          scanFrameRef.current = requestAnimationFrame(tick);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) {
          stopScanning();
          void installResponse(code.data);
          return;
        }
        scanFrameRef.current = requestAnimationFrame(tick);
      };
      scanFrameRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not access the webcam: ${err.message}`
          : 'Could not access the webcam.'
      );
    }
  }

  useEffect(() => () => stopScanning(), []);

  return (
    <div>
      <h1 className="page-title">Licensing</h1>

      <div className="card max-w-2xl space-y-2 mb-6">
        <div className="text-sm text-muted-foreground">Current status</div>
        {gate ? (
          <>
            <div className="text-lg font-semibold capitalize">{gate.status}</div>
            <div className="text-sm">{gate.message}</div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm pt-2">
              <dt className="text-muted-foreground">Plan</dt>
              <dd>{gate.plan ?? '—'}</dd>
              <dt className="text-muted-foreground">Expires</dt>
              <dd>{gate.expiresAt ?? '—'}</dd>
              <dt className="text-muted-foreground">Days remaining</dt>
              <dd>{gate.daysRemaining ?? '—'}</dd>
              <dt className="text-muted-foreground">Device ID</dt>
              <dd className="font-mono">{deviceInfo?.deviceId ?? '—'}</dd>
              <dt className="text-muted-foreground">School ID</dt>
              <dd className="font-mono">{deviceInfo?.schoolId ?? '—'}</dd>
            </dl>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">Loading…</div>
        )}
      </div>

      {error && <div className="card max-w-2xl mb-4 border-red-200 bg-red-50 text-red-900 text-sm">{error}</div>}
      {notice && (
        <div className="card max-w-2xl mb-4 border-green-200 bg-green-50 text-green-900 text-sm">{notice}</div>
      )}

      <div className="card max-w-2xl space-y-4 mb-6">
        <div className="text-lg font-semibold">1. Activate / Renew</div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={wantsReplacement}
            onChange={(e) => setWantsReplacement(e.target.checked)}
          />
          This is a device replacement (old machine deactivated, new machine being licensed)
        </label>
        {wantsReplacement && (
          <input
            className="input-field"
            placeholder="Previous device id, e.g. HW-F398-84D2"
            value={previousDeviceId}
            onChange={(e) => setPreviousDeviceId(e.target.value)}
          />
        )}
        <button type="button" className="btn-primary" disabled={busy} onClick={onGenerateChallenge}>
          {busy ? 'Working…' : `Generate ${wantsReplacement ? 'device replacement' : pendingPurpose} QR code`}
        </button>

        {challenge && qrDataUrl && (
          <div className="pt-2 flex flex-col items-start gap-2">
            <img src={qrDataUrl} alt="Activation challenge QR code" width={240} height={240} />
            <p className="text-xs text-muted-foreground max-w-sm">
              Scan this with the EduIgnite Companion App within 5 minutes (expires {challenge.expiresAt}). The
              technician's phone will show a response QR code once the backend approves the request.
            </p>
          </div>
        )}
      </div>

      <div className="card max-w-2xl space-y-4 mb-6">
        <div className="text-lg font-semibold">2. Scan response</div>
        {!scanning ? (
          <button type="button" className="btn-secondary" onClick={startScanning}>
            Start webcam scan
          </button>
        ) : (
          <button type="button" className="btn-secondary" onClick={stopScanning}>
            Stop scanning
          </button>
        )}
        <div className={scanning ? 'block' : 'hidden'}>
          <video ref={videoRef} className="w-full max-w-sm rounded-md border border-border" muted playsInline />
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </div>

      <div className="card max-w-2xl space-y-3">
        <div className="text-lg font-semibold">3. Or paste the response code</div>
        <p className="text-xs text-muted-foreground">
          Useful when there is no working camera — paste the exact JSON the companion app (or backend test
          fixture) produced for this challenge.
        </p>
        <textarea
          className="input-field font-mono text-xs h-32"
          placeholder='{"certificate":{"payload":{...},"signature":"..."}}'
          value={pasteValue}
          onChange={(e) => setPasteValue(e.target.value)}
        />
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !pasteValue.trim()}
          onClick={() => installResponse(pasteValue.trim())}
        >
          Install pasted certificate
        </button>
      </div>
    </div>
  );
}
