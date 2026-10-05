import { useId, useRef, useState } from "react";
import type { BuilderSection } from "../examTypes";
import type { ScenarioV1, SourceStimulusKind, SourceStimulusV1 } from "../scenarioSource";
import { SCENARIO_LIMITS, SCENARIO_SOURCE_KINDS, SCENARIO_SOURCE_KIND_LABELS, validateSectionScenarios } from "../scenarioSource";
import { CODE_STIMULUS_LANGUAGES } from "../codeStimulus";
import { readImageFile, MEDIA_MSG } from "../questionMedia";
import { useConfirm } from "../ui/useConfirm";
import {
  addScenarioSource, deleteScenario, deleteScenarioSource, linkScenarioQuestion, linkableQuestions, moveScenario, moveScenarioQuestion, moveScenarioSource,
  newSourceStimulus, regroupScenario, replaceScenarioSource, unlinkScenarioQuestion, updateScenario, updateScenarioSource
} from "../scenarioBuilderOps";
import "./scenario-builder.css";

// Phase 19G — the teacher's SCENARIO card inside a section: title, instructions, the ordered SHARED SOURCES (text / image / table / code —
// a source is edited in place through typed controls, never raw JSON) and the LINKED QUESTIONS (link an existing same-section question,
// create a new one inside the scenario, unlink, reorder, regroup). Every change is a pure scenarioBuilderOps operation applied to the
// section (the one owner of `scenarios[]`); deleting the scenario leaves every question intact. The canonical validator's messages are
// shown inline (finalization blocks on them). Lazy: this chunk never enters the initial graph.
type Props = {
  section: BuilderSection;
  scenario: ScenarioV1;
  index: number;
  total: number;
  onSection: (next: BuilderSection) => void;
  /** Opens the question-type palette; the picked type is created INSIDE this scenario (right after its last member) and linked. */
  onCreateQuestion: () => void;
  disabled?: boolean;
};
const ACCEPT_RASTER = "image/png,image/jpeg,image/webp";
const excerpt = (s: string, n = 80) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t || "(بلا نص)"; };

