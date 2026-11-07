// Tadris+ QR-2 — reading a QR code from the camera or from a photo. The browser's own BarcodeDetector is used where it exists
// (Chrome on Android); elsewhere (Safari on iPhone / iPad, Firefox) the small jsQR decoder is loaded on demand. Nothing leaves the
// device: frames are decoded in the page and only the decoded text is used (and only when it is an address of this site).

type Detector = { detect: (source: CanvasImageSource | ImageBitmap) => Promise<{ rawValue?: string }[]> };
type DetectorCtor = new (o: { formats: string[] }) => Detector;

let detector: Detector | null | undefined;
function nativeDetector(): Detector | null {
  if (detector !== undefined) return detector;
  const Ctor = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  try { detector = Ctor ? new Ctor({ formats: ["qr_code"] }) : null; } catch { detector = null; }
  return detector;
}

let canvas: HTMLCanvasElement | null = null;
function pixelsOf(source: HTMLVideoElement | HTMLImageElement | ImageBitmap): ImageData | null {
  const w = "videoWidth" in source ? source.videoWidth : "naturalWidth" in source ? source.naturalWidth : source.width;
  const h = "videoHeight" in source ? source.videoHeight : "naturalHeight" in source ? source.naturalHeight : source.height;
  if (!w || !h) return null;
  const scale = Math.min(1, 960 / Math.max(w, h));          // bounded work per frame
  canvas = canvas || document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** The text of the first QR code found in `source`, or null. */
export async function decodeQr(source: HTMLVideoElement | HTMLImageElement | ImageBitmap): Promise<string | null> {
  const native = nativeDetector();
  if (native) {
    try {
      const found = await native.detect(source);
      const hit = found.find(f => typeof f.rawValue === "string" && f.rawValue);
      return hit ? String(hit.rawValue) : null;
    } catch { /* fall through to jsQR */ }
  }
  const pixels = pixelsOf(source);
  if (!pixels) return null;
  const { default: jsQR } = await import("jsqr");
  const code = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "dontInvert" });
  return code && code.data ? code.data : null;
}

/** The QR text in a photo the user took or chose (the fallback when live scanning is unavailable). */
export async function decodeQrFile(file: Blob): Promise<string | null> {
  if (typeof createImageBitmap === "function") {
    try { const bitmap = await createImageBitmap(file); try { return await decodeQr(bitmap); } finally { bitmap.close?.(); } } catch { /* try an <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("image")); img.src = url; });
    return await decodeQr(img);
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}

/** Whether this browser can show a live camera at all (a secure page with mediaDevices). */
export function cameraAvailable(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function";
}
