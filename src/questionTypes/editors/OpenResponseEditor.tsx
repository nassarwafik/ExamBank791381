import { useId, useMemo, useState } from "react";
import type { AuthoringEditorProps } from "../registryTypes";
import type { Answer } from "../../answerState";
import type { Question } from "../../studentQuestionTypes";
import { OPEN_RESPONSE_LIMITS, OPEN_RESPONSE_PROFILES, OPEN_RESPONSE_PROFILE_LABELS, OPEN_RESPONSE_PROFILE_MAX_CHARS, projectOpenResponseForStudent, validateOpenResponseQuestion, type OpenResponseProfile } from "../../openResponseQuestion";
import type { RubricCriterion, RubricV1 } from "../../rubricEngine";
import RubricEditor, { type FieldIssue } from "../../openResponse/RubricEditor";
import OpenResponseView from "../../openResponse/OpenResponseView";
import { TeacherPreviewContext } from "../studentAttemptContext";
import "../../openResponse/openResponse.css";

// Phase 19E — openResponse@1 authoring (lazy). Workflow: the profile (essay / explain / justify / compare / analyze / source-based /
// general — an authoring hint that only suggests a length bound; it never touches the rubric) → instructions → length bounds → the
// rubric (shared RubricEditor: criteria, levels, private guidance) and its visibility to students → the PRIVATE model answer → a live
// student preview. One write sends the public config and the private key together; the canonical validator runs on every change and
// each issue is shown next to its field. There is no raw JSON anywhere.
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const numOr = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
function readRubric(raw: unknown): RubricV1 {
  const list = isObj(raw) && Array.isArray(raw.criteria) ? raw.criteria.filter(isObj) : [];
  return { v: 1, criteria: list.map((c): RubricCriterion => ({ id: str(c.id), title: str(c.title), description: str(c.description), maxPoints: c.maxPoints as number, allowCustomPoints: c.allowCustomPoints === true, guidance: str(c.guidance), levels: (Array.isArray(c.levels) ? c.levels.filter(isObj) : []).map(l => ({ id: str(l.id), label: str(l.label), points: l.points as number, description: str(l.description) })) })) };
}
/** "answer.rubric.criteria.0.levels.1.points" → "المعيار 1 · المستوى 2" (issue list prefix). */
function where(path: string) {
  const m = /criteria\.(\d+)(?:\.levels\.(\d+))?/.exec(path);
  return m ? "المعيار " + (Number(m[1]) + 1) + (m[2] !== undefined ? " · المستوى " + (Number(m[2]) + 1) : "") + ": " : "";
}

