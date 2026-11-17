import { useId } from "react";
import {
  STUDENT_TOOL_IDS, defaultStudentToolConfig, validateStudentTools,
  type StudentToolConfigV1, type StudentToolId, type StudentToolsSpecV1, type CalculatorToolV1, type Ipv4CalculatorToolV1
} from "./studentToolsSpec";
import { studentToolCatalogEntry } from "./studentToolsCatalog";

// Phase T2 — Builder panel «أدوات الطالب»: which tools the student may open during this exam, their options, and the sections where a
// tool is switched off. Controlled: every change is re-validated and only a CANONICAL spec (or undefined = no tools) is emitted, so the
// exam never holds a value the quality gate or the server would refuse. Overrides of sections that no longer exist are pruned on the
// next edit (until then the quality gate names them).

type SectionRef = { id: string; title?: string };
type Props = {
  value: unknown;
  sections: readonly SectionRef[];
  onChange: (next: StudentToolsSpecV1 | undefined) => void;
  disabled?: boolean;
};

function emit(tools: StudentToolConfigV1[], overrides: Record<string, StudentToolId[]>, sectionIds: ReadonlySet<string>, onChange: Props["onChange"]): void {
  if (!tools.length) { onChange(undefined); return; }
  const enabled = new Set(tools.map(t => t.id));
  const sectionOverrides: Record<string, { disabled: StudentToolId[] }> = {};
  for (const [sid, list] of Object.entries(overrides)) {
    const kept = list.filter(id => enabled.has(id));
    if (sectionIds.has(sid) && kept.length) sectionOverrides[sid] = { disabled: kept };
  }
  const raw: StudentToolsSpecV1 = { version: 1, tools, ...(Object.keys(sectionOverrides).length ? { sectionOverrides } : {}) };
  const v = validateStudentTools(raw);
  if (v.ok) onChange(v.value);
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

  const setTools = (next: StudentToolConfigV1[]) => emit(next, overrides, sectionIds, onChange);
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
    emit(tools, { ...overrides, [sid]: [...list] }, sectionIds, onChange);
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
