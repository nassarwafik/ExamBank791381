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

// Reports R-6 (docs/enterprise-reports-period-basis-r6.md; owner decision D-2 with option (ب)) — the date an assessment belongs to
// in every report: the moment students could take it, i.e. the LATER of its first publication (`publishedAt`, stamped by the
// server) and its opening (`openAt`, a scheduled assessment). A document published before R-6 has no `publishedAt`: it keeps its
// creation date, and `fallback: true` says so (the documented fallback; nothing is migrated).
const validIso = v => typeof v === "string" && v !== "" && Number.isFinite(Date.parse(v));
function reportDateOf(a) {
  const published = a && validIso(a.publishedAt) ? a.publishedAt : null;
  if (!published) return { iso: a && typeof a.createdAt === "string" ? a.createdAt : "", fallback: true };
  const open = validIso(a.openAt) ? a.openAt : null;
  return { iso: open && Date.parse(open) > Date.parse(published) ? open : published, fallback: false };
}
/** The assessments of a report: those dated within the range, oldest first, and how many were dated by the fallback. */
function datedForReport(assignments, range) {
  const kept = (Array.isArray(assignments) ? assignments : []).map(a => ({ a, d: reportDateOf(a) })).filter(x => inRange(x.d.iso, range));
  kept.sort((x, y) => (Date.parse(x.d.iso) || 0) - (Date.parse(y.d.iso) || 0) || String(x.a.assignmentId || "").localeCompare(String(y.a.assignmentId || "")));
  return { assignments: kept.map(x => x.a), fallback: kept.filter(x => x.d.fallback).length };
}

module.exports = { parseDateRange, inRange, reportDateOf, datedForReport };
