import { createElement, Fragment, type ReactNode } from "react";

/**
 * Phase 21E.3 (S-6) — LTR islands inside RTL text. Renders `text` with every match of `pattern` wrapped in <bdi dir="ltr">, so
 * a Latin brand («Tadris+»), a grade («8.5/10») or another technical token keeps its own reading order inside an Arabic
 * sentence (without isolation «Tadris+» is drawn «+Tadris»). The text content is unchanged — no bidi control character is
 * ever inserted, so copied text, accessible names and stored values stay identical. `pattern` must be a global RegExp.
 */
export function isolateLtr(text: string, pattern: RegExp): ReactNode {
  const out: ReactNode[] = [];
  let last = 0, key = 0;
  for (const m of text.matchAll(pattern)) {
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
/** A grade or score fraction such as 8/10 or 8.5/10. */
export const GRADE_LTR = /\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?/g;