export default function OpenResponseEditor({ node, onChange, disabled }: AuthoringEditorProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const raw = isObj((node as { openResponse?: unknown }).openResponse) ? ((node as { openResponse: Record<string, unknown> }).openResponse) : {};
  const response = isObj(raw.response) ? raw.response : {};
  const cfg = {
    profile: ((OPEN_RESPONSE_PROFILES as readonly string[]).includes(str(raw.profile)) ? raw.profile : "general") as OpenResponseProfile,
    instructions: str(raw.instructions),
    minChars: numOr(response.minChars, 0),
    maxChars: numOr(response.maxChars, OPEN_RESPONSE_LIMITS.defaultMaxChars),
    visibility: raw.studentRubricVisibility === "visible" ? "visible" : "hidden"
  };
  const key = isObj(node.answer) ? node.answer : {};
  const rubric = useMemo(() => readRubric(key.rubric), [key.rubric]);
  const modelAnswer = str(key.modelAnswer);
  const [preview, setPreview] = useState(false);
  const [previewAnswer, setPreviewAnswer] = useState<Answer | undefined>(undefined);
  const issues = useMemo(() => validateOpenResponseQuestion(node as unknown as Record<string, unknown>), [node]);
  const byPath = useMemo(() => { const m = new Map<string, string>(); for (const i of issues) if (i.path && !m.has(i.path)) m.set(i.path, i.message); return m; }, [issues]);
  const issueAt = (path: string): FieldIssue => { const message = byPath.get(path); return message ? { id: "or-err-" + uid + "-" + path.replace(/[^a-zA-Z0-9]/g, "-"), message } : undefined; };

  const write = (next: Partial<typeof cfg> & { rubric?: RubricV1; modelAnswer?: string }) => {
    const c = { ...cfg, ...next };
    onChange({
      openResponse: { v: 1, profile: c.profile, instructions: c.instructions, response: { minChars: c.minChars, maxChars: c.maxChars }, studentRubricVisibility: c.visibility as "visible" | "hidden" },
      answer: { rubric: next.rubric ?? rubric, modelAnswer: next.modelAnswer ?? modelAnswer }
    } as never);
  };
  // A profile only SUGGESTS a length: the bound follows it while the teacher has not changed it; the rubric is never touched.
  const setProfile = (profile: OpenResponseProfile) => write({ profile, ...(cfg.maxChars === OPEN_RESPONSE_PROFILE_MAX_CHARS[cfg.profile] || cfg.maxChars === OPEN_RESPONSE_LIMITS.defaultMaxChars ? { maxChars: OPEN_RESPONSE_PROFILE_MAX_CHARS[profile] } : {}) });
  const lengthIssue = issueAt("openResponse.response"), modelIssue = issueAt("answer.modelAnswer"), insIssue = issueAt("openResponse.instructions");
  const rawMarks = (node as { marks?: unknown }).marks, marks = typeof rawMarks === "number" ? rawMarks : 0;
  const total = rubric.criteria.reduce((s, c) => s + (Number.isFinite(c.maxPoints) ? c.maxPoints : 0), 0);
  const studentQ = useMemo(() => ({ ...(node as unknown as Question), openResponse: projectOpenResponseForStudent((node as { openResponse?: unknown }).openResponse, node.answer) ?? undefined }) as Question, [node]);

  return (
    <div className="qt-editor qt-editor-openResponse or-editor" data-testid="qt-editor-openResponse">
      <fieldset>
        <legend>نوع الإجابة والتعليمات</legend>
        <label className="or-field"><span>نمط السؤال</span>
          <select value={cfg.profile} disabled={disabled} onChange={e => setProfile(e.target.value as OpenResponseProfile)}>
            {OPEN_RESPONSE_PROFILES.map(p => <option key={p} value={p}>{OPEN_RESPONSE_PROFILE_LABELS[p]}</option>)}
          </select>
        </label>
        <p className="or-hint">النمط يساعد في الإعداد والعرض فقط؛ لا يغيّر سلم التقييم ولا طريقة التصحيح.</p>
        <div className="or-field"><label htmlFor={"or-ins-" + uid}>تعليمات إضافية للطالب (اختياري)</label>
          <textarea id={"or-ins-" + uid} dir="auto" value={cfg.instructions} disabled={disabled} maxLength={OPEN_RESPONSE_LIMITS.instructionsChars} aria-invalid={insIssue ? true : undefined} aria-describedby={insIssue?.id} onChange={e => write({ instructions: e.target.value })} placeholder="مثال: قارن من حيث الموثوقية والسرعة، وادعم إجابتك بمثال." />
          {insIssue && <p className="or-field-error" id={insIssue.id}>{insIssue.message}</p>}
        </div>
        <div className="or-row">
          <label className="or-field"><span>الحد الأقصى لعدد الأحرف</span>
            <input type="number" inputMode="numeric" min={1} max={OPEN_RESPONSE_LIMITS.maxCharsCap} step={1} value={cfg.maxChars} disabled={disabled} aria-invalid={lengthIssue ? true : undefined} aria-describedby={lengthIssue?.id} onChange={e => write({ maxChars: Number(e.target.value) })} />
          </label>
          <label className="or-field"><span>حد أدنى مقترح للأحرف (إرشاد فقط)</span>
            <input type="number" inputMode="numeric" min={0} step={1} value={cfg.minChars} disabled={disabled} aria-invalid={lengthIssue ? true : undefined} aria-describedby={lengthIssue?.id} onChange={e => write({ minChars: Number(e.target.value) })} />
          </label>
        </div>
        {lengthIssue && <p className="or-field-error" id={lengthIssue.id}>{lengthIssue.message}</p>}
      </fieldset>
      <fieldset>
        <legend>سلم التقييم</legend>
        <label className="or-field"><span>ظهور سلم التقييم للطالب</span>
          <select value={cfg.visibility} disabled={disabled} onChange={e => write({ visibility: e.target.value === "visible" ? "visible" : "hidden" })}>
            <option value="hidden">مخفي عن الطالب</option>
            <option value="visible">ظاهر للطالب (العناوين والأوصاف والمستويات فقط، دون إرشادات المصحح)</option>
          </select>
        </label>
        <RubricEditor rubric={rubric} disabled={disabled} issueAt={issueAt} onChange={r => write({ rubric: r })} />
        <p className="or-hint" data-testid="rubric-scaling">تُحوَّل نقاط السلم إلى درجة السؤال بالتناسب: الدرجة = {marks} × النقاط الممنوحة ÷ {Number(total.toFixed(2)) || "—"}. الخادم وحده يحتسب الدرجة الرسمية من اختيارات المصحح.</p>
      </fieldset>
      <fieldset>
        <legend>الإجابة النموذجية (للمعلم فقط)</legend>
        <p className="or-private">لا تُرسل إلى الطالب أبدًا، ولا يقارن بها النظام إجابات الطلاب تلقائيًا؛ تظهر لك أثناء التصحيح فقط.</p>
        <div className="or-field"><label htmlFor={"or-model-" + uid}>الإجابة النموذجية</label>
          <textarea id={"or-model-" + uid} dir="auto" value={modelAnswer} disabled={disabled} maxLength={OPEN_RESPONSE_LIMITS.modelAnswerChars} aria-invalid={modelIssue ? true : undefined} aria-describedby={modelIssue?.id} onChange={e => write({ modelAnswer: e.target.value })} />
          {modelIssue && <p className="or-field-error" id={modelIssue.id}>{modelIssue.message}</p>}
        </div>
      </fieldset>
      {issues.length > 0 && <ul className="or-issues" aria-live="polite" data-testid="open-response-issues">{issues.map((i, n) => <li key={n}>{where(i.path ?? "") + i.message}</li>)}</ul>}
      <div className="or-actions"><button type="button" className="or-btn" aria-pressed={preview} onClick={() => setPreview(p => !p)}>معاينة الطالب</button></div>
      {preview && (
        <div data-testid="open-response-student-preview">
          <TeacherPreviewContext.Provider value={true}>
            <OpenResponseView q={studentQ} id="open-response-preview" answer={previewAnswer} onAnswer={setPreviewAnswer} labelPrefix="معاينة الطالب" />
          </TeacherPreviewContext.Provider>
        </div>
      )}
    </div>
  );
}
