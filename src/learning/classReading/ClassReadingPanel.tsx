import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import SectionHeader from "../../ui/SectionHeader";
import ProgressBar from "../../ui/ProgressBar";
import StatusBadge from "../../ui/StatusBadge";
import { useConfirm } from "../../ui/useConfirm";
import { normalizeClassStatus } from "../../classLifecycle";
import { classLearningMaterials } from "../../students/classLearningMaterials";
import type { Classroom, LearningCatalogModule } from "../../students/types";
import { arabicCount, PUBLISHED_MODULES, STUDENTS } from "../arabicCount";
import type { ClassReading, ClassReadingClient } from "./classReadingClient";
import "./class-reading.css";

// Phase L.4 — «قراءة صفوفي» on the teacher's book page: for each of the teacher's ACTIVE classes that use this book, which
// units are published to it (and publishing / hiding them right here), how far the class has read each published unit, and
// who has not started or has stopped reading. Nothing is requested until the teacher opens the panel (the book page stays
// request-free otherwise). Per-unit counts only: the teacher never sees which exact pages a student read (decision L4-a).
// Inactivity is measured against the server's `generatedAt`, never this device's clock.

/** A student whose last reading is at least this many days before the report is listed as «توقّف عن القراءة». */
export const INACTIVE_DAYS = 7;
const DAY_MS = 86_400_000;

type Load<T> = { state: "idle" } | { state: "loading" } | { state: "ready"; value: T } | { state: "error"; message: string };
const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const pct = (read: number, total: number) => (total > 0 ? Math.round((read / total) * 100) : 0);
const dateText = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("ar", { day: "numeric", month: "long", year: "numeric" });
};

