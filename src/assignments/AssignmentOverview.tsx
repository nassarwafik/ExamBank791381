import ChartCard from "../ui/ChartCard";
import { IconEdit, IconHistory, IconEye, IconEyeOff } from "../icons";
import { attemptPolicyLabel } from "./attemptPolicy";
import { scoreDistribution, statusBreakdown, studentsCount } from "./assignmentPage";
import { RESULTS_RELEASE_OPTIONS, normalizeResultsRelease, resultsReleaseLabel, resultsReleaseState, type ResultsRelease } from "./resultsRelease";
import { latePolicyLabel, lateUntilIso, normalizeLatePolicy, type LatePolicy } from "./latePolicy";
import LatePolicyFields from "./LatePolicyFields";
import type { Item, StudentResult } from "./types";

/**
 * Phase 21G.3 — the assignment page's «نظرة عامة» section: the score distribution (final results only; pending reviews counted
 * apart), where the students stand, and the assignment's settings with their edit entry points. Every figure comes from the
 * gradebook rows the page already holds — no extra request. Charts are plain HTML bars inside ChartCard (a named figure + a table).
 */
export default function AssignmentOverview({ item, results, fmt, onEditDetails, onEditTiming, onEditAttempts, now, onResultsRelease, onReleaseResults, onLatePolicy, busy }: {
  item: Item;
  results: readonly StudentResult[];
  fmt: (value: string) => string;
  onEditDetails: (item: Item) => void;
  onEditTiming: (item: Item) => void;
  onEditAttempts: (item: Item) => void;
  /** Phase 21G.5 (D2) — the results release: the minute clock (for «بعد الموعد النهائي»), the mode editor and the manual publish. */
  now?: number;
  onResultsRelease?: (item: Item, mode: ResultsRelease) => void;
  onReleaseResults?: (item: Item, released: boolean) => void;
  /** D5 (item 10) — the late policy editor (null = no late submissions). */
  onLatePolicy?: (item: Item, value: LatePolicy | null) => void;
  busy?: boolean;
}) {
  const dist = scoreDistribution(results);
  const parts = statusBreakdown(results), total = results.length;
  const archived = item.status === "archived";
  const releaseMode = normalizeResultsRelease(item.resultsRelease), release = resultsReleaseState(item, now ?? 0, fmt);
  const distSummary = dist.graded
    ? "توزيع العلامات النهائية (" + studentsCount(dist.graded) + "): " + dist.bands.map(b => b.label + " " + b.count).join("، ")
    : "لا توجد علامات نهائية بعد";
  return (
    <div className="eb-assign-overview">
      <ChartCard
        title="توزيع العلامات"
        description={dist.pendingReview ? "العلامات النهائية فقط؛ لا يشمل " + studentsCount(dist.pendingReview) + " بانتظار التصحيح." : "العلامات النهائية لآخر محاولة لكل طالب."}
        ariaLabel={distSummary}
        table={{ columns: ["الفئة", "عدد الطلاب"], rows: dist.bands.map(b => [b.label, b.count]) }}
        empty={dist.graded ? undefined : <p className="eb-muted">لا توجد علامات نهائية بعد. يظهر التوزيع بعد تصحيح أول محاولة.</p>}
      >
        <ul className="eb-dist-bars">
          {dist.bands.map(b => (
            <li key={b.key} className="eb-dist-row" title={b.label + ": " + studentsCount(b.count)}>
              <span className="eb-dist-label">{b.label}</span>
              <span className="eb-dist-track"><span className="eb-dist-bar" style={{ inlineSize: (dist.largest ? b.count / dist.largest * 100 : 0) + "%" }} /></span>
              <span className="eb-dist-count">{b.count}</span>
            </li>
          ))}
        </ul>
      </ChartCard>

      <ChartCard
        title="حالة الطلاب"
        description={total ? studentsCount(total) + " في الصف." : undefined}
        ariaLabel={"حالة الطلاب: " + parts.map(p => p.label + " " + p.count).join("، ")}
        table={{ columns: ["الحالة", "عدد الطلاب"], rows: parts.map(p => [p.label, p.count]) }}
        empty={total ? undefined : <p className="eb-muted">لا يوجد طلاب في هذا الصف بعد.</p>}
      >
        <div className="eb-status-bar" aria-hidden="true">
          {parts.filter(p => p.count > 0).map(p => <span key={p.key} className={"eb-status-seg is-" + p.key} style={{ flexGrow: p.count }} />)}
        </div>
        <ul className="eb-status-legend">
          {parts.map(p => <li key={p.key}><span className={"eb-status-dot is-" + p.key} aria-hidden="true" />{p.label} <b>{p.count}</b></li>)}
        </ul>
      </ChartCard>

      <section className="eb-assign-settings" aria-labelledby="eb-assign-settings-title">
        <h3 id="eb-assign-settings-title" className="eb-subheading">إعدادات الواجب</h3>
        <dl className="eb-dl">
          <div><dt>يفتح</dt><dd>{fmt(item.openAt)}</dd></div>
          <div><dt>آخر موعد</dt><dd>{fmt(item.dueAt)}</dd></div>
          <div><dt>المحاولات</dt><dd>{item.maxAttempts || 1}</dd></div>
          <div><dt>مدة المحاولة</dt><dd>{item.durationMinutes ? item.durationMinutes + " دقيقة" : "بدون مؤقت"}</dd></div>
          <div><dt>طريقة المحاولة</dt><dd>{attemptPolicyLabel(item.attemptPolicy)}</dd></div>
          <div><dt>الأسئلة</dt><dd>{item.questionCount} سؤال · {item.totalMarks} علامة</dd></div>
          <div><dt>التسليم المتأخر</dt><dd>{latePolicyLabel(item.latePolicy)}{lateUntilIso(item.dueAt, item.latePolicy) && <small className="eb-release-state">حتى {fmt(lateUntilIso(item.dueAt, item.latePolicy))}</small>}</dd></div>
          <div><dt>إظهار النتائج</dt><dd>{resultsReleaseLabel(releaseMode)}<small className={"eb-release-state" + (release.visible ? " is-visible" : " is-hidden")}>{release.text}</small></dd></div>
        </dl>
        {!archived && onResultsRelease && (
          <div className="eb-release-controls">
            <label className="eb-release-mode">متى يرى الطلاب نتائجهم
              <select value={releaseMode} onChange={e => onResultsRelease(item, e.target.value as ResultsRelease)} disabled={busy}>
                {RESULTS_RELEASE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            {releaseMode === "manual" && onReleaseResults && (item.resultsReleasedAt
              ? <button type="button" className="eb-button is-small" onClick={() => onReleaseResults(item, false)} disabled={busy}><IconEyeOff size={16} />إخفاء النتائج عن الطلاب</button>
              : <button type="button" className="eb-button is-small is-primary" onClick={() => onReleaseResults(item, true)} disabled={busy}><IconEye size={16} />نشر النتائج للطلاب</button>)}
          </div>
        )}
        {!archived && onLatePolicy && <LatePolicyFields value={normalizeLatePolicy(item.latePolicy)} onChange={v => onLatePolicy(item, v)} disabled={busy || !item.dueAt} hint={item.dueAt ? "يسري على المحاولات التي تنتهي من الآن؛ المحاولات المتأخرة السابقة تحتفظ بخصمها." : "يحتاج التسليم المتأخر إلى موعد تسليم للواجب."} />}
        <div className="eb-assign-instructions">
          <h4 className="eb-assign-instructions-title">التعليمات</h4>
          <p>{item.instructions?.trim() || "لا توجد تعليمات."}</p>
        </div>
        {archived
          ? <p className="eb-muted">الواجب مؤرشف؛ استعده من قائمة المؤرشفة لتعديل إعداداته.</p>
          : <div className="eb-assign-settings-actions">
              <button type="button" className="eb-button is-small" onClick={() => onEditDetails(item)}><IconEdit size={16} />تعديل العنوان والتعليمات</button>
              <button type="button" className="eb-button is-small" onClick={() => onEditTiming(item)}><IconHistory size={16} />تعديل الوقت والموعد</button>
              <button type="button" className="eb-button is-small" onClick={() => onEditAttempts(item)}><IconEdit size={16} />تعديل عدد المحاولات</button>
            </div>}
      </section>
    </div>
  );
}
