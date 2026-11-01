import { useMemo } from "react";
import { encodeQr, qrPath } from "./qrcode";

/**
 * Tadris+ P1-A2 — the authenticator enrolment link as a QR code. Drawn as one SVG path (dark modules) on a light island, so
 * it stays dark-on-light and scannable in the dark theme too. `crispEdges` keeps every module sharp at any size.
 */
export default function OwnerQr({ value, label }: { value: string; label: string }) {
  const { size, d } = useMemo(() => {
    const m = encodeQr(value);
    return { size: m.size + 8, d: qrPath(m, 4) };
  }, [value]);
  return (
    <figure className="eb-owner-qr eb-light-island">
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges" focusable="false">
        <rect className="eb-owner-qr-ground" width={size} height={size} />
        <path className="eb-owner-qr-ink" d={d} />
      </svg>
    </figure>
  );
}
