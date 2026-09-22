import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconChevronBack } from "../../icons";
import ExamPreview from "../../ExamPreview";
import type { PreviewExamInput } from "../../examPreviewModel";
import type { BuilderQuestion, BuilderQuestionType } from "../../examTypes";
import { BUILDER_QUESTION_TYPES, QUESTION_TYPE_LABELS } from "../../examTypes";
import type { ChallengeDefinition, ChallengeSummary } from "../domain/challenge";
import {
  newChallengeDefinition, addManualQuestion, addImportedQuestions, updateChallengeQuestion,
  duplicateChallengeQuestion, removeChallengeQuestion, moveChallengeQuestion, setChallengeTitle,
} from "./challengeState";
import { createLiveChallengeClient, type LiveChallengeClient } from "./liveChallengeClient";
import ChallengeQuestionCard from "./ChallengeQuestionCard";
import ChallengeImportPicker from "./ChallengeImportPicker";
import "../games.css";

// The Live Challenge Generator — the TEACHER's Kahoot-like challenge AUTHORING screen (Phase 3B). It builds an ordered
// list of IMMUTABLE canonical-question snapshots and saves a Challenge Definition for a LATER live session. It edits
// every question through the SHARED QuestionComposer (no second question editor, no second model). It contains NO
// live/multiplayer controls: no participant selection, join code, lobby, start-game, real-time, medals or Strength.
type Phase = "home" | "editing";

/** A one-question structured exam so the SHARED ExamPreview (which strips answer keys via toSafePreviewExam) can render
 *  a challenge question exactly as a student sees it — no second renderer, no answer-key leakage. */
function singleQuestionPreview(title: string, q: BuilderQuestion): PreviewExamInput {
  return { examId: "challenge-preview", title, sections: [{ id: "challenge-preview-sec", title: "", gradingPolicy: "all", questions: [q] }] } as unknown as PreviewExamInput;
}

