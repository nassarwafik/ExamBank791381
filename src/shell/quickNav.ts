// UX-R2 — the quick navigation's matching rules (kept apart from the component so the component module exports only the
// component, like studentQuickNav.ts). Pure functions, no DOM.
export type QuickNavDestination = { id: string; label: string };

/** Arabic-insensitive matching: diacritics and tatweel dropped, alef / ya / ta-marbuta forms unified, case folded. */
export function normalizeArabic(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function matchDestinations(destinations: readonly QuickNavDestination[], query: string): QuickNavDestination[] {
  const q = normalizeArabic(query);
  if (!q) return [...destinations];
  return destinations.filter(d => normalizeArabic(d.label).includes(q));
}