export default function ClassReadingPanel({ courseId, client }: { courseId: string; client: ClassReadingClient }) {
  const regionId = "eb-lm-cr-region-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState<Load<{ classes: Classroom[]; units: LearningCatalogModule[] }>>({ state: "idle" });
  const [baseAttempt, setBaseAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [reading, setReading] = useState<Load<ClassReading>>({ state: "idle" });
  const [readingAttempt, setReadingAttempt] = useState(0);
  const [managing, setManaging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const { confirm, confirmDialog } = useConfirm();
  // The class whose report is being shown NOW: a response for a class the teacher has since left is never committed.
  const selectedRef = useRef("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.all([client.classes(), client.catalog()]).then(([classes, catalog]) => {
      if (!active) return;
      const units = (catalog.find(c => c.courseId === courseId)?.modules ?? []).slice().sort((a, b) => a.order - b.order);
      setBase({ state: "ready", value: { classes, units } });
    }).catch(e => { if (active) setBase({ state: "error", message: errorText(e, "تعذر تحميل الصفوف.") }); });
    return () => { active = false; };
  }, [open, client, courseId, baseAttempt]);

  const activeClasses = useMemo(() => (base.state === "ready" ? base.value.classes.filter(c => normalizeClassStatus(c) === "active") : []), [base]);
  const usingClasses = useMemo(() => activeClasses.filter(c => classLearningMaterials(c).some(e => e.courseId === courseId)), [activeClasses, courseId]);
  const otherClasses = useMemo(() => activeClasses.filter(c => !classLearningMaterials(c).some(e => e.courseId === courseId)), [activeClasses, courseId]);
  // The selection follows the first class that uses the book until the teacher picks one.
  const selected = usingClasses.find(c => c.classId === selectedId) ?? usingClasses[0] ?? null;
  const selectedClassId = selected?.classId ?? "";
  const visibleIds = useMemo(() => new Set(classLearningMaterials(selected).find(e => e.courseId === courseId)?.visibleModuleIds ?? []), [selected, courseId]);
  const units = base.state === "ready" ? base.value.units : [];
  useEffect(() => { selectedRef.current = selectedClassId; }, [selectedClassId]);

  useEffect(() => {
    if (!selectedClassId) return;
    let active = true;
    client.reading(selectedClassId, courseId).then(value => {
      if (active) setReading({ state: "ready", value });
    }).catch(e => { if (active) setReading({ state: "error", message: errorText(e, "تعذر تحميل قراءة الصف حاليًا.") }); });
    return () => { active = false; };
  }, [client, courseId, selectedClassId, readingAttempt]);

  const toggleOpen = () => {
    if (!open && base.state !== "ready") setBase({ state: "loading" });
    setOpen(v => !v);
  };
  const choose = (classId: string) => {
    if (classId === selectedClassId) return;
    setReading({ state: "loading" }); setSelectedId(classId); setNotice(""); setActionError("");
  };
  const refreshReading = () => { setReading({ state: "loading" }); setReadingAttempt(n => n + 1); };
  const commit = useCallback((classId: string, materials: Classroom["learningMaterials"]) => {
    setBase(prev => (prev.state === "ready" ? { state: "ready", value: { ...prev.value, classes: prev.value.classes.map(c => (c.classId === classId ? { ...c, learningMaterials: materials } : c)) } } : prev));
  }, []);

  async function publish(classroom: Classroom, next: string[], message: string) {
    setBusy(true); setNotice(""); setActionError("");
    try {
      const materials = await client.publish(classroom.classId, courseId, next);
      commit(classroom.classId, materials);
      setNotice(message);
      if (selectedRef.current === classroom.classId) refreshReading();
    } catch (e) {
      setActionError(errorText(e, "تعذر تعديل المواد التعليمية للصف."));
    } finally { setBusy(false); }
  }
  async function toggleUnit(unit: LearningCatalogModule, show: boolean) {
    if (!selected || busy) return;
    if (!show && !(await confirm({ message: "ستختفي وحدة «" + unit.title + "» عن طلاب «" + selected.name + "». لن يُحذف المحتوى ولا ما قرأه الطلاب، ويمكن نشرها مرة أخرى.", confirmLabel: "إخفاء عن الطلاب" }))) return;
    const wanted = new Set(visibleIds);
    if (show) wanted.add(unit.moduleId); else wanted.delete(unit.moduleId);
    const next = units.map(u => u.moduleId).filter(id => wanted.has(id));
    await publish(selected, next, show ? "✓ نُشرت وحدة «" + unit.title + "» لطلاب «" + selected.name + "»." : "✓ أُخفيت وحدة «" + unit.title + "» عن طلاب «" + selected.name + "» (المحتوى محفوظ).");
  }
  async function attach(classId: string) {
    const classroom = otherClasses.find(c => c.classId === classId);
    if (!classroom || busy) return;
    await publish(classroom, [], "✓ أُضيف الكتاب إلى «" + classroom.name + "». لم تُنشر أي وحدة بعد — انشر الوحدات عندما تكون جاهزة.");
    setReading({ state: "loading" }); setSelectedId(classroom.classId); setManaging(true);
  }

  return (
    <section className="eb-lm-cr" aria-labelledby={regionId + "-title"}>
      <SectionHeader
        level={3}
        id={regionId + "-title"}
        title="قراءة صفوفي"
        description="الوحدات المنشورة لكل صف من صفوفك، وكم قرأ طلابه منها، ومن لم يبدأ أو توقّف."
        actions={
          <button type="button" className="eb-button is-small" aria-expanded={open} aria-controls={regionId} onClick={toggleOpen}>
            {open ? "إخفاء قراءة الصفوف" : "عرض قراءة الصفوف"}
          </button>
        }
      />
      <div id={regionId} hidden={!open} className="eb-lm-cr-body">
        {open && base.state === "loading" && <p className="eb-muted eb-lm-cr-status" role="status">جارٍ تحميل صفوفك…</p>}
        {open && base.state === "error" && (
          <div className="eb-lm-batches-error" role="alert">
            <span>{base.message}</span>
            <button type="button" className="eb-button is-small" onClick={() => { setBase({ state: "loading" }); setBaseAttempt(n => n + 1); }}>إعادة المحاولة</button>
          </div>
        )}
        {open && base.state === "ready" && (
          <>
            {usingClasses.length === 0 && <p className="eb-lm-cr-empty">لم يُضَف هذا الكتاب إلى أيٍّ من صفوفك النشطة بعد.</p>}
            {usingClasses.length > 0 && selected && (
              <div className="eb-lm-cr-pick">
                <label className="eb-lm-filter">
                  <span className="eb-lm-filter-label">الصف</span>
                  <select className="eb-lm-filter-select" value={selected.classId} onChange={e => choose(e.target.value)} disabled={busy}>
                    {usingClasses.map(c => <option key={c.classId} value={c.classId}>{c.name}</option>)}
                  </select>
                </label>
                <p className="eb-lm-cr-publine">
                  <StatusBadge tone={visibleIds.size ? "info" : "warn"}>{arabicCount(units.filter(u => visibleIds.has(u.moduleId)).length, PUBLISHED_MODULES)}</StatusBadge>
                  <span className="eb-muted">من أصل {units.length}</span>
                  <button type="button" className="eb-button is-quiet is-small" aria-expanded={managing} aria-controls={regionId + "-publish"} onClick={() => setManaging(v => !v)}>
                    {managing ? "إغلاق إدارة النشر" : "إدارة النشر"}
                  </button>
                </p>
              </div>
            )}
            {notice && <p className="eb-lm-cr-notice" role="status">{notice}</p>}
            {actionError && <p className="eb-lm-batches-error" role="alert">{actionError}</p>}
            {selected && managing && (
              <fieldset id={regionId + "-publish"} className="eb-lm-cr-publish" disabled={busy}>
                <legend>الوحدات المنشورة لطلاب «{selected.name}»</legend>
                <ul>
                  {units.map(u => (
                    <li key={u.moduleId}>
                      <label>
                        <input type="checkbox" checked={visibleIds.has(u.moduleId)} onChange={e => { void toggleUnit(u, e.target.checked); }} />
                        <span>{u.title}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}
            {selected && <ClassReadingReport reading={reading} className={selected.name} onRetry={refreshReading} />}
            {otherClasses.length > 0 && <AttachToClass classes={otherClasses} busy={busy} onAttach={id => { void attach(id); }} />}
          </>
        )}
      </div>
      {confirmDialog}
    </section>
  );
}

function AttachToClass({ classes, busy, onAttach }: { classes: Classroom[]; busy: boolean; onAttach: (classId: string) => void }) {
  const [classId, setClassId] = useState(classes[0]?.classId ?? "");
  const value = classes.some(c => c.classId === classId) ? classId : classes[0]?.classId ?? "";
  return (
    <div className="eb-lm-cr-attach">
      <label className="eb-lm-filter">
        <span className="eb-lm-filter-label">إضافة الكتاب إلى صف آخر</span>
        <select className="eb-lm-filter-select" value={value} onChange={e => setClassId(e.target.value)} disabled={busy}>
          {classes.map(c => <option key={c.classId} value={c.classId}>{c.name}</option>)}
        </select>
      </label>
      <button type="button" className="eb-button is-small" disabled={busy || !value} onClick={() => onAttach(value)}>إضافة إلى الصف</button>
    </div>
  );
}

function ClassReadingReport({ reading, className, onRetry }: { reading: Load<ClassReading>; className: string; onRetry: () => void }) {
  if (reading.state === "idle" || reading.state === "loading") return <p className="eb-muted eb-lm-cr-status" role="status">جارٍ تحميل قراءة «{className}»…</p>;
  if (reading.state === "error") {
    return (
      <div className="eb-lm-batches-error" role="alert">
        <span>{reading.message}</span>
        <button type="button" className="eb-button is-small" onClick={onRetry}>إعادة المحاولة</button>
      </div>
    );
  }
  const r = reading.value;
  if (r.modules.length === 0) return <p className="eb-lm-cr-empty">لا وحدات منشورة لهذا الصف بعد — انشر وحدة ليبدأ الطلاب القراءة.</p>;
  if (r.students.length === 0) return <p className="eb-lm-cr-empty">لا طلاب في هذا الصف بعد.</p>;
  const reference = Date.parse(r.generatedAt);
  const started = r.students.filter(s => s.readPages > 0);
  const notStarted = r.students.filter(s => s.readPages === 0);
  const inactive = Number.isFinite(reference) ? started.filter(s => s.lastReadAt && reference - Date.parse(s.lastReadAt) >= INACTIVE_DAYS * DAY_MS) : [];
  const readTotal = r.students.reduce((n, s) => n + s.readPages, 0);
  const students = r.students.slice().sort((a, b) => a.displayName.localeCompare(b.displayName, "ar"));
  return (
    <div className="eb-lm-cr-report">
      <dl className="eb-lm-cr-kpis">
        <div><dt>الطلاب</dt><dd>{arabicCount(r.students.length, STUDENTS)}</dd></div>
        <div><dt>بدأوا القراءة</dt><dd>{started.length} من {r.students.length}</dd></div>
        <div><dt>متوسط ما قُرئ</dt><dd>{pct(readTotal, r.students.length * r.totalPages)}%</dd></div>
      </dl>
      <div className="eb-lm-cr-scroll" role="region" aria-label="القراءة حسب الوحدة" tabIndex={0}>
        <table className="eb-lm-cr-table">
          <caption>القراءة حسب الوحدة</caption>
          <thead><tr><th scope="col">الوحدة</th><th scope="col">بدأها</th><th scope="col">أنهاها</th><th scope="col">متوسط ما قُرئ</th></tr></thead>
          <tbody>
            {r.modules.map(m => (
              <tr key={m.moduleId}>
                <th scope="row">{m.title}</th>
                <td>{m.started} من {r.students.length}</td>
                <td>{m.completed} من {r.students.length}</td>
                <td><ProgressBar value={m.averageRead} size="sm" ariaLabel={"متوسط ما قُرئ من «" + m.title + "»"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="eb-lm-cr-attention">
        <AttentionList title="لم يبدأوا القراءة بعد" names={notStarted.map(s => s.displayName || s.code)} />
        <AttentionList title={"توقّفوا عن القراءة منذ " + INACTIVE_DAYS + " أيام أو أكثر"} names={inactive.map(s => (s.displayName || s.code) + " — آخر قراءة " + dateText(s.lastReadAt!))} />
      </div>
      <div className="eb-lm-cr-scroll" role="region" aria-label="قراءة كل طالب" tabIndex={0}>
        <table className="eb-lm-cr-table">
          <caption>قراءة كل طالب</caption>
          <thead><tr><th scope="col">الطالب</th><th scope="col">ما قرأه</th><th scope="col">آخر قراءة</th></tr></thead>
          <tbody>
            {students.map(s => (
              <tr key={s.userId}>
                <th scope="row">{s.displayName || s.code}</th>
                <td><ProgressBar value={pct(s.readPages, s.totalPages)} size="sm" label={s.readPages + " من " + s.totalPages + " صفحة"} ariaLabel={"ما قرأه " + (s.displayName || s.code)} /></td>
                <td>{s.lastReadAt ? dateText(s.lastReadAt) : "لم يبدأ بعد"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="eb-muted eb-lm-cr-foot">
        محدّث حتى {dateText(r.generatedAt)} · تُحسب الوحدات المنشورة للصف الآن فقط.
        <button type="button" className="eb-button is-quiet is-small" onClick={onRetry}>تحديث</button>
      </p>
    </div>
  );
}

function AttentionList({ title, names }: { title: string; names: string[] }) {
  return (
    <section className="eb-lm-cr-list" aria-label={title}>
      <h4>{title} <span className="eb-section-count">{names.length}</span></h4>
      {names.length ? <ul>{names.map(n => <li key={n}>{n}</li>)}</ul> : <p className="eb-muted">لا أحد.</p>}
    </section>
  );
}