export default function LiveChallengeGenerator({ token, onBack, client: injected }: { token: string; onBack: () => void; client?: LiveChallengeClient }) {
  const clientRef = useRef<LiveChallengeClient>(injected || createLiveChallengeClient(token));
  const [phase, setPhase] = useState<Phase>("home");
  const [summaries, setSummaries] = useState<ChallengeSummary[] | null>(null);
  const [def, setDef] = useState<ChallengeDefinition | null>(null);
  const [addType, setAddType] = useState<BuilderQuestionType>("multipleChoice");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [preview, setPreview] = useState<BuilderQuestion | null>(null);

  const refreshList = useCallback(async () => {
    setError("");
    try { setSummaries(await clientRef.current.list()); }
    catch { setSummaries([]); setError("تعذّر تحميل التحدّيات المحفوظة."); }
  }, []);

  useEffect(() => { if (phase === "home") void refreshList(); }, [phase, refreshList]);

  const startNew = () => { setDef(newChallengeDefinition({ title: "تحدٍّ جديد" })); setNotice(""); setError(""); setPhase("editing"); };

  const openExisting = async (id: string) => {
    setError("");
    try {
      const loaded = await clientRef.current.get(id);
      if (!loaded) { setError("تعذّر فتح التحدّي."); return; }
      setDef(loaded); setNotice(""); setPhase("editing");
    } catch { setError("تعذّر فتح التحدّي."); }
  };

  const mutate = (next: ChallengeDefinition) => { setDef(next); setNotice(""); };

  const save = useCallback(async () => {
    if (!def) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const r = await clientRef.current.save(def);
      if (r.ok) setNotice("تم حفظ التحدّي."); else setError("تعذّر حفظ التحدّي.");
    } catch { setError("تعذّر حفظ التحدّي."); }
    finally { setSaving(false); }
  }, [def]);

  // ── home: saved challenges + create ──
  if (phase === "home") {
    return (
      <main className="student-portal eb-student-shell eb-games-surface eb-lc" dir="rtl">
        <div className="eb-games-surface-bar">
          <button type="button" className="eb-button is-quiet is-small" onClick={onBack}>
            <IconChevronBack size={18} className="eb-flip-rtl" aria-hidden="true" />العودة إلى الألعاب
          </button>
        </div>
        <section className="eb-games-page" aria-labelledby="eb-lc-title">
          <header className="eb-games-page-head">
            <h1 id="eb-lc-title" className="eb-games-page-title">مولّد التحدّي المباشر</h1>
            <p className="eb-games-page-desc">أنشئ تحدّيًا صفّيًا وحضّر أسئلته الآن؛ إدارة الجلسة المباشرة تأتي لاحقًا.</p>
          </header>
          {error && <div className="platform-error" role="alert">{error}</div>}
          <button type="button" className="eb-button is-primary eb-lc-create" onClick={startNew}>إنشاء تحدٍّ جديد</button>
          <div className="eb-lc-saved" aria-label="التحدّيات المحفوظة">
            {summaries === null && <p className="eb-muted" role="status">جارٍ التحميل…</p>}
            {summaries !== null && summaries.length === 0 && <p className="eb-muted">لا توجد تحدّيات محفوظة بعد.</p>}
            {summaries?.map(s => (
              <button type="button" key={s.challengeId} className="eb-lc-saved-item" onClick={() => openExisting(s.challengeId)}>
                <span className="eb-lc-saved-title">{s.title || "تحدٍّ بدون عنوان"}</span>
                <span className="eb-lc-saved-count" dir="ltr">{s.questionCount} سؤال</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    );
  }

  // ── editing ──
  if (!def) return null;
  return (
    <main className="student-portal eb-student-shell eb-games-surface eb-lc" dir="rtl">
      <div className="eb-games-surface-bar">
        <button type="button" className="eb-button is-quiet is-small" onClick={() => { setPhase("home"); setDef(null); }}>
          <IconChevronBack size={18} className="eb-flip-rtl" aria-hidden="true" />التحدّيات
        </button>
      </div>

      <section className="eb-lc-editor" aria-labelledby="eb-lc-editor-title">
        <header className="eb-lc-editor-head">
          <h1 id="eb-lc-editor-title" className="eb-games-page-title">مولّد التحدّي المباشر</h1>
          <label className="eb-lc-title-field">
            <span className="sb-field-label">عنوان التحدّي</span>
            <input className="sb-input" value={def.title} onChange={e => mutate(setChallengeTitle(def, e.target.value))} disabled={saving} placeholder="عنوان التحدّي" />
          </label>
          <div className="eb-lc-editor-tools">
            <span className="eb-lc-count" aria-label="عدد الأسئلة">الأسئلة: <strong dir="ltr">{def.questions.length}</strong></span>
            <span className="sb-spacer" />
            <button type="button" className="eb-button is-primary" onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ…" : "حفظ"}</button>
          </div>
          {notice && <p className="eb-lc-notice" role="status">{notice}</p>}
          {error && <div className="platform-error" role="alert">{error}</div>}
        </header>

        <div className="eb-lc-add">
          <label className="sb-inline"><span>نوع السؤال الجديد</span>
            <select className="sb-input sb-input-sm" value={addType} onChange={e => setAddType(e.target.value as BuilderQuestionType)} disabled={saving} aria-label="نوع السؤال الجديد">
              {BUILDER_QUESTION_TYPES.map(t => <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>)}
            </select>
          </label>
          <button type="button" className="eb-button sb-add-btn" onClick={() => mutate(addManualQuestion(def, addType))} disabled={saving}>+ إضافة سؤال</button>
          <button type="button" className="eb-button" onClick={() => setImportOpen(true)} disabled={saving}>استيراد من امتحان</button>
        </div>

        {def.questions.length === 0 && <p className="eb-muted eb-lc-empty">لا توجد أسئلة بعد — أضِف سؤالًا أو استورد من امتحان.</p>}

        <div className="eb-lc-questions">
          {def.questions.map((cq, i) => (
            <ChallengeQuestionCard
              key={cq.question.examQuestionId}
              entry={cq}
              index={i}
              total={def.questions.length}
              disabled={saving}
              onChange={patch => mutate(updateChallengeQuestion(def, cq.question.examQuestionId, patch))}
              onMove={delta => mutate(moveChallengeQuestion(def, cq.question.examQuestionId, delta))}
              onDuplicate={() => mutate(duplicateChallengeQuestion(def, cq.question.examQuestionId))}
              onDelete={() => mutate(removeChallengeQuestion(def, cq.question.examQuestionId))}
              onPreview={() => setPreview(cq.question)}
            />
          ))}
        </div>
      </section>

      {importOpen && (
        <ChallengeImportPicker
          client={clientRef.current}
          onCancel={() => setImportOpen(false)}
          onAdd={items => { mutate(addImportedQuestions(def, items)); setImportOpen(false); }}
        />
      )}

      {preview && createPortal(
        <ExamPreview exam={singleQuestionPreview(def.title, preview)} onClose={() => setPreview(null)} />,
        document.body,
      )}
    </main>
  );
}
