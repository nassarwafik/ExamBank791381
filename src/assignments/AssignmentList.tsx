import { useState } from "react";
import { attemptPolicyLabel } from "./attemptPolicy";
import ActionMenu from "../ui/ActionMenu";
import StatusBadge from "../ui/StatusBadge";
import EmptyState from "../ui/EmptyState";
import Dialog from "../ui/Dialog";
import { IconUpload, IconEyeOff, IconEdit, IconArchive, IconRestore, IconTrash, IconHistory } from "../icons";
import ProgressBar from "../ui/ProgressBar";
import { STATUS_LABEL, type AssignmentProgress, type Item } from "./types";
import { timeLabel } from "./assignmentsHome";
import { SAVE_LABELS } from "../teacher/saveLabels";

// ISO → <input type="datetime-local"> value (local wall-clock). Empty/invalid → "" (no crash).
const toLocalInput = (iso: string) => { if (!iso) return ""; const d = new Date(iso); if (Number.isNaN(d.getTime())) return ""; return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

export type AssignmentListProps = {
  items: Item[];                       // rows for the current view (already class-filtered / searched / archived-switched by AssignmentsPanel)
  showArchived: boolean;
  hasAnyInScope: boolean;              // false → "no assignments" empty state, true with no rows → "no matches"
  selectedId: string;
  busy: boolean;
  loading: boolean;
  onOpen: (item: Item, trigger: HTMLElement | null) => void;
  onPublish: (item: Item) => void;
  onUnpublish: (item: Item) => void;
  onEditAttempts: (item: Item) => void;
  onEditTiming: (item: Item) => void;
  /** Phase 21G.0 — edit the title and instructions (absent → not offered). */
  onEditDetails?: (item: Item) => void;
  onArchive: (item: Item) => void;
  onRestore: (item: Item) => void;
  onPurge: (item: Item) => void;
  onCreate: () => void;
  fmt: (value: string) => string;
  /** Phase 21G.2 — the server progress per assignment (null = unavailable) and the clock the time chips are judged at. */
  progress?: ReadonlyMap<string, AssignmentProgress> | null;
  now?: number;
};

export default function AssignmentList(p: AssignmentListProps) {
  let empty: React.ReactNode = null;
  if (!p.loading && p.items.length === 0) {
    if (p.showArchived) empty = <EmptyState compact title="لا توجد واجبات مؤرشفة." description="الواجبات المؤرشفة تحتفظ بكل التسليمات والنتائج ويمكن استعادتها في أي وقت." />;
    else if (!p.hasAnyInScope) empty = <EmptyState title="لا توجد واجبات بعد." description="أنشئ أول واجب من امتحان محفوظ أو من مكتبة 791381." action={<button type="button" className="eb-button is-primary is-small" onClick={p.onCreate}>إنشاء واجب</button>} />;
    else empty = <EmptyState compact title="لا توجد واجبات مطابقة." description="جرّب كلمة بحث أخرى أو غيّر مرشح الصف." />;
  }
  return (
    <section className="eb-assign-list" aria-labelledby="eb-assign-list-title">
      <h2 id="eb-assign-list-title" className="eb-visually-hidden">{p.showArchived ? "الواجبات المؤرشفة" : "الواجبات الحالية"}</h2>
      {p.loading && p.items.length === 0 && <div className="platform-loading" role="status">جارٍ تحميل الواجبات...</div>}
      <ul className="assignment-list eb-assign-rows">
        {p.items.map(item => {
          const selected = item.assignmentId === p.selectedId;
          const archived = item.status === "archived";
          return (
            <li key={item.assignmentId} className={"assignment-row eb-assign-row" + (selected ? " selected" : "") + (archived ? " archived" : "")}>
              <div className="eb-assign-row-main">
                <div className="eb-assign-row-title"><strong>{item.title}</strong><StatusBadge tone={item.status === "published" ? "success" : item.status === "archived" ? "neutral" : "warn"} className={"assignment-status " + item.status}>{STATUS_LABEL[item.status]}</StatusBadge></div>
                <span className="eb-assign-row-meta">{item.className}{item.className ? " · " : ""}{item.questionCount} سؤال · {item.totalMarks} علامة · {item.maxAttempts || 1} محاولة · {item.durationMinutes ? item.durationMinutes + " دقيقة" : "بدون مؤقت"}{item.attemptPolicy && item.attemptPolicy !== "continuous" ? " · " + attemptPolicyLabel(item.attemptPolicy) : ""}</span>
                <small className="eb-assign-row-due">التسليم: {p.fmt(item.dueAt)}{archived && item.archivedAt ? " · أُرشف: " + p.fmt(item.archivedAt) : ""}</small>
                {p.now !== undefined && <RowProgress item={item} progress={p.progress?.get(item.assignmentId) || null} known={p.progress !== null && p.progress !== undefined} now={p.now} />}
              </div>
              <div className="eb-assign-row-actions">
                <button type="button" className="eb-button is-small" aria-pressed={selected} onClick={e => p.onOpen(item, e.currentTarget)} disabled={p.busy}>فتح</button>
                <ActionMenu label={"إجراءات الواجب " + item.title}>
                  {archived ? <>
                    <button type="button" className="eb-menu-item" onClick={() => p.onRestore(item)} disabled={p.busy}><IconRestore size={16} />استعادة</button>
                    <hr className="eb-menu-sep" />
                    <button type="button" className="eb-menu-item is-danger assignment-delete-button" onClick={() => p.onPurge(item)} disabled={p.busy}><IconTrash size={16} />حذف نهائي</button>
                  </> : <>
                    {item.status !== "published"
                      ? <button type="button" className="eb-menu-item" onClick={() => p.onPublish(item)} disabled={p.busy}><IconUpload size={16} />نشر</button>
                      : <button type="button" className="eb-menu-item" onClick={() => p.onUnpublish(item)} disabled={p.busy}><IconEyeOff size={16} />إيقاف النشر</button>}
                    {p.onEditDetails && <button type="button" className="eb-menu-item" onClick={() => p.onEditDetails?.(item)} disabled={p.busy}><IconEdit size={16} />تعديل العنوان والتعليمات</button>}
                    <button type="button" className="eb-menu-item" onClick={() => p.onEditAttempts(item)} disabled={p.busy}><IconEdit size={16} />تعديل عدد المحاولات</button>
                    <button type="button" className="eb-menu-item assignment-timing-button" onClick={() => p.onEditTiming(item)} disabled={p.busy}><IconHistory size={16} />تعديل الوقت والموعد</button>
                    <hr className="eb-menu-sep" />
                    <button type="button" className="eb-menu-item" onClick={() => p.onArchive(item)} disabled={p.busy}><IconArchive size={16} />أرشفة</button>
                  </>}
                </ActionMenu>
              </div>
            </li>
          );
        })}
      </ul>
      {empty}
    </section>
  );
}

/**
 * Phase 21G.2 — a row's time status and progress: the time chip (published only; a draft / archived row's badge already says it),
 * «بانتظار التصحيح» / «يحاولون الآن» counts when there are any, and the submission bar (submitted of the class's students). Every
 * figure is the server's (GET /api/assignment-progress, the gradebook's own rules); when progress is unavailable nothing is guessed.
 */
function RowProgress({ item, progress: g, known, now }: { item: Item; progress: AssignmentProgress | null; known: boolean; now: number }) {
  const t = timeLabel(item, now);
  if (!t) return null;
  return (
    <div className="eb-assign-row-progress">
      <div className="eb-assign-row-chips">
        <span className={"eb-time-chip tone-" + t.tone} data-time={t.status}>{t.label}</span>
        {g && g.pendingReview > 0 && <span className="eb-count-chip tone-attention">بانتظار التصحيح: {g.pendingReview}</span>}
        {g && g.active > 0 && <span className="eb-count-chip tone-info">يحاولون الآن: {g.active}</span>}
      </div>
      {g ? (g.expected > 0
        ? <ProgressBar value={g.submitted / g.expected * 100} label={"سلّم " + g.submitted + " من " + g.expected} size="sm" tone={g.submitted === g.expected ? "success" : "primary"} />
        : <small className="eb-muted">لا يوجد طلاب في هذا الصف بعد.</small>)
        : known ? null : <small className="eb-muted">تقدم التسليم غير متاح حاليًا.</small>}
    </div>
  );
}

/** Explicit max-attempts editor: cancel → no request, save → exactly one setMaxAttempts request (owned by AssignmentsPanel). */
export function MaxAttemptsDialog({ item, busy, onSave, onClose }: { item: Item | null; busy: boolean; onSave: (item: Item, maxAttempts: number) => void; onClose: () => void }) {
  return (
    <Dialog open={item !== null} title="تعديل عدد المحاولات" onClose={onClose} size="sm" hideClose>
      {item && <MaxAttemptsForm key={item.assignmentId} item={item} busy={busy} onSave={onSave} onClose={onClose} />}
    </Dialog>
  );
}
function MaxAttemptsForm({ item, busy, onSave, onClose }: { item: Item; busy: boolean; onSave: (item: Item, maxAttempts: number) => void; onClose: () => void }) {
  const [value, setValue] = useState(item.maxAttempts || 1);   // keyed by assignment → fresh per item
  return (
    <>
      <p className="eb-dialog-lead">الواجب: <strong>{item.title}</strong></p>
      <div className="eb-form-grid">
        <label>عدد المحاولات المسموح بها<select value={value} onChange={e => setValue(Number(e.target.value))}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} {n === 1 ? "محاولة" : "محاولات"}</option>)}</select></label>
      </div>
      <div className="eb-dialog-foot eb-dialog-foot-inline"><button type="button" className="eb-button" onClick={onClose}>إلغاء</button><button type="button" className="eb-button is-primary" onClick={() => onSave(item, value)} disabled={busy || value === (item.maxAttempts || 1)}>{SAVE_LABELS.saveChanges}</button></div>
    </>
  );
}

