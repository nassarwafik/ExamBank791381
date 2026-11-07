import qrcode from "qrcode-generator";

/** Tadris+ QR-2 — the QR code of `text` as ONE SVG path (dark modules) inside a square of `size` modules with the 4-module quiet zone. Error correction M. */
export function qrPathData(text: string): { size: number; d: string } {
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += "M" + (c + quiet) + " " + (r + quiet) + "h1v1h-1z";
  return { size: n + quiet * 2, d };
}

