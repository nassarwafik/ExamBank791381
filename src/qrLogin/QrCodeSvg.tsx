import { useMemo } from "react";
import { qrPathData } from "./qrMatrix";

/**
 * Tadris+ QR-2 — a QR code drawn as ONE SVG path (no canvas, no innerHTML, no image URL). Always dark modules on a white field with
 * the standard 4-module quiet zone, in light AND dark themes, because camera readers need that contrast. Error correction M.
 */
export default function QrCodeSvg({ text, label, size = 232 }: { text: string; label: string; size?: number }) {
  const { size: modules, d } = useMemo(() => qrPathData(text), [text]);
  return (
    <svg className="eb-qr-code" role="img" aria-label={label} width={size} height={size} viewBox={"0 0 " + modules + " " + modules} shapeRendering="crispEdges">
      <rect width={modules} height={modules} fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  );
}
