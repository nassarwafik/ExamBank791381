// Pure formatting helpers for the Reports Center (Western digits only).
export function pct(n: number | null | undefined): string { return n === null || n === undefined ? "—" : Math.round(Number(n)) + "%"; }
/** ISO calendar day (YYYY-MM-DD, Western digits) for a timestamp; "—" when absent. */
export function isoDay(iso: string | null | undefined): string { return iso ? String(iso).slice(0, 10) : "—"; }
