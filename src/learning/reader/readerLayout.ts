// Phase L.1 — the Reader's layout preference, remembered on this device: whether the table of contents is DOCKED as a
// column beside the page (only offered from 1280px) or folded away so the page takes the full width. Same storage
// discipline as readingSettings.ts: every access is guarded and anything unreadable falls back to the default (docked).

const KEY = "eb.learning.reader.tocDocked.v1";

function storage(): Storage | null {
  try { return typeof window !== "undefined" && window.localStorage ? window.localStorage : null; } catch { return null; }
}

/** This device's choice; true (docked) unless the reader folded the index away before. */
export function loadTocDocked(): boolean {
  try { return storage()?.getItem(KEY) !== "0"; } catch { return true; }
}

export function saveTocDocked(docked: boolean): void {
  try { storage()?.setItem(KEY, docked ? "1" : "0"); } catch { /* storage unavailable: the choice lasts for this view */ }
}