/**
 * Phase 5A — class-wide time & deadline editor. A focused dialog (not the full assignment editor): it moves
 * the submission deadline (primarily an EXTENSION of an expired assignment) and optionally the default attempt
 * duration. It changes TIME AVAILABILITY only — it never resets attempts or grants an exhausted student a new
 * attempt; that is decided entirely by the server-authoritative attempt lifecycle. cancel → no request; save →
 * exactly one updateTiming request (owned by AssignmentsPanel). Keyed by assignment → fresh fields per item.
 */
export function AssignmentTimingDialog({ item, busy, onSave, onClose, fmt }: { item: Item | null; busy: boolean; onSave: (item: Item, dueAtIso: string, durationMinutes: number) => void; onClose: () => void; fmt: (value: string) => string }) {
  return (
    <Dialog open={item !== null} title="تعديل الوقت والموعد" onClose={onClose} size="sm" className="assignment-timing-dialog" hideClose>
      {item && <AssignmentTimingForm key={item.assignmentId} item={item} busy={busy} onSave={onSave} onClose={onClose} fmt={fmt} />}
    </Dialog>
  );
}
function AssignmentTimingForm({ item, busy, onSave, onClose, fmt }: { item: Item; busy: boolean; onSave: (item: Item, dueAtIso: string, durationMinutes: number) => void; onClose: () => void; fmt: (value: string) => string }) {
  const [dueLocal, setDueLocal] = useState(toLocalInput(item.dueAt));   // keyed by assignment → fresh per item
  const [duration, setDuration] = useState<number>(item.durationMinutes || 0);
  const dueMs = dueLocal ? new Date(dueLocal).getTime() : 0;
  const validDate = !!dueMs && Number.isFinite(dueMs);
  const inFuture = validDate && dueMs > Date.now();
  const dueIso = validDate ? new Date(dueLocal).toISOString() : "";
  return (
    <>
      <p className="eb-dialog-lead">الواجب: <strong>{item.title}</strong></p>
      <dl className="eb-dl">
        <div><dt>موعد التسليم الحالي</dt><dd>{fmt(item.dueAt)}</dd></div>
        <div><dt>مدة المحاولة الحالية</dt><dd>{item.durationMinutes ? item.durationMinutes + " دقيقة" : "بدون مؤقت"}</dd></div>
      </dl>
      <div className="eb-form-grid">
        <label>موعد التسليم الجديد<input type="datetime-local" className="assignment-timing-due" value={dueLocal} onChange={e => setDueLocal(e.target.value)} /></label>
        <label>مدة المحاولة الجديدة (دقائق · 0 = بدون مؤقت)<input type="number" min={0} max={1440} step={1} className="assignment-timing-duration" value={duration} onChange={e => setDuration(Math.max(0, Math.min(1440, Math.floor(Number(e.target.value) || 0))))} /></label>
      </div>
      {dueLocal && !inFuture && <p className="platform-warning assignment-timing-future-warning" role="status">يجب أن يكون موعد التسليم الجديد في المستقبل.</p>}
      <p className="eb-muted assignment-timing-eligibility-hint">تمديد الموعد يعيد إتاحة الواجب فقط للطلاب الذين ما زالت لديهم محاولات متبقية.</p>
      <p className="eb-muted assignment-timing-exhausted-hint">الطلاب الذين استنفدوا جميع المحاولات لن يحصلوا على محاولة إضافية.</p>
      <p className="eb-muted assignment-timing-active-hint">تغيير مدة المحاولة يسري على المحاولات الجديدة فقط، ولا يعيد ضبط محاولة مؤقتة بدأت بالفعل.</p>
      <div className="eb-dialog-foot eb-dialog-foot-inline">
        <button type="button" className="eb-button" onClick={onClose}>إلغاء</button>
        <button type="button" className="eb-button is-primary assignment-timing-save" onClick={() => onSave(item, dueIso, duration)} disabled={busy || !inFuture}>{SAVE_LABELS.saveChanges}</button>
      </div>
    </>
  );
}

