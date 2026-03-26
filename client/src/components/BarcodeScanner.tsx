import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Zap, ZapOff } from "lucide-react";

interface Props {
  onDetect: (barcode: string) => void;
  onError?: (err: string) => void;
}

/**
 * Live camera barcode scanner powered by @zxing/browser.
 * Renders its own <video> — no DOM-ID tricks, no library-injected HTML.
 * Mount to start scanning; unmount to stop and release the camera.
 */
export default function BarcodeScanner({ onDetect, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Store callbacks in refs so the scanner effect never needs to restart
  // when the parent re-renders (e.g. after setIsSearching(true)).
  const onDetectRef = useRef(onDetect);
  const onErrorRef  = useRef(onError);
  const detectedRef = useRef(false);
  const stopRef     = useRef<(() => void) | null>(null);
  const [torchOn, setTorchOn]           = useState(false);
  const [torchAvailable, setTorchAvail] = useState(false);

  // Keep refs current without re-running the scanner effect
  useEffect(() => { onDetectRef.current = onDetect; });
  useEffect(() => { onErrorRef.current  = onError;  });

  useEffect(() => {
    let cancelled = false;
    const codeReader = new BrowserMultiFormatReader();

    (async () => {
      const video = videoRef.current;
      if (!video) return;

      try {
        const controls = await codeReader.decodeFromVideoDevice(
          undefined, // undefined → library requests { facingMode: "environment" }
          video,
          (result) => {
            if (result && !detectedRef.current) {
              detectedRef.current = true;
              // stopRef is always set before this callback fires because
              // decodeFromVideoDevice resolves its Promise before the scan
              // loop ticks (scan loop uses rAF / setTimeout).
              stopRef.current?.();
              onDetectRef.current(result.getText());
            }
          }
        );

        if (cancelled) {
          controls.stop();
          return;
        }

        stopRef.current = () => controls.stop();

        // Detect torch/flashlight capability (Chrome/Android only)
        const stream = video.srcObject as MediaStream | null;
        if (stream) {
          const [track] = stream.getVideoTracks();
          const caps = (track?.getCapabilities?.() ?? {}) as Record<string, unknown>;
          if (caps.torch) setTorchAvail(true);
        }
      } catch (err) {
        if (!cancelled) onErrorRef.current?.(String(err));
      }
    })();

    return () => {
      cancelled = true;
      stopRef.current?.();
      stopRef.current = null;
    };
  }, []); // Empty — callbacks accessed via mutable refs, not deps

  async function toggleTorch() {
    const video = videoRef.current;
    if (!video?.srcObject) return;
    const [track] = (video.srcObject as MediaStream).getVideoTracks();
    const next = !torchOn;
    try {
      // torch is a non-standard constraint — cast to any to avoid TS error
      await track.applyConstraints({ advanced: [{ torch: next } as any] }); // eslint-disable-line @typescript-eslint/no-explicit-any
      setTorchOn(next);
    } catch {
      setTorchAvail(false);
    }
  }

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden bg-black"
      style={{ aspectRatio: "16/10" }}
    >
      {/* The actual camera feed — we own this element, no library injection */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        playsInline
        muted
      />

      {/* Aiming overlay */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
        <svg
          viewBox="0 0 260 100"
          width="260"
          height="100"
          className="overflow-visible"
          aria-hidden="true"
        >
          {/* Corner brackets */}
          <path d="M 36 0 L 0 0 L 0 36"        fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M 224 0 L 260 0 L 260 36"    fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M 36 100 L 0 100 L 0 64"     fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M 224 100 L 260 100 L 260 64" fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {/* Dashed centre scan-guide line */}
          <line x1="0" y1="50" x2="260" y2="50" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeOpacity="0.35" strokeDasharray="8 5" />
        </svg>
        <p className="text-xs text-white/60">Align barcode in frame</p>
      </div>

      {/* Torch toggle — only rendered when actually available */}
      {torchAvailable && (
        <button
          className="pointer-events-auto absolute bottom-3 right-3 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors"
          onClick={toggleTorch}
          aria-label={torchOn ? "Turn off flashlight" : "Turn on flashlight"}
        >
          {torchOn ? <ZapOff className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
}
