import { useEffect, useRef } from "react";

interface Props {
  onDetect: (barcode: string) => void;
  onError?: (err: string) => void;
}

/**
 * Live camera barcode scanner powered by html5-qrcode.
 * Mount this component to start scanning; unmount to stop.
 * Works on iOS Safari, Android Chrome, and desktop Chrome/Firefox.
 */
export default function BarcodeScanner({ onDetect, onError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const detectedRef = useRef(false);

  useEffect(() => {
    // Unique element ID required by html5-qrcode
    const elementId = "hg-barcode-scanner";

    let mounted = true;

    async function startScanner() {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (!mounted) return;

      const scanner = new Html5Qrcode(elementId);
      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 160 } },
          (decodedText) => {
            if (detectedRef.current) return;
            detectedRef.current = true;
            scanner.stop().catch(() => {});
            onDetect(decodedText);
          },
          () => {
            // Per-frame decode failure — normal, ignore
          }
        );
      } catch (err) {
        onError?.(String(err));
      }
    }

    startScanner();

    return () => {
      mounted = false;
      scannerRef.current
        ?.stop()
        .catch(() => {})
        .finally(() => {
          scannerRef.current?.clear();
        });
    };
  }, [onDetect, onError]);

  return (
    <div className="relative rounded-2xl overflow-hidden bg-black w-full aspect-[4/3]">
      <div id="hg-barcode-scanner" ref={containerRef} className="w-full h-full" />
      {/* Aiming overlay */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="w-[260px] h-[90px] border-2 border-primary rounded-xl opacity-80" />
      </div>
    </div>
  );
}