/**
 * Phase 21G.0 — edit the title and instructions. Allowed at any time (also after students started): they are presentation only;
 * the questions, marks, timing and attempts are not touched. cancel → no request; save → exactly one updateDetails request
 * (owned by AssignmentsPanel). Keyed by assignment → fresh fields per item.
 */
export const MAX_ASSIGNMENT_TITLE = 200;
export const MAX_ASSIGNMENT_INSTRUCTIONS = 5000;
export function AssignmentDetailsDialog({ item, busy, onSave, onClose }: { item: Item | null; busy: boolean; onSave: (item: Item, title: string, instructions: string) => void; onClose: () => void }) {
  return (
    <Dialog open={item !== null} title="تعديل العنوان والتعليمات" onClose={onClose} size="sm" hideClose>
      {item && <AssignmentDetailsForm key={item.assignmentId} item={item} busy={busy} onSave={onSave} onClose={onClose} />}
    </Dialog>
  );
}
function AssignmentDetailsForm({ item, busy, onSave, onClose }: { item: Item; busy: boolean; onSave: (item: Item, title: string, instructions: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState(item.title || "");
  const [instructions, setInstructions] = useState(item.instructions || "");
  const cleanTitle = title.trim(), cleanInstructions = instructions.trim();
  const titleError = !cleanTitle ? "عنوان الواجب مطلوب." : cleanTitle.length > MAX_ASSIGNMENT_TITLE ? "عنوان الواجب أطول من " + MAX_ASSIGNMENT_TITLE + " حرفًا." : "";
  const instructionsError = cleanInstructions.length > MAX_ASSIGNMENT_INSTRUCTIONS ? "التعليمات أطول من " + MAX_ASSIGNMENT_INSTRUCTIONS + " حرف." : "";
  const unchanged = cleanTitle === (item.title || "").trim() && cleanInstructions === (item.instructions || "").trim();
  return (
    <>
      <p className="eb-dialog-lead">يمكن تعديل العنوان والتعليمات في أي وقت؛ لا يتغير شيء في الأسئلة أو العلامات أو المحاولات.</p>
      <div className="eb-form-grid">
        <label>عنوان الواجب<input value={title} onChange={e => setTitle(e.target.value)} aria-invalid={titleError ? true : undefined} aria-describedby={titleError ? "eb-details-title-error" : undefined} /></label>
        {titleError && <p id="eb-details-title-error" className="eb-field-error" role="alert">{titleError}</p>}
        <label>التعليمات<textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={5} aria-invalid={instructionsError ? true : undefined} aria-describedby={instructionsError ? "eb-details-instructions-error" : undefined} /></label>
        {instructionsError && <p id="eb-details-instructions-error" className="eb-field-error" role="alert">{instructionsError}</p>}
      </div>
      <div className="eb-dialog-foot eb-dialog-foot-inline">
        <button type="button" className="eb-button" onClick={onClose}>إلغاء</button>
        <button type="button" className="eb-button is-primary" onClick={() => onSave(item, cleanTitle, cleanInstructions)} disabled={busy || unchanged || !!titleError || !!instructionsError}>{SAVE_LABELS.saveChanges}</button>
      </div>
    </>
  );
}
