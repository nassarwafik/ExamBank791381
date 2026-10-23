// UX-R18a — charts need resolved colour strings (Chart.js and SVG presentation attributes cannot read CSS variables), so they
// read tokens with getPropertyValue. That returns the token as written: since design-tokens-dark.css a colour token is
// light-dark(<light>, <dark>), which no chart library parses. resolveThemeColor picks the half the element's color-scheme shows,
// so a chart draws with the same colour the page does, in either theme. Any other value is returned unchanged.

/** True when the element (default <html>) renders with a dark color-scheme. */
export function isDarkScheme(el?: Element | null): boolean {
  try {
    const target = el ?? (typeof document !== "undefined" ? document.documentElement : null);
    if (!target || typeof getComputedStyle !== "function") return false;
    const scheme = String(getComputedStyle(target).colorScheme || "");
    return /\bdark\b/.test(scheme) && !/\blight\b/.test(scheme);
  } catch {
    return false;
  }
}

/** Splits "a, b" at its top-level comma (commas inside rgba(…) stay). */
function splitTopLevel(args: string): string[] {
  const parts: string[] = []; let depth = 0, start = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) { parts.push(args.slice(start, i)); start = i + 1; }
  }
  parts.push(args.slice(start));
  return parts.map(p => p.trim());
}

/** The colour a token value shows on `el`: light-dark(<light>, <dark>) resolved by its color-scheme; anything else unchanged. */
export function resolveThemeColor(value: string, el?: Element | null): string {
  const m = /^light-dark\(([\s\S]*)\)$/.exec(value.trim());
  if (!m) return value;
  const parts = splitTopLevel(m[1]);
  if (parts.length !== 2) return value;
  return isDarkScheme(el) ? parts[1] : parts[0];
}
