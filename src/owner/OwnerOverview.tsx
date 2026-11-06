import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import KpiStrip from "../ui/KpiStrip";
import EmptyState from "../ui/EmptyState";
import { ownerTeachersApi, ownerSchoolsApi, ownerAccessApi, ownerLegacyApi } from "./ownerApi";
import { attentionItems, overviewNumbers, MODE_LABEL, type OverviewSources, type OverviewSection } from "./ownerOverview";

/**
 * UX-O1 — the numbers and «يحتاج انتباهك» of «نظرة عامة» (design docs/enterprise-ux-owner-console-o1.md). Five READ requests the console
 * already makes elsewhere, in parallel, once per visit; nothing is written. A source that fails shows «—» (its lines are left out)
 * and the rest of the page stays; a 401 from any of them signs the owner out, exactly like every other section.
 */
const EMPTY: OverviewSources = { teachers: null, schools: null, mode: null, readiness: null, legacyClasses: null };

export default function OwnerOverview({ token, onSignedOut, onSection, aside }: { token: string; onSignedOut: () => void; onSection: (s: OverviewSection) => void; aside?: ReactNode }) {
  const [sources, setSources] = useState<OverviewSources>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    void Promise.all([ownerTeachersApi.list(token), ownerSchoolsApi.list(token), ownerAccessApi.get(token), ownerAccessApi.readiness(token), ownerLegacyApi.inventory(token)])
      .then(([t, s, a, r, l]) => {
        if (!live) return;
        if ([t, s, a, r, l].some(x => !x.ok && x.status === 401)) { onSignedOut(); return; }
        setSources({
          teachers: t.ok ? t.data.teachers : null,
          schools: s.ok ? s.data.schools : null,
          mode: a.ok ? a.data.mode : r.ok ? r.data.mode : null,
          readiness: r.ok ? { ready: r.data.ready, teachers: r.data.teachers } : null,
          legacyClasses: l.ok ? l.data.classes : null
        });
        setLoading(false);
      });
    return () => { live = false; };
  }, [token, onSignedOut]);

  const n = overviewNumbers(sources);
  const v = (x: number | null) => (loading ? "…" : x === null ? "—" : String(x));
  const unread = (x: unknown) => (!loading && x === null ? "تعذّر التحميل" : undefined);
  const items = loading ? [] : attentionItems(sources);

  return (
    <>
      <KpiStrip className="eb-owner-kpis" label="أرقام المنصة" items={[
        { label: "معلمون نشطون", value: v(n.active), hint: unread(n.active) ?? (n.total === null ? undefined : "من " + n.total + " حسابات") },
        { label: "بانتظار كلمة المرور", value: v(n.invited), hint: unread(n.invited) ?? "دعوة لم تُقبل" },
        { label: "موقوفون", value: v(n.suspended), hint: unread(n.suspended) ?? "لا يدخلون" },
        { label: "تجارب تنتهي قريبًا", value: v(n.trialsEndingSoon), hint: unread(n.trialsEndingSoon) ?? (n.trialsEnded ? n.trialsEnded + " انتهت" : "خلال أسبوع") },
        { label: "المدارس", value: v(n.schools), hint: unread(n.schools) ?? (n.withoutSchool ? (n.withoutSchool === 1 ? "معلم واحد بلا مدرسة" : n.withoutSchool + " معلمين بلا مدرسة") : "كل المعلمين مربوطون") },
        { label: "وضع الصلاحيات", value: loading ? "…" : n.mode === null ? "—" : <span className={"eb-owner-mode eb-owner-mode--" + n.mode}>{MODE_LABEL[n.mode]}</span>,
          hint: unread(n.mode) ?? (n.ready === null ? undefined : n.mode === "enforce" ? "مفعّل" : n.ready ? "الكل جاهز للتطبيق" : "معلمون بلا حزمة") }
      ]} />
      <div className="eb-owner-overview-grid">
        <section className="eb-owner-panel eb-owner-attention" aria-labelledby="eb-owner-attention-title">
          <h2 id="eb-owner-attention-title" className="eb-owner-h2">يحتاج انتباهك{items.length > 0 && <span className="eb-owner-count" aria-label={items.length + " بنود"}>{items.length}</span>}</h2>
          {loading && <p className="eb-owner-hint" role="status">جارٍ تحميل حالة المنصة…</p>}
          {!loading && items.length === 0 && <EmptyState compact title="لا شيء يحتاج انتباهك الآن" description="كل الدعوات مقبولة، ولا تجارب على وشك الانتهاء، ولكل معلم حزمته." />}
          {items.length > 0 && (
            <ul className="eb-owner-attention-list" aria-label="يحتاج انتباهك">
              {items.map(item => (
                <li key={item.id} className={"eb-owner-attention-item is-" + item.tone}>
                  <span className="eb-owner-attention-dot" aria-hidden="true" />
                  <div className="eb-owner-attention-text"><strong>{item.title}</strong><span>{item.detail}</span></div>
                  <button type="button" className="eb-owner-secondary eb-owner-small" onClick={() => onSection(item.section)}>{item.action}</button>
                </li>
              ))}
            </ul>
          )}
        </section>
        {aside && <div className="eb-owner-overview-aside">{aside}</div>}
      </div>
    </>
  );
}
