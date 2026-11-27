// «محرّر المخططات» — the drawing as a picture for the learner's book: PNG (sharp, ×2 or ×3), SVG, or a PNG in the clipboard (pasted into
// Word with Ctrl+V). On this device only: nothing is sent anywhere.
//
// The drawing's paint is written on its elements (diagramShapes.tsx), so a copy of the SVG looks the same outside the page. Two things
// are fixed on the copy: the editor's own marks (selection, handles, the grid: `data-ui`) are removed, and the picture is cut to the
// drawing.
// • SVG file: the app's typeface is embedded in it (the four font files the drawing uses, read from this site); without them the file
//   falls back to the system's Arabic font, never fails.
// • PNG: an SVG drawn as a picture loads its fonts on its own time, so a first picture could come out with its bold text missing
//   (seen in Chromium). The PNG is therefore drawn in two layers: the shapes from the SVG (its texts taken out), then every text drawn
//   on the canvas with the PAGE's own typeface, once the page says the font is loaded. The same picture every time.

const FONT_FILES = [
  ["400", "/fonts/IBMPlexSansArabic-400-arabic.woff2", "U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFC, U+200C-200E, U+2010-2011"],
  ["400", "/fonts/IBMPlexSansArabic-400-latin.woff2", "U+0000-00FF, U+2000-206F, U+20AC, U+2122"],
  ["600", "/fonts/IBMPlexSansArabic-600-arabic.woff2", "U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFC, U+200C-200E, U+2010-2011"],
  ["600", "/fonts/IBMPlexSansArabic-600-latin.woff2", "U+0000-00FF, U+2000-206F, U+20AC, U+2122"],
] as const;
const MAX_SIDE = 8000;

let fontCss: Promise<string> | null = null;
function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
/** The app's typeface as @font-face rules with the files inside (read once). Empty when a file cannot be read. */
export function embeddedFontCss(): Promise<string> {
  fontCss ??= (async () => {
    if (typeof fetch !== "function") return "";
    try {
      const parts = await Promise.all(FONT_FILES.map(async ([weight, url, range]) => {
        const r = await fetch(url, { credentials: "same-origin" });
        if (!r.ok) throw new Error("font");
        return `@font-face{font-family:"IBM Plex Sans Arabic";font-weight:${weight};font-style:normal;src:url(data:font/woff2;base64,${base64(await r.arrayBuffer())}) format("woff2");unicode-range:${range};}`;
      }));
      return parts.join("");
    } catch { fontCss = null; return ""; }
  })();
  return fontCss;
}

export type Area = { x: number; y: number; w: number; h: number };

/** A standalone SVG of the drawing, cut to `area`, on white, without the editor's marks. */
export function diagramSvgMarkup(svg: SVGSVGElement, area: Area, css = "", title = ""): string {
  const ns = "http://www.w3.org/2000/svg";
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll("[data-ui]").forEach(el => el.remove());
  for (const a of ["class", "style", "role", "aria-label", "tabindex", "aria-describedby", "data-testid"]) clone.removeAttribute(a);
  clone.setAttribute("xmlns", ns);
  clone.setAttribute("viewBox", `${area.x} ${area.y} ${area.w} ${area.h}`);
  clone.setAttribute("width", String(area.w));
  clone.setAttribute("height", String(area.h));
  const bg = document.createElementNS(ns, "rect");
  for (const [k, v] of [["x", area.x], ["y", area.y], ["width", area.w], ["height", area.h], ["fill", "#ffffff"]] as const) bg.setAttribute(k, String(v));
  clone.insertBefore(bg, clone.firstChild);
  if (css) { const st = document.createElementNS(ns, "style"); st.textContent = css; clone.insertBefore(st, clone.firstChild); }
  if (title) { const t = document.createElementNS(ns, "title"); t.textContent = title; clone.insertBefore(t, clone.firstChild); }
  return new XMLSerializer().serializeToString(clone);
}

/** One text of the drawing, as the canvas draws it. */
export type TextRun = { x: number; y: number; text: string; size: number; weight: string; fill: string; anchor: string; dir: "rtl" | "ltr"; underline: boolean; family: string };