export default function ScenarioBlockEditor({ section, scenario, index, total, onSection, onCreateQuestion, disabled }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [open, setOpen] = useState(true);
  const { confirm, confirmDialog } = useConfirm();
  const sc = scenario;
  const apply = (next: BuilderSection) => { if (next !== section) onSection(next); };
  const issues = validateSectionScenarios(section).issues.filter(i => i.path.startsWith("scenarios[" + index + "]"));
  const members = sc.questionIds.map(id => section.questions.find(q => q.examQuestionId === id)).filter((q): q is NonNullable<typeof q> => !!q);
  const linkable = linkableQuestions(section, sc.id);
  const pos = new Map(section.questions.map((q, i) => [q.examQuestionId, i]));
  const contiguous = members.length < 2 || members.every((q, i) => i === 0 || (pos.get(q.examQuestionId) ?? -1) === (pos.get(members[i - 1].examQuestionId) ?? -1) + 1);

  async function remove() {
    if (await confirm({ title: "حذف السيناريو", message: "سيُحذف السيناريو ومصادره المشتركة. تبقى الأسئلة المرتبطة كما هي، كأسئلة مستقلة بعلاماتها وإجاباتها.", confirmLabel: "حذف السيناريو", tone: "danger" })) apply(deleteScenario(section, sc.id));
  }
  return (
    <li className="sb-scenario" data-testid="scenario-editor" data-scenario-id={sc.id}>
      <div className="sb-scenario-head">
        <button type="button" className="sb-collapse" onClick={() => setOpen(o => !o)} title={open ? "طيّ" : "فتح"} aria-label={open ? "طيّ السيناريو" : "فتح السيناريو"} aria-expanded={open}>{open ? "▾" : "▸"}</button>
        <span className="sb-scenario-badge">سيناريو</span>
        <strong className="sb-scenario-title-text">{sc.title?.trim() || "سيناريو بلا عنوان"}</strong>
        <span className="sb-scenario-count">{sc.sources.length} مصدر · {sc.questionIds.length} سؤال</span>
        <span className="sb-spacer" />
        <button type="button" className="sb-icon-btn" title="أعلى" aria-label="سيناريو أعلى" onClick={() => apply(moveScenario(section, sc.id, -1))} disabled={disabled || index === 0}>↑</button>
        <button type="button" className="sb-icon-btn" title="أسفل" aria-label="سيناريو أسفل" onClick={() => apply(moveScenario(section, sc.id, 1))} disabled={disabled || index === total - 1}>↓</button>
        <button type="button" className="sb-icon-btn sb-danger" title="حذف السيناريو" aria-label="حذف السيناريو" onClick={() => void remove()} disabled={disabled}>×</button>
      </div>
      {open && (
        <div className="sb-scenario-body">
          <label className="sb-field-label" htmlFor={"sb-scn-title-" + uid}>عنوان السيناريو</label>
          <input id={"sb-scn-title-" + uid} className="sb-input sb-title-input" value={sc.title ?? ""} maxLength={SCENARIO_LIMITS.title} placeholder="مثال: اقرأ النص التالي ثم أجب عن الأسئلة" onChange={e => apply(updateScenario(section, sc.id, { title: e.target.value }))} disabled={disabled} />
          <label className="sb-field-label" htmlFor={"sb-scn-instr-" + uid}>تعليمات السيناريو</label>
          <textarea id={"sb-scn-instr-" + uid} className="sb-input sb-textarea" value={sc.instructions ?? ""} maxLength={SCENARIO_LIMITS.instructions} placeholder="تعليمات تظهر للطالب فوق المصادر (اختياري)" onChange={e => apply(updateScenario(section, sc.id, { instructions: e.target.value }))} disabled={disabled} />

          <section aria-labelledby={"sb-scn-src-h-" + uid}>
            <div className="sb-row-between"><h4 id={"sb-scn-src-h-" + uid} className="sb-scenario-source-kind">المصادر المشتركة</h4>
              <div className="sb-scenario-link-tools">
                {SCENARIO_SOURCE_KINDS.map(k => <button key={k} type="button" className="sb-mini-btn" disabled={disabled || sc.sources.length >= SCENARIO_LIMITS.sources} onClick={() => apply(addScenarioSource(section, sc.id, newSourceStimulus(k)))}>+ {SCENARIO_SOURCE_KIND_LABELS[k]}</button>)}
              </div>
            </div>
            {sc.sources.length === 0 && <p className="sb-scenario-empty">أضف مصدرًا مشتركًا واحدًا على الأقل: نصًا أو صورة أو جدولًا أو كودًا للقراءة.</p>}
            <ol className="sb-scenario-sources">
              {sc.sources.map((src, i) => <SourceEditor key={src.id} source={src} index={i} total={sc.sources.length} disabled={disabled}
                onPatch={patch => apply(updateScenarioSource(section, sc.id, src.id, patch))}
                onKind={k => apply(replaceScenarioSource(section, sc.id, src.id, k))}
                onMove={d => apply(moveScenarioSource(section, sc.id, src.id, d))}
                onDelete={() => apply(deleteScenarioSource(section, sc.id, src.id))} />)}
            </ol>
          </section>

          <section aria-labelledby={"sb-scn-q-h-" + uid}>
            <div className="sb-row-between"><h4 id={"sb-scn-q-h-" + uid} className="sb-scenario-source-kind">الأسئلة المرتبطة</h4>
              <div className="sb-scenario-link-tools">
                {linkable.length > 0 && (
                  <label className="sb-inline"><span>ربط سؤال موجود</span>
                    <select className="sb-input sb-input-sm" value="" aria-label="ربط سؤال موجود" disabled={disabled || sc.questionIds.length >= SCENARIO_LIMITS.questions} onChange={e => { const id = e.target.value; e.target.value = ""; if (id) apply(linkScenarioQuestion(section, sc.id, id)); }}>
                      <option value="">اختر سؤالًا…</option>
                      {linkable.map(q => <option key={q.examQuestionId} value={q.examQuestionId}>{(q.displayNumber?.trim() || String((pos.get(q.examQuestionId) ?? 0) + 1)) + " · " + excerpt(q.text, 50)}</option>)}
                    </select>
                  </label>
                )}
                <button type="button" className="sb-mini-btn" onClick={onCreateQuestion} disabled={disabled || sc.questionIds.length >= SCENARIO_LIMITS.questions} aria-haspopup="dialog">+ سؤال جديد داخل السيناريو</button>
                {!contiguous && <button type="button" className="sb-mini-btn" onClick={() => apply(regroupScenario(section, sc.id))} disabled={disabled}>تجميع أسئلة السيناريو</button>}
              </div>
            </div>
            {members.length === 0 && <p className="sb-scenario-empty">لا توجد أسئلة مرتبطة بعد. اربط سؤالًا من هذا القسم أو أنشئ سؤالًا جديدًا داخل السيناريو.</p>}
            <ol className="sb-scenario-links">
              {members.map((q, i) => (
                <li key={q.examQuestionId} className="sb-scenario-link">
                  <span className="sb-q-badge">{q.displayNumber?.trim() || String((pos.get(q.examQuestionId) ?? 0) + 1)}</span>
                  <span className="sb-scenario-link-text">{excerpt(q.text)}</span>
                  <span className="sb-scenario-link-tools">
                    <button type="button" className="sb-icon-btn" title="أعلى" aria-label={"تقديم السؤال " + (i + 1) + " داخل السيناريو"} onClick={() => apply(moveScenarioQuestion(section, sc.id, q.examQuestionId, -1))} disabled={disabled || i === 0}>↑</button>
                    <button type="button" className="sb-icon-btn" title="أسفل" aria-label={"تأخير السؤال " + (i + 1) + " داخل السيناريو"} onClick={() => apply(moveScenarioQuestion(section, sc.id, q.examQuestionId, 1))} disabled={disabled || i === members.length - 1}>↓</button>
                    <button type="button" className="sb-mini-btn" onClick={() => apply(unlinkScenarioQuestion(section, sc.id, q.examQuestionId))} disabled={disabled}>فك الربط</button>
                  </span>
                </li>
              ))}
            </ol>
          </section>
          {issues.length > 0 && <ul className="sb-scenario-issues" aria-live="polite" data-testid="scenario-issues">{issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul>}
        </div>
      )}
      {confirmDialog}
    </li>
  );
}

type SourceProps = { source: SourceStimulusV1; index: number; total: number; disabled?: boolean; onPatch: (patch: Record<string, unknown>) => void; onKind: (kind: SourceStimulusKind) => void; onMove: (delta: number) => void; onDelete: () => void };
function SourceEditor({ source: src, index, total, disabled, onPatch, onKind, onMove, onDelete }: SourceProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [mediaError, setMediaError] = useState("");
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setMediaError("");
    try {
      const r = await readImageFile(file);
      if (!/^data:image\/(png|jpe?g|webp)[;,]/i.test(r.dataUrl)) { setMediaError("صور المصادر: PNG أو JPG أو WEBP فقط."); return; }
      onPatch({ image: { dataUrl: r.dataUrl, contentType: r.contentType, origin: "uploaded" } });
    } catch (err) { setMediaError(err instanceof Error && err.message ? err.message : MEDIA_MSG.readFail); }
  }
  return (
    <li className="sb-scenario-source" data-testid="scenario-source" data-kind={src.kind}>
      <div className="sb-scenario-source-head">
        <span className="sb-q-badge">{index + 1}</span>
        <label className="sb-inline"><span>النوع</span>
          <select className="sb-input sb-input-sm" value={src.kind} aria-label={"نوع المصدر " + (index + 1)} disabled={disabled} onChange={e => onKind(e.target.value as SourceStimulusKind)}>
            {SCENARIO_SOURCE_KINDS.map(k => <option key={k} value={k}>{SCENARIO_SOURCE_KIND_LABELS[k]}</option>)}
          </select>
        </label>
        <label className="sb-inline"><span>العنوان</span><input className="sb-input sb-input-sm" value={src.title ?? ""} maxLength={SCENARIO_LIMITS.sourceTitle} placeholder="اختياري" aria-label={"عنوان المصدر " + (index + 1)} disabled={disabled} onChange={e => onPatch({ title: e.target.value || undefined })} /></label>
        <span className="sb-spacer" />
        <button type="button" className="sb-icon-btn" title="أعلى" aria-label={"تقديم المصدر " + (index + 1)} onClick={() => onMove(-1)} disabled={disabled || index === 0}>↑</button>
        <button type="button" className="sb-icon-btn" title="أسفل" aria-label={"تأخير المصدر " + (index + 1)} onClick={() => onMove(1)} disabled={disabled || index === total - 1}>↓</button>
        <button type="button" className="sb-icon-btn sb-danger" title="حذف المصدر" aria-label={"حذف المصدر " + (index + 1)} onClick={onDelete} disabled={disabled}>×</button>
      </div>
      <div className="sb-scenario-source-body">
        {src.kind === "text" && <>
          <label className="sb-field-label" htmlFor={"sb-src-text-" + uid}>نص المصدر</label>
          <textarea id={"sb-src-text-" + uid} className="sb-input sb-textarea" value={src.text} maxLength={SCENARIO_LIMITS.textChars} dir="auto" rows={6} placeholder="النص الذي يقرأه الطالب قبل الإجابة" disabled={disabled} onChange={e => onPatch({ text: e.target.value })} />
        </>}
        {src.kind === "image" && <>
          <label className="sb-field-label" htmlFor={"sb-src-alt-" + uid}>الوصف البديل للصورة (مطلوب)</label>
          <input id={"sb-src-alt-" + uid} className="sb-input" value={src.alt} maxLength={SCENARIO_LIMITS.alt} placeholder="ما الذي تُظهره الصورة؟ يُقرأ للطالب الذي لا يراها" disabled={disabled} onChange={e => onPatch({ alt: e.target.value })} />
          <div className="sb-media-actions">
            <input ref={fileRef} className="sb-media-file" type="file" accept={ACCEPT_RASTER} aria-label={"ملف صورة المصدر " + (index + 1)} onChange={e => void onFile(e)} disabled={disabled} />
            <button type="button" className="sb-btn" disabled={disabled} onClick={() => fileRef.current?.click()}>{src.image?.dataUrl ? "استبدال الصورة" : "رفع صورة"}</button>
            {src.image?.dataUrl && <button type="button" className="sb-btn" disabled={disabled} onClick={() => onPatch({ image: {} })}>إزالة الصورة</button>}
          </div>
          {src.image?.dataUrl && <img className="sb-scenario-thumb" src={src.image.dataUrl} alt={src.alt || "صورة المصدر"} />}
          {mediaError && <p className="sb-media-error" role="alert">{mediaError}</p>}
        </>}
        {src.kind === "table" && <TableSourceEditor source={src} disabled={disabled} onPatch={onPatch} />}
        {src.kind === "code" && <>
          <label className="sb-inline"><span>اللغة</span>
            <select className="sb-input sb-input-sm" value={src.language} aria-label={"لغة الكود للمصدر " + (index + 1)} disabled={disabled} onChange={e => onPatch({ language: e.target.value })}>
              {Object.entries(CODE_STIMULUS_LANGUAGES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="sb-field-label" htmlFor={"sb-src-code-" + uid}>الكود (للقراءة فقط، لا يُشغَّل)</label>
          <textarea id={"sb-src-code-" + uid} className="sb-input sb-scenario-code" dir="ltr" lang="en" value={src.source} rows={Math.min(18, Math.max(5, src.source.split("\n").length + 1))} spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off" disabled={disabled} onChange={e => onPatch({ source: e.target.value })} />
        </>}
      </div>
    </li>
  );
}

function TableSourceEditor({ source: t, disabled, onPatch }: { source: Extract<SourceStimulusV1, { kind: "table" }>; disabled?: boolean; onPatch: (patch: Record<string, unknown>) => void }) {
  const cols = t.columnHeaders.length;
  const hasRowHeaders = Array.isArray(t.rowHeaders);
  const setHeader = (c: number, v: string) => onPatch({ columnHeaders: t.columnHeaders.map((h, i) => (i === c ? v : h)) });
  const setCell = (r: number, c: number, v: string) => onPatch({ rows: t.rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? v : cell)) : row)) });
  const setRowHeader = (r: number, v: string) => onPatch({ rowHeaders: (t.rowHeaders ?? t.rows.map(() => "")).map((h, i) => (i === r ? v : h)) });
  const addColumn = () => onPatch({ columnHeaders: [...t.columnHeaders, ""], rows: t.rows.map(r => [...r, ""]) });
  const deleteColumn = (c: number) => onPatch({ columnHeaders: t.columnHeaders.filter((_, i) => i !== c), rows: t.rows.map(r => r.filter((_, i) => i !== c)) });
  const addRow = () => onPatch({ rows: [...t.rows, t.columnHeaders.map(() => "")], ...(hasRowHeaders ? { rowHeaders: [...(t.rowHeaders as string[]), ""] } : {}) });
  const deleteRow = (r: number) => onPatch({ rows: t.rows.filter((_, i) => i !== r), ...(hasRowHeaders ? { rowHeaders: (t.rowHeaders as string[]).filter((_, i) => i !== r) } : {}) });
  const toggleRowHeaders = () => onPatch({ rowHeaders: hasRowHeaders ? undefined : t.rows.map(() => "") });
  return (
    <div className="sb-scenario-table">
      <div className="sb-media-actions">
        <button type="button" className="sb-mini-btn" onClick={addColumn} disabled={disabled || cols >= SCENARIO_LIMITS.tableColumns}>+ عمود</button>
        <button type="button" className="sb-mini-btn" onClick={addRow} disabled={disabled || t.rows.length >= SCENARIO_LIMITS.tableRows}>+ صف</button>
        <label className="sb-inline"><input type="checkbox" checked={hasRowHeaders} onChange={toggleRowHeaders} disabled={disabled} /> عناوين للصفوف</label>
      </div>
      <table className="sb-grid">
        <thead>
          <tr>
            {hasRowHeaders && <th className="sb-grid-row-head" aria-label="عمود عناوين الصفوف" />}
            {t.columnHeaders.map((h, c) => (
              <th key={c}>
                <input className="sb-input sb-input-sm" value={h} maxLength={SCENARIO_LIMITS.headerChars} placeholder={"العمود " + (c + 1)} aria-label={"عنوان العمود " + (c + 1)} onChange={e => setHeader(c, e.target.value)} disabled={disabled} />
                {cols > 1 && <button type="button" className="sb-icon-btn sb-danger" title="حذف العمود" aria-label={"حذف العمود " + (c + 1)} onClick={() => deleteColumn(c)} disabled={disabled}>×</button>}
              </th>
            ))}
            <th className="sb-grid-actions" aria-label="إجراءات الصف" />
          </tr>
        </thead>
        <tbody>
          {t.rows.map((row, r) => (
            <tr key={r}>
              {hasRowHeaders && <th className="sb-grid-row-head" scope="row"><input className="sb-input sb-input-sm" value={t.rowHeaders?.[r] ?? ""} maxLength={SCENARIO_LIMITS.headerChars} placeholder={"الصف " + (r + 1)} aria-label={"عنوان الصف " + (r + 1)} onChange={e => setRowHeader(r, e.target.value)} disabled={disabled} /></th>}
              {row.map((cell, c) => <td key={c}><input className="sb-input sb-input-sm" value={cell} maxLength={SCENARIO_LIMITS.cellChars} aria-label={"الخلية " + (r + 1) + "،" + (c + 1)} onChange={e => setCell(r, c, e.target.value)} disabled={disabled} /></td>)}
              <td className="sb-grid-actions">{t.rows.length > 1 && <button type="button" className="sb-icon-btn sb-danger" title="حذف الصف" aria-label={"حذف الصف " + (r + 1)} onClick={() => deleteRow(r)} disabled={disabled}>×</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
