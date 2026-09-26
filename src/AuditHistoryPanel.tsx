import { useEffect, useMemo, useRef, useState } from "react";
import { IconSearch } from "./icons";
import { type AuditEvent, AUDIT_VISIBLE_LIMIT, auditActionLabel, auditTargetTypeLabel, filterAuditEvents, newestAuditEvents } from "./auditLog";

// Roadmap #19 — compact builder/admin activity-log surface (سجل النشاط). Loads the bounded, redacted
// history from /api/audit-history once (server enforces the newest-window bound + redaction), then does
// all filtering/search CLIENT-SIDE over that loaded set. No charts, no export, no pagination (deferred).

type Props = { token: string };

const fmtDate = (value: string) => (value ? new Date(value).toLocaleString("ar") : "—");

// A short, safe one-line description from the already-redacted details. Only known aggregate/idempotent
// fields are surfaced; anything else is ignored (the value is never a secret — the server redacted it).
function describeDetails(ev: AuditEvent): string {
  const d = ev.details || {};
  const parts: string[] = [];
  if (typeof d.createdCount === "number") parts.push("أُنشئ: " + d.createdCount);
  if (typeof d.duplicateCount === "number") parts.push("مكرر: " + d.duplicateCount);
  if (typeof d.failedCount === "number") parts.push("فشل: " + d.failedCount);
  if (typeof d.graduationYear === "string" && d.graduationYear) parts.push("دفعة " + d.graduationYear);
  if (Array.isArray(d.programCodes)) parts.push("مشاريع: " + (d.programCodes.length ? d.programCodes.join("، ") : "بدون"));
  if (typeof d.grade === "string" && d.grade) parts.push(d.grade);
  return parts.join(" · ");
}

function AuditHistoryPanel({ token }: Props) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  // Phase 8B — presentation paging over the already-loaded window: the newest 30 first, «عرض المزيد» reveals the next
  // 30 (30 → 60 → 90 → 100). A reload keeps the expansion; a search/filter change starts again at 30.
  const [requested, setRequested] = useState(AUDIT_VISIBLE_LIMIT);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const focusRow = useRef<number | null>(null);

  async function load() {
    setLoading(true); setError("");
    try {
      const headers = new Headers();
      headers.set("x-builder-token", token);
      headers.set("Authorization", "Bearer " + token);
      const response = await fetch("/api/audit-history?limit=100", { headers });
      const result = await response.json() as { ok?: boolean; events?: AuditEvent[]; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "تعذر تحميل سجل النشاط.");
      setEvents(result.events || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل سجل النشاط.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Distinct action values present in the loaded history, for the action filter dropdown.
  const actionsPresent = useMemo(() => Array.from(new Set(events.map(e => e.action))).sort(), [events]);
  const filtered = useMemo(
    () => filterAuditEvents(events, { q, action: actionFilter, targetType: typeFilter }),
    [events, q, actionFilter, typeFilter]
  );
  // Phase 8B — the table shows the newest 30 matches (the loaded window stays the server's bounded 100 so search and
  // filters still reach within it; nothing is deleted or re-fetched).
  const visible = useMemo(() => newestAuditEvents(filtered, requested), [filtered, requested]);
  // After «عرض المزيد», keyboard focus moves to the first newly revealed row (never lost on the removed button).
  useEffect(() => {
    if (focusRow.current === null) return;
    const row = bodyRef.current?.children.item(focusRow.current) as HTMLElement | null | undefined;
    focusRow.current = null;
    row?.focus();
  });
  function showMore() {
    focusRow.current = visible.length;
    setRequested(visible.length + AUDIT_VISIBLE_LIMIT);
  }
  function resetWindow() { setRequested(AUDIT_VISIBLE_LIMIT); }

  return (
    <section className="teacher-platform" dir="rtl"><div className="teacher-platform-inner">
      <section className="platform-hero">
        <div><span className="platform-eyebrow">Audit</span><h2>سجل النشاط</h2><p>أحدث العمليات الحساسة على الصفوف والطلاب والواجبات (يُعرض أحدث {AUDIT_VISIBLE_LIMIT} سجلًا).</p></div>
        <button onClick={() => void load()} disabled={loading}>↻ تحديث</button>
      </section>

      {error && <div className="platform-error">{error}</div>}

      <section className="platform-card">
        <div className="student-toolbar-pro">
          <div className="student-search-field eb-search-field">
            <IconSearch size={16} aria-hidden="true" />
            <input value={q} onChange={e => { setQ(e.target.value); resetWindow(); }} placeholder="ابحث بالهدف أو نوع العملية" aria-label="ابحث في سجل النشاط" />
          </div>
          <select className="student-status-select" value={actionFilter} onChange={e => { setActionFilter(e.target.value); resetWindow(); }} aria-label="تصفية حسب العملية">
            <option value="">كل العمليات</option>
            {actionsPresent.map(a => <option key={a} value={a}>{auditActionLabel(a)}</option>)}
          </select>
          <select className="student-status-select" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); resetWindow(); }} aria-label="تصفية حسب النوع">
            <option value="">كل الأنواع</option>
            <option value="class">صف</option>
            <option value="student">طالب</option>
            <option value="assignment">واجب</option>
          </select>
        </div>

        {!loading && filtered.length > visible.length && <p className="eb-muted audit-history-limit" role="note">يُعرض أحدث {visible.length} من {filtered.length} سجلًا مطابقًا.</p>}
        {loading && <div className="platform-loading">⏳ جارٍ تحميل السجل...</div>}
        {!loading && (
          <div className="students-table-wrap"><table className="students-table audit-history-table">
            <thead><tr><th>التاريخ والوقت</th><th>العملية</th><th>النوع</th><th>الهدف</th><th>تفاصيل</th></tr></thead>
            <tbody ref={bodyRef}>
              {visible.map(ev => (
                <tr key={ev.eventId} tabIndex={-1}>
                  <td dir="ltr">{fmtDate(ev.timestamp)}</td>
                  <td>{auditActionLabel(ev.action)}</td>
                  <td>{auditTargetTypeLabel(ev.targetType)}</td>
                  <td>{ev.targetLabel || ev.targetId || "—"}</td>
                  <td>{describeDetails(ev) || "—"}</td>
                </tr>
              ))}
              {!visible.length && <tr><td colSpan={5}>لا توجد أحداث مطابقة.</td></tr>}
            </tbody>
          </table></div>
        )}
        {!loading && filtered.length > visible.length && (
          <div className="audit-history-more">
            <button type="button" className="eb-button is-quiet" onClick={showMore}>عرض المزيد</button>
          </div>
        )}
      </section>
    </div></section>
  );
}

export default AuditHistoryPanel;
