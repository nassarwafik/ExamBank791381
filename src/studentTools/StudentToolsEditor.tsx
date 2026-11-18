import { Suspense, lazy, useId, useState } from "react";
import {
  STUDENT_TOOL_IDS, NUMBER_BASES, defaultStudentToolConfig, validateStudentTools,
  type StudentToolConfigV1, type StudentToolId, type StudentToolsSpecV1, type CalculatorToolV1, type Ipv4CalculatorToolV1, type BaseConverterToolV1, type GraphPlotterToolV1, type ScratchPadToolV1, type FormulaSheetToolV1, type NumberBase, GRAPH_MAX_FUNCTIONS_LIMIT, FORMULA_SHEET_TITLE_MAX
} from "./studentToolsSpec";
import { studentToolCatalogEntry } from "./studentToolsCatalog";
import { studentToolAnswerRisks } from "./studentToolsRisk";
import { BASE_LABEL } from "./baseConverter";
import type { RichContentV1 } from "../richContent/richContentModel";

const MAX_RISK_LABELS = 5;
// Phase T5 — the formula sheet is authored with the platform's rich-content editor (lazy: builder-only, like the cover's rich instructions).
const RichContentEditor = lazy(() => import("../richContent/RichContentEditor"));

// Phase T2 — Builder panel «أدوات الطالب»: which tools the student may open during this exam, their options, and the sections where a
// tool is switched off. Controlled: every change is re-validated and only a CANONICAL spec (or undefined = no tools) is emitted, so the
// exam never holds a value the quality gate or the server would refuse. Overrides of sections that no longer exist are pruned on the
// next edit (until then the quality gate names them).

type SectionRef = { id: string; title?: string; questions?: unknown[] };
type Props = {
  value: unknown;
  sections: readonly SectionRef[];
  onChange: (next: StudentToolsSpecV1 | undefined) => void;
  disabled?: boolean;
};

/** Emits the canonical spec; returns the first refusal message (nothing is emitted then), or "" on success. */
function emit(tools: StudentToolConfigV1[], overrides: Record<string, StudentToolId[]>, sectionIds: ReadonlySet<string>, onChange: Props["onChange"]): string {
  if (!tools.length) { onChange(undefined); return ""; }
  const enabled = new Set(tools.map(t => t.id));
  const sectionOverrides: Record<string, { disabled: StudentToolId[] }> = {};
  for (const [sid, list] of Object.entries(overrides)) {
    const kept = list.filter(id => enabled.has(id));
    if (sectionIds.has(sid) && kept.length) sectionOverrides[sid] = { disabled: kept };
  }
  const raw: StudentToolsSpecV1 = { version: 1, tools, ...(Object.keys(sectionOverrides).length ? { sectionOverrides } : {}) };
  const v = validateStudentTools(raw);
  if (v.ok) { onChange(v.value); return ""; }
  return v.issues[0]?.message ?? "تعذّر حفظ إعدادات الأدوات.";
}

