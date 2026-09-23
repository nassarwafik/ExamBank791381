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
import ChallengeImportPicker, { type ImportSource } from "./ChallengeImportPicker";
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

/**
 * `embedded` — SEMANTICS only: inside a host that already owns the page's <main> landmark and <h1> (the teacher app
 * shell) the root renders as a <div> and the generator title as an <h2> (one <main>, one <h1> per page). Same classes →
 * identical look. Default (standalone): <main> + <h1>.
 */
export default function LiveChallengeGenerator({ token, onBack, client: injected, embedded = false }: { token: string; onBack: () => void; client?: LiveChallengeClient; embedded?: boolean }) {
  const Root = embedded ? "div" : "main";
  const Title = embedded ? "h2" : "h1";
  const Sub = embedded ? "h3" : "h2";   // the editor's section headings sit one level below the page title
  const clientRef = useRef<LiveChallengeClient>(injected || createLiveChallengeClient(token));
  const [phase, setPhase] = useState<Phase>("home");
  const [summaries, setSummaries] = useState<ChallengeSummary[] | null>(null);
  const [def, setDef] = useState<ChallengeDefinition | null>(null);
  const [addType, setAddType] = useState<BuilderQuestionType>("multipleChoice");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [importSource, setImportSource] = useState<ImportSource | null>(null);   // non-null = the import dialog is open
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
      <Root className="student-portal eb-student-shell eb-games-surface eb-lc" dir="rtl">
        <div className="eb-games-surface-bar">
          <button type="button" className="eb-button is-quiet is-small" onClick={onBack}>
            <IconChevronBack size={18} className="eb-flip-rtl" aria-hidden="true" />العودة إلى الألعاب
          </button>
        </div>
        <section className="eb-games-page" aria-labelledby="eb-lc-title">
          <header className="eb-games-page-head">
            <Title id="eb-lc-title" className="eb-games-page-title">مولّد التحدّي المباشر</Title>
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
      </Root>
    );
  }

  // ── editing ──
  if (!def) return null;
  const count = def.questions.length;
  const addManual = () => mutate(addManualQuestion(def, addType));
  return (
    <Root className="student-portal eb-student-shell eb-games-surface eb-lc" dir="rtl">
      <div className="eb-games-surface-bar">
        <button type="button" className="eb-button is-quiet is-small" onClick={() => { setPhase("home"); setDef(null); }}>
          <IconChevronBack size={18} className="eb-flip-rtl" aria-hidden="true" />التحدّيات
        </button>
      </div>

      <section className="eb-lc-editor" aria-labelledby="eb-lc-editor-title">
        {/* Header card: title + subtitle, the challenge title field, the question count and the (prominent) save action,
            with the save notice / error directly underneath. */}
        <header className="eb-lc-card eb-lc-headcard">
          <div className="eb-lc-headcard-titles">
            <Title id="eb-lc-editor-title" className="eb-games-page-title">مولّد التحدّي المباشر</Title>
            <p className="eb-lc-headcard-sub">أنشئ أسئلة التحدّي ورتّبها قبل بدء الجلسة المباشرة.</p>
          </div>
          <label className="eb-lc-field eb-lc-title-field">
            <span className="eb-lc-field-label">عنوان التحدّي</span>
            <input className="sb-input eb-lc-title-input" value={def.title} onChange={e => mutate(setChallengeTitle(def, e.target.value))} disabled={saving} placeholder="مثال: تحدّي شبكات الحاسوب" />
          </label>
          <div className="eb-lc-headcard-foot">
            <span className="eb-lc-stat">
              <strong className="eb-lc-stat-value" dir="ltr">{count}</strong>
              <span className="eb-lc-stat-label">سؤال</span>
            </span>
            <button type="button" className="eb-button is-primary eb-lc-save" onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ…" : "حفظ التحدّي"}</button>
          </div>
          {(notice || error) && (
            <div className="eb-lc-headcard-status">
              {notice && <p className="eb-lc-notice" role="status">{notice}</p>}
              {error && <div className="platform-error" role="alert">{error}</div>}
            </div>
          )}
        </header>

        {/* Toolbar card: a new question of a chosen type, or an import (saved exam / local JSON file). */}
        <section className="eb-lc-card eb-lc-toolbar" aria-labelledby="eb-lc-toolbar-title">
          <Sub id="eb-lc-toolbar-title" className="eb-lc-card-title">إضافة أسئلة إلى التحدّي</Sub>
          <div className="eb-lc-toolbar-groups">
            <div className="eb-lc-toolbar-group" role="group" aria-labelledby="eb-lc-group-new">
              <span id="eb-lc-group-new" className="eb-lc-group-label">سؤال جديد</span>
              <div className="eb-lc-toolbar-row">
                <label className="eb-lc-field eb-lc-type-field">
                  <span className="eb-lc-field-label">نوع السؤال الجديد</span>
                  <select className="sb-input eb-lc-type-select" value={addType} onChange={e => setAddType(e.target.value as BuilderQuestionType)} disabled={saving}>
                    {BUILDER_QUESTION_TYPES.map(t => <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>)}
                  </select>
                </label>
                <button type="button" className="eb-button eb-lc-action" onClick={addManual} disabled={saving}>+ إضافة سؤال</button>
              </div>
            </div>
            <div className="eb-lc-toolbar-group" role="group" aria-labelledby="eb-lc-group-import">
              <span id="eb-lc-group-import" className="eb-lc-group-label">الاستيراد</span>
              <div className="eb-lc-toolbar-row">
                <button type="button" className="eb-button eb-lc-action" onClick={() => setImportSource("saved")} disabled={saving}>استيراد من امتحان</button>
                <button type="button" className="eb-button eb-lc-action" onClick={() => setImportSource("json")} disabled={saving}>استيراد من JSON</button>
              </div>
            </div>
          </div>
        </section>

        {count === 0 ? (
          <div className="eb-lc-card eb-lc-emptystate">
            <p className="eb-lc-emptystate-title">لا توجد أسئلة في التحدّي بعد</p>
            <p className="eb-lc-emptystate-text">ابدأ بإضافة سؤال جديد أو استورد أسئلة من امتحان محفوظ أو ملف JSON.</p>
            <div className="eb-lc-emptystate-actions">
              <button type="button" className="eb-button is-primary eb-lc-action" onClick={addManual} disabled={saving}>+ إضافة أول سؤال</button>
              <button type="button" className="eb-button eb-lc-action" onClick={() => setImportSource("saved")} disabled={saving}>استيراد امتحان</button>
            </div>
          </div>
        ) : (
          <ol className="eb-lc-questions" aria-label="أسئلة التحدّي">
            {def.questions.map((cq, i) => (
              <li key={cq.question.examQuestionId} className="eb-lc-questions-item">
                <ChallengeQuestionCard
                  entry={cq}
                  index={i}
                  total={count}
                  disabled={saving}
                  onChange={patch => mutate(updateChallengeQuestion(def, cq.question.examQuestionId, patch))}
                  onMove={delta => mutate(moveChallengeQuestion(def, cq.question.examQuestionId, delta))}
                  onDuplicate={() => mutate(duplicateChallengeQuestion(def, cq.question.examQuestionId))}
                  onDelete={() => mutate(removeChallengeQuestion(def, cq.question.examQuestionId))}
                  onPreview={() => setPreview(cq.question)}
                />
              </li>
            ))}
          </ol>
        )}
      </section>

      {importSource && (
        <ChallengeImportPicker
          client={clientRef.current}
          initialSource={importSource}
          onCancel={() => setImportSource(null)}
          onAdd={items => { mutate(addImportedQuestions(def, items)); setImportSource(null); }}
        />
      )}

      {preview && createPortal(
        <ExamPreview exam={singleQuestionPreview(def.title, preview)} onClose={() => setPreview(null)} />,
        document.body,
      )}
    </Root>
  );
}
