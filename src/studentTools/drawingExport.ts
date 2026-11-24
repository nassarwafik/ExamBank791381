/**
 * Visual lab V13 (docs/enterprise-csharp-visual-lab-plan.md §23) — «حفظ صورة»: a drawing of the visual run saved as a picture, on this
 * device only (nothing is sent anywhere).
 *
 * The drawing's colours come from the app's CSS (design tokens, light or dark); a picture file has no CSS, so the SVG is COPIED with
 * each element's computed paint and type written on it, on the colour behind it, with its text in words as its <title>. That copy is
 * drawn on a canvas at twice its size and saved as PNG (the CSP allows blob: / data: images). If any of that is not possible (no
 * canvas, a decode refused), the SVG copy itself is saved instead — the drawing is never lost to a failure.
 */
const PAINT = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linecap", "stroke-linejoin",
  "font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline", "visibility", "display"];
const MAX_SIDE = 8000;   // a canvas side browsers accept everywhere

/** The drawing as a standalone SVG document: its computed paint inline, its background, its words as <title>. */
export function svgMarkup(svg: SVGSVGElement, background: string): { markup: string; width: number; height: number } {
  const box = svg.viewBox?.baseVal;
  const width = Math.max(1, Math.round(box && box.width ? box.width : Number(svg.getAttribute("width")) || svg.clientWidth || 1));
  const height = Math.max(1, Math.round(box && box.height ? box.height : Number(svg.getAttribute("height")) || svg.clientHeight || 1));
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const from = [svg, ...svg.querySelectorAll("*")];
  const to = [clone, ...clone.querySelectorAll("*")];
  from.forEach((el, i) => {
    const target = to[i] as Element;
    const cs = getComputedStyle(el);
    const style = PAINT.map(p => { const v = cs.getPropertyValue(p); return v ? p + ":" + v : ""; }).filter(Boolean).join(";");
    target.removeAttribute("class");
    if (style) target.setAttribute("style", style); else target.removeAttribute("style");
  });
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  for (const a of ["role", "aria-label", "style"]) clone.removeAttribute(a);
  const ns = "http://www.w3.org/2000/svg";
  const bg = document.createElementNS(ns, "rect");
  for (const [k, v] of [["x", "0"], ["y", "0"], ["width", String(width)], ["height", String(height)], ["fill", background]]) bg.setAttribute(k, v);
  clone.insertBefore(bg, clone.firstChild);
  const words = svg.getAttribute("aria-label");
  if (words) { const t = document.createElementNS(ns, "title"); t.textContent = words; clone.insertBefore(t, clone.firstChild); }
  return { markup: new XMLSerializer().serializeToString(clone), width, height };
}

/** The colour the drawing is seen on: the nearest ancestor with a background (else white). */
export function backgroundOf(el: Element | null): string {
  for (let e: Element | null = el; e; e = e.parentElement) {
    const c = getComputedStyle(e).backgroundColor;
    if (c && c !== "transparent" && !/^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(c)) return c;
  }
  return "#ffffff";
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.rel = "noopener"; a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Saves the drawing as `<fileBase>.png` (twice its size), or `<fileBase>.svg` when a picture cannot be made here. */
export async function saveDrawing(svg: SVGSVGElement, fileBase: string, background: string): Promise<"png" | "svg"> {
  const { markup, width, height } = svgMarkup(svg, background);
  const svgBlob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
  try {
    const url = URL.createObjectURL(svgBlob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.max(1, Math.min(2, MAX_SIDE / Math.max(width, height)));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      const png = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/png"));
      if (!png) throw new Error("no picture");
      download(png, fileBase + ".png");
      return "png";
    } finally { URL.revokeObjectURL(url); }
  } catch {
    download(svgBlob, fileBase + ".svg");
    return "svg";
  }
}