/** Takes every text out of an SVG document (returned for the canvas). */
export function takeTexts(root: Element): TextRun[] {
  const out: TextRun[] = [];
  root.querySelectorAll("text").forEach(t => {
    const a = (k: string, d = "") => t.getAttribute(k) ?? d;
    if (t.textContent) out.push({ x: Number(a("x", "0")), y: Number(a("y", "0")), text: t.textContent, size: Number(a("font-size", "14")), weight: a("font-weight", "400"),
      fill: a("fill", "#1f2937"), anchor: a("text-anchor", "start"), dir: a("direction") === "rtl" ? "rtl" : "ltr", underline: a("text-decoration") === "underline", family: a("font-family", "sans-serif") });
    t.remove();
  });
  return out;
}

/** Waits (briefly) until the page's typeface is ready in both weights, for Arabic and Latin text. */
async function fontsReady(family: string): Promise<void> {
  const fonts = typeof document !== "undefined" ? (document as Document & { fonts?: FontFaceSet }).fonts : undefined;
  if (!fonts?.load) return;
  const first = family.split(",")[0].trim();
  const loads = ["400", "600"].flatMap(w => [fonts.load(`${w} 14px ${first}`, "ابت"), fonts.load(`${w} 14px ${first}`, "Abc")]);
  await Promise.race([Promise.all(loads), new Promise(r => setTimeout(r, 3000))]).catch(() => undefined);
}

function drawText(pen: CanvasRenderingContext2D, t: TextRun) {
  pen.font = `${t.weight === "600" || t.weight === "700" ? t.weight : "400"} ${t.size}px ${t.family}`;
  pen.direction = t.dir;
  pen.textAlign = t.anchor === "middle" ? "center" : t.anchor === "end" ? "end" : "start";
  pen.textBaseline = "middle";
  pen.fillStyle = t.fill;
  pen.fillText(t.text, t.x, t.y);
  if (t.underline) {
    const w = pen.measureText(t.text).width;
    const atLeft = pen.textAlign === "center" ? t.x - w / 2 : (pen.textAlign === "start") === (t.dir === "ltr") ? t.x : t.x - w;
    pen.fillRect(atLeft, t.y + t.size * 0.55, w, Math.max(1, t.size / 14));
  }
}

/** The drawing as PNG, `scale` times its size (at most 8000 px a side): the shapes from the SVG, the texts in the page's own font. */
export async function diagramPng(svg: SVGSVGElement, area: Area, scale = 2): Promise<Blob> {
  const doc = new DOMParser().parseFromString(diagramSvgMarkup(svg, area), "image/svg+xml");
  const texts = takeTexts(doc.documentElement);
  const markup = new XMLSerializer().serializeToString(doc.documentElement);
  if (texts.length) await fontsReady(texts[0].family);
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.max(1, Math.min(scale, MAX_SIDE / Math.max(area.w, area.h)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(area.w * k);
    canvas.height = Math.round(area.h * k);
    const pen = canvas.getContext("2d");
    if (!pen) throw new Error("no canvas");
    pen.fillStyle = "#ffffff";
    pen.fillRect(0, 0, canvas.width, canvas.height);
    pen.scale(k, k);
    pen.drawImage(img, 0, 0, area.w, area.h);
    pen.translate(-area.x, -area.y);
    for (const t of texts) drawText(pen, t);
    const png = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/png"));
    if (!png) throw new Error("no picture");
    return png;
  } finally { URL.revokeObjectURL(url); }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.rel = "noopener"; a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Whether this browser can put a picture in the clipboard. */
export function canCopyImage(): boolean {
  return typeof navigator !== "undefined" && !!navigator.clipboard && typeof navigator.clipboard.write === "function" && typeof ClipboardItem !== "undefined";
}
/** Puts the PNG in the clipboard (the promise is handed over at once: Safari needs the click's own turn). */
export async function copyPngToClipboard(png: Promise<Blob>): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}
