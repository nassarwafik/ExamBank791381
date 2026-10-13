import { createElement, Fragment, type ReactNode } from "react";

/**
 * Phase 21E.3 (S-6) — LTR islands inside RTL text. Renders `text` with every match of `pattern` wrapped in <bdi dir="ltr">, so
 * a Latin brand («Tadris+»), a grade («8.5/10») or another technical token keeps its own reading order inside an Arabic
 * sentence (without isolation «Tadris+» is drawn «+Tadris»). The text content is unchanged — no bidi control character is
 * ever inserted, so copied text, accessible names and stored values stay identical. `pattern` must be a global RegExp.
 */
export function isolateLtr(text: string, pattern: RegExp, options: { lastOnly?: boolean } = {}): ReactNode {
  const out: ReactNode[] = [];
  let last = 0, key = 0;
  const all = [...text.matchAll(pattern)];
  for (const m of options.lastOnly ? all.slice(-1) : all) {
    const at = m.index ?? 0;
    if (!m[0]) continue;
    if (at > last) out.push(text.slice(last, at));
    out.push(createElement("bdi", { dir: "ltr", key: key++ }, m[0]));
    last = at + m[0].length;
  }
  if (!out.length) return text;
  if (last < text.length) out.push(text.slice(last));
  return createElement(Fragment, null, ...out);
}

/** The Latin brand name. */
export const BRAND_LTR = /Tadris\+/g;
/** A standalone grade or score fraction such as 8/10 or 8.5/10. Review fix 1: never part of a longer numeric token — a date
 *  (12/10/2026), an address / prefix (192.168.1.0/24) or a version stays one untouched run (splitting it reorders it). */
export const GRADE_LTR = /(?<![\d/]|\d\.)\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?(?![\d/]|\.\d)/g;
