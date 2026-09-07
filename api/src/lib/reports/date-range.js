// Pure date-range parsing/validation for the Reports Center. Timestamps are compared as ISO ms via
// Date.parse (no browser-locale parsing). A date-only `to` (YYYY-MM-DD) is inclusive to end-of-day.
const DAY = 86400000;

// parseDateRange(fromStr, toStr) -> { from: ms|null, to: ms|null }. Throws { httpStatus:400 } on an
// invalid date or when from > to.
function parseDateRange(fromStr, toStr) {
  const bound = (s, isEnd) => {
    const str = String(s == null ? "" : s).trim();
    if (!str) return null;
    const ms = Date.parse(str);
    if (!Number.isFinite(ms)) { const e = new Error("تاريخ غير صالح."); e.httpStatus = 400; throw e; }
    return (isEnd && /^\d{4}-\d{2}-\d{2}$/.test(str)) ? ms + DAY - 1 : ms;
  };
  const from = bound(fromStr, false);
  const to = bound(toStr, true);
  if (from !== null && to !== null && from > to) {
    const e = new Error("نطاق تاريخ غير صالح: \"من\" بعد \"إلى\".");
    e.httpStatus = 400;
    throw e;
  }
  return { from, to };
}

// True when an ISO timestamp falls within the range (an empty range matches everything; a missing
// timestamp is excluded from any non-empty range).
function inRange(iso, range) {
  if (!range || (range.from === null && range.to === null)) return true;
  if (!iso) return false;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  if (range.from !== null && ms < range.from) return false;
  if (range.to !== null && ms > range.to) return false;
  return true;
}

module.exports = { parseDateRange, inRange };