export default function StudentToolsEditor({ value, sections, onChange, disabled }: Props) {
  const baseId = useId();
  const present = value !== undefined && value !== null;
  const parsed = present ? validateStudentTools(value) : null;
  const invalid = !!parsed && !parsed.ok;
  const spec = parsed && parsed.ok ? parsed.value : undefined;
  const tools = spec?.tools ?? [];
  const overrides: Record<string, StudentToolId[]> = {};
  for (const [sid, o] of Object.entries(spec?.sectionOverrides ?? {})) overrides[sid] = [...o.disabled];
  const sectionIds = new Set(sections.map(s => s.id));
  const staleSections = Object.keys(overrides).filter(sid => !sectionIds.has(sid));
  // Phase T3 — advisory: questions an enabled tool could answer outright (follows the section overrides; never blocks).
  const risks = new Map(studentToolAnswerRisks({ sections: sections as SectionRef[] }, spec).map(r => [r.tool, r.hits]));

  const [refusal, setRefusal] = useState("");
  const setTools = (next: StudentToolConfigV1[]) => setRefusal(emit(next, overrides, sectionIds, onChange));
  const toggleTool = (id: StudentToolId, on: boolean) => {
    if (on) {
      const next = [...tools.filter(t => t.id !== id), defaultStudentToolConfig(id)];
      setTools(STUDENT_TOOL_IDS.flatMap(tid => next.filter(t => t.id === tid)));
    } else setTools(tools.filter(t => t.id !== id));
  };
  const patchTool = (id: StudentToolId, patch: Partial<StudentToolConfigV1>) =>
    setTools(tools.map(t => (t.id === id ? ({ ...t, ...patch } as StudentToolConfigV1) : t)));
  const toggleSection = (sid: string, id: StudentToolId, allowed: boolean) => {
    const list = new Set(overrides[sid] ?? []);
    if (allowed) list.delete(id); else list.add(id);
    setRefusal(emit(tools, { ...overrides, [sid]: [...list] }, sectionIds, onChange));
  };

  return (
    <div className="sb-cover-panel sb-student-tools" dir="rtl" data-testid="student-tools-editor">
      <div className="sb-row-between"><strong>🧰 أدوات الطالب</strong></div>
      <p className="sb-hint">أدوات يفتحها الطالب متى شاء أثناء الامتحان. لا تظهر أي أداة إلا إذا فعّلتها هنا، وتُثبَّت مع الواجب عند إسناده.</p>

      {invalid && (
        <div className="sb-banner sb-banner-error" role="alert">
          إعدادات الأدوات المحفوظة في هذا الامتحان غير صالحة، ولن تصل إلى الطالب.
          <button type="button" className="sb-mini-btn" onClick={() => onChange(undefined)} disabled={disabled}>إزالة الإعدادات غير الصالحة</button>
        </div>
      )}
      {refusal && <div className="sb-banner sb-banner-error" role="alert" data-testid="tools-refusal">لم يُحفظ التعديل الأخير: {refusal}</div>}
      {staleSections.length > 0 && (
        <div className="sb-banner sb-banner-error" role="alert">
          تخصيص الأدوات يشير إلى قسم محذوف.
          <button type="button" className="sb-mini-btn" onClick={() => setTools(tools)} disabled={disabled}>تنظيف التخصيص</button>
        </div>
      )}

      {!invalid && (
        <ul className="sb-tools-list">
          {STUDENT_TOOL_IDS.map(id => {
            const entry = studentToolCatalogEntry(id);
            const tool = tools.find(t => t.id === id);
            const on = !!tool;
            const cid = baseId + "-" + id;
            return (
              <li key={id} className={"sb-tool" + (on ? " is-on" : "")}>
                <label className="sb-check">
                  <input type="checkbox" checked={on} onChange={e => toggleTool(id, e.target.checked)} disabled={disabled || (!entry.available && !on)} aria-describedby={cid + "-desc"} />
                  <span>{entry.label}</span>
                  {!entry.available && <span className="sb-tool-soon">قريبًا</span>}
                </label>
                <p className="sb-hint" id={cid + "-desc"}>{entry.description}</p>
                {on && !entry.available && <p className="sb-hint">هذه الأداة لن تظهر للطالب حتى تصدر واجهتها.</p>}
                {on && entry.available && <p className="sb-hint sb-tool-risk"><strong>انتبه:</strong> {entry.answerRisk}</p>}
                {on && risks.has(id) && (
                  <p className="sb-banner sb-tool-hits" role="note" data-testid={"tool-risk-" + id}>
                    قد تحلّ هذه الأداة {risks.get(id)!.length === 1 ? "سؤالًا واحدًا" : risks.get(id)!.length + " أسئلة"} في هذا الامتحان: {risks.get(id)!.slice(0, MAX_RISK_LABELS).map(h => h.label).join("، ")}
                    {risks.get(id)!.length > MAX_RISK_LABELS ? " و" + (risks.get(id)!.length - MAX_RISK_LABELS) + " أخرى" : ""}.
                    {sections.length > 1 ? " يمكنك إيقافها في هذه الأقسام من «الأدوات في كل قسم»." : " فكّر في إيقافها لهذا الامتحان."}
                  </p>
                )}
                {tool?.id === "calculator" && (
                  <div className="sb-tool-options">
                    <label className="sb-field">
                      <span className="sb-field-label">نوع الآلة</span>
                      <select className="sb-input" value={tool.variant} disabled={disabled} onChange={e => patchTool(id, { variant: e.target.value as CalculatorToolV1["variant"] })}>
                        <option value="scientific">علمية</option>
                        <option value="basic">بسيطة (العمليات الأربع والأقواس)</option>
                      </select>
                    </label>
                    {tool.variant === "scientific" && (
                      <label className="sb-field">
                        <span className="sb-field-label">وحدة الزوايا</span>
                        <select className="sb-input" value={tool.angleUnit} disabled={disabled} onChange={e => patchTool(id, { angleUnit: e.target.value as CalculatorToolV1["angleUnit"] })}>
                          <option value="deg">درجات</option>
                          <option value="rad">راديان</option>
                        </select>
                      </label>
                    )}
                  </div>
                )}
                {tool?.id === "baseConverter" && (
                  <div className="sb-tool-options">
                    <fieldset className="sb-tool-bases">
                      <legend className="sb-field-label">أنظمة العدّ المتاحة (اثنان على الأقل)</legend>
                      {NUMBER_BASES.map(b => {
                        const checked = tool.bases.includes(b);
                        return (
                          <label key={b} className="sb-check">
                            <input type="checkbox" checked={checked} disabled={disabled || (checked && tool.bases.length <= 2)}
                              onChange={e => patchTool(id, { bases: (e.target.checked ? [...tool.bases, b] : tool.bases.filter(x => x !== b)) as NumberBase[] } as Partial<BaseConverterToolV1>)} />
                            <span>{BASE_LABEL[b]} ({b})</span>
                          </label>
                        );
                      })}
                    </fieldset>
                    <label className="sb-check">
                      <input type="checkbox" checked={tool.showSteps} disabled={disabled} onChange={e => patchTool(id, { showSteps: e.target.checked } as Partial<BaseConverterToolV1>)} />
                      <span>عرض خطوات التحويل</span>
                    </label>
                  </div>
                )}
                {tool?.id === "graphPlotter" && (
                  <div className="sb-tool-options">
                    <label className="sb-field">
                      <span className="sb-field-label">عدد الدوال</span>
                      <select className="sb-input" value={tool.maxFunctions} disabled={disabled} onChange={e => patchTool(id, { maxFunctions: Number(e.target.value) } as Partial<GraphPlotterToolV1>)}>
                        {Array.from({ length: GRAPH_MAX_FUNCTIONS_LIMIT }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n === 1 ? "دالة واحدة" : n === 2 ? "دالتان" : n + " دوال"}</option>)}
                      </select>
                    </label>
                    <label className="sb-check">
                      <input type="checkbox" checked={tool.showAnalysis} disabled={disabled} onChange={e => patchTool(id, { showAnalysis: e.target.checked } as Partial<GraphPlotterToolV1>)} />
                      <span>إظهار الجذور ونقاط التقاطع والقيم القصوى</span>
                    </label>
                  </div>
                )}
                {tool?.id === "formulaSheet" && (
                  <div className="sb-tool-options sb-tool-sheet">
                    <label className="sb-field">
                      <span className="sb-field-label">عنوان الورقة</span>
                      <input className="sb-input" value={tool.title} maxLength={FORMULA_SHEET_TITLE_MAX} disabled={disabled}
                        onChange={e => patchTool(id, { title: e.target.value } as Partial<FormulaSheetToolV1>)} />
                    </label>
                    <p className="sb-hint">المسموح: نصوص وعناوين وقوائم وجداول ومعادلات. لا صور ولا رسوم بيانية في هذا الإصدار.</p>
                    <Suspense fallback={<p className="sb-hint" role="status">جارٍ تحميل المحرّر…</p>}>
                      <RichContentEditor value={tool.content} disabled={disabled} label="محتوى ورقة القوانين"
                        onChange={(next: RichContentV1 | undefined) => {
                          if (!next) { setRefusal("ورقة القوانين لا يمكن أن تكون فارغة."); return; }
                          patchTool(id, { content: next } as Partial<FormulaSheetToolV1>);
                        }} />
                    </Suspense>
                  </div>
                )}
                {tool?.id === "scratchPad" && (
                  <div className="sb-tool-options">
                    <label className="sb-check">
                      <input type="checkbox" checked={tool.drawing} disabled={disabled} onChange={e => patchTool(id, { drawing: e.target.checked } as Partial<ScratchPadToolV1>)} />
                      <span>السماح بالرسم الحر (قلم وممحاة)</span>
                    </label>
                  </div>
                )}
                {tool?.id === "ipv4Calculator" && (
                  <div className="sb-tool-options">
                    <label className="sb-check">
                      <input type="checkbox" checked={tool.showBinary} disabled={disabled} onChange={e => patchTool(id, { showBinary: e.target.checked } as Partial<Ipv4CalculatorToolV1>)} />
                      <span>عرض الشكل الثنائي</span>
                    </label>
                    <label className="sb-check">
                      <input type="checkbox" checked={tool.allowSubnetting} disabled={disabled} onChange={e => patchTool(id, { allowSubnetting: e.target.checked } as Partial<Ipv4CalculatorToolV1>)} />
                      <span>السماح بتقسيم الشبكات</span>
                    </label>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!invalid && tools.length > 0 && sections.length > 1 && (
        <details className="sb-tools-sections">
          <summary>الأدوات في كل قسم</summary>
          <p className="sb-hint">ألغِ تحديد أداة في قسم لتختفي من شريط الأدوات عندما يكون الطالب في ذلك القسم.</p>
          <table className="sb-tools-table">
            <thead><tr><th scope="col">القسم</th>{tools.map(t => <th key={t.id} scope="col">{studentToolCatalogEntry(t.id).label}</th>)}</tr></thead>
            <tbody>
              {sections.map((s, i) => (
                <tr key={s.id}>
                  <th scope="row">{s.title || "القسم " + (i + 1)}</th>
                  {tools.map(t => {
                    const allowed = !(overrides[s.id] ?? []).includes(t.id);
                    return (
                      <td key={t.id}>
                        <input type="checkbox" checked={allowed} disabled={disabled}
                          aria-label={studentToolCatalogEntry(t.id).label + " في " + (s.title || "القسم " + (i + 1))}
                          onChange={e => toggleSection(s.id, t.id, e.target.checked)} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
