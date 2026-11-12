// Phase R-5b — the PURE logic of the Reports Center's interactive tables: ordering and text search. No React, no network.
// Grading safety: a cell with no final number (awaiting the teacher, not handed in, «—») has an EMPTY sort value, and an empty
// value is placed LAST in both directions — a provisional score never decides an order, and "no result" is never the lowest
// (the gradebook's own rule, owner decision D-1).

export type SortDir = "asc" | "desc";
export type SortState = { key: string; dir: SortDir } | null;
export type SortValue = number | string | null | undefined;

const isEmpty = (v: SortValue) => v === null || v === undefined || v === "" || (typeof v === "number" && !Number.isFinite(v));

/** A new array ordered by `value`; rows with an empty value keep their original order at the END, whatever the direction. */
export function sortRows<T>(rows: T[], value: (row: T) => SortValue, dir: SortDir): T[] {
  const keyed = rows.map((row, index) => ({ row, index, v: value(row) }));
  const sign = dir === "asc" ? 1 : -1;
  keyed.sort((a, b) => {
    const ea = isEmpty(a.v), eb = isEmpty(b.v);
    if (ea || eb) return ea && eb ? a.index - b.index : ea ? 1 : -1;
    const c = typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : String(a.v).localeCompare(String(b.v), "ar", { numeric: true });
    return c === 0 ? a.index - b.index : c * sign;
  });
  return keyed.map(k => k.row);
}

/** The header click cycle: first click sorts (numbers highest first, text A→Z), the second reverses, the third restores the
 *  original order. Clicking another column starts that column's cycle. */
export function nextSort(current: SortState, key: string, numeric: boolean): SortState {
  const first: SortDir = numeric ? "desc" : "asc";
  if (!current || current.key !== key) return { key, dir: first };
  if (current.dir === first) return { key, dir: first === "asc" ? "desc" : "asc" };
  return null;
}

export function ariaSort(current: SortState, key: string): "ascending" | "descending" | "none" {
  return current && current.key === key ? (current.dir === "asc" ? "ascending" : "descending") : "none";
}

/** Text as typed by a teacher looking for a name: diacritics and tatweel dropped, alef / yaa / taa-marbuta forms unified,
 *  case and outer spaces ignored — «احمد» finds «أحمد». */
export function normalizeSearch(text: string): string {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** True when every word of the query occurs in the text (an empty query matches everything). */
export function matchesQuery(text: string, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const t = normalizeSearch(text);
  return q.split(" ").every(word => t.includes(word));
}
