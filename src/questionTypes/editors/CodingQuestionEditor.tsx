import { useId } from "react";
import type { AuthoringEditorProps } from "../registryTypes";
import type { QuestionBody } from "../../examTypes";
import CodingEditor from "../../coding/CodingEditor";
import { duplicateCodingTest, moveCodingTest, newCodingTestId, removeCodingTest, updateCodingTest } from "../../coding/codingTests";
import { CODE_SOURCE_MAX_BYTES, CODING_COMPARATORS, CODING_LANGUAGES, CODING_LIMIT_RANGES, CODING_TEST_LIMITS, DEFAULT_CODING_COMPARATOR, codingCompileErrorPolicy, codingGradingMode, codingLanguage, codingScoringPolicy, codingStarterTemplate, defaultCodingConfig, isCodingLanguage, validateCodingQuestion, type CodingComparator, type CodingCompileErrorPolicy, type CodingGradingMode, type CodingLimits, type CodingQuestionConfigV1, type CodingScoringPolicy, type CodingTestCasePrivate, type CodingTestCasePublic } from "../../codingQuestion";
import { OFFICIAL_STDOUT_CAPTURE_BYTES } from "../../codingContract";
import "../../coding/coding.css";

// Phase 17A — coding@1 authoring (lazy). Edits the canonical node only: the PUBLIC configuration under `coding` (languages,
// default, starter code, public samples, limits) and the PRIVATE key under `answer` (hidden tests with stable ids and weights,
// output comparator, reference solutions). Languages come from the Coding Language Registry (data — no per-language code path).
// Test identity is the stable id (reorder / duplicate / delete never renumber). Nothing here runs, compiles or grades code.
// Phase 17C — the OFFICIAL grading mode lives under the PRIVATE key (`answer.gradingMode`: "manual" — the default, also when
// missing — or "hiddenTests": graded on the SmartAssess server from the isolated runner's raw evidence). Switching the mode never
// deletes hidden tests, the comparator or reference solutions.
// Phase 17E-A — the enterprise layout: logical sections (environment → starter code → public examples → hidden tests → grading →
// validation), the PRIVATE scoring policy (`answer.scoringPolicy`: proportional — default, also when missing — or allOrNothing),
// the registry's minimal starter template (seeded when a language with no starter code is allowed, restorable on demand — never
// overwriting existing code), accessible limits (range hints, aria-invalid), and INLINE validation through the ONE canonical
// validator (validateCodingQuestion — the same rules finalization applies; no ad-hoc checks here).
// Phase 17F-C2 — the PRIVATE compile-error policy (`answer.compileErrorPolicy`: absent = legacy "zero"; new questions default to
// "manualReview"). It answers ONLY the Runner's structural compile-error verdict (compiled languages such as Java / C#); nothing
// here, or anywhere in SmartAssess, decides that a syntax error is "minor" — the teacher sets the mark in the review.
type Key = { hiddenTests: CodingTestCasePrivate[]; comparator: CodingComparator; referenceSolutions: Record<string, string>; gradingMode: CodingGradingMode; scoringPolicy?: CodingScoringPolicy; compileErrorPolicy?: CodingCompileErrorPolicy };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const COMPARATOR_OPTIONS: Record<CodingComparator, string> = { exact: "مطابقة حرفية تامة", trimTrailingWhitespace: "تجاهل المسافات في نهايات الأسطر (افتراضي)", normalizeWhitespace: "توحيد كل المسافات (اختياري صريح)" };
const COMPARATOR_SHORT: Record<CodingComparator, string> = { exact: "مطابقة حرفية تامة", trimTrailingWhitespace: "تجاهل المسافات في نهايات الأسطر", normalizeWhitespace: "توحيد كل المسافات" };
const MODE_LABELS: Record<CodingGradingMode, string> = { manual: "يدوي بواسطة المعلم", hiddenTests: "تلقائي بواسطة الاختبارات المخفية" };
const POLICY_LABELS: Record<CodingScoringPolicy, string> = { proportional: "علامة نسبية حسب أوزان الاختبارات", allOrNothing: "كل شيء أو لا شيء" };
const POLICY_HELP: Record<CodingScoringPolicy, string> = { proportional: "العلامة = علامة السؤال × (مجموع أوزان الاختبارات الناجحة ÷ مجموع كل الأوزان).", allOrNothing: "العلامة كاملة فقط إذا نجحت جميع الاختبارات المخفية، وإلا فهي صفر." };
const COMPILE_POLICY_LABELS: Record<CodingCompileErrorPolicy, string> = { zero: "احتساب صفر تلقائيًا", manualReview: "إرسال للمراجعة اليدوية" };
const COMPILE_POLICY_HELP: Record<CodingCompileErrorPolicy, string> = {
  zero: "عند فشل تجميع الكود يُحتسب للسؤال صفر تلقائيًا ويُعدّ التصحيح الآلي مكتملًا (السلوك السابق).",
  manualReview: "المراجعة اليدوية مناسبة عندما تريد منح الطالب جزءًا من العلامة إذا كان الحل صحيحًا من حيث الفكرة لكن يحتوي خطأً نحويًا يمنع التجميع. لا تُحتسب أي علامة آلية؛ يظهر السؤال للمعلم مع كود الطالب ورسالة المترجم."
};
const COMPILE_POLICY_NOTE = "SmartAssess لا يقرر تلقائيًا إن كان الخطأ بسيطًا أو يستحق خصمًا معينًا؛ المعلم يحدد العلامة.";
const COMPILE_POLICY_SCOPE = "تنطبق هذه السياسة فقط عندما يُبلغ محرك التنفيذ عن فشل حقيقي في تجميع الكود (حاليًا اللغات المُجمَّعة مثل Java وC#). أخطاء التشغيل والمخرجات غير المطابقة تُحتسب حسب سياسة احتساب العلامة كالمعتاد.";
const sumWeights = (tests: CodingTestCasePrivate[]) => Math.round(tests.reduce((s, t) => s + (Number.isFinite(t.weight) && t.weight > 0 ? t.weight : 0), 0) * 100) / 100;
const LIMIT_FIELDS: [keyof CodingLimits, string][] = [["sourceBytes", "الحد الأقصى لحجم الكود (بايت)"], ["outputBytes", "حد المخرجات (بايت)"], ["timeMs", "حد الوقت (ملّي ثانية)"], ["memoryMb", "حد الذاكرة (ميغابايت)"]];
const inRange = (k: keyof CodingLimits, v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= CODING_LIMIT_RANGES[k][0] && v <= CODING_LIMIT_RANGES[k][1];

function readConfig(node: QuestionBody): CodingQuestionConfigV1 {
  const c = isObj(node.coding) ? (node.coding as unknown as Record<string, unknown>) : (defaultCodingConfig() as unknown as Record<string, unknown>);
  return { ...(c as unknown as CodingQuestionConfigV1), allowedLanguages: Array.isArray(c.allowedLanguages) ? (c.allowedLanguages as string[]) : [], starterCode: isObj(c.starterCode) ? (c.starterCode as Record<string, string>) : {}, publicTests: Array.isArray(c.publicTests) ? (c.publicTests as CodingTestCasePublic[]) : [], limits: isObj(c.limits) ? (c.limits as unknown as CodingLimits) : defaultCodingConfig().limits };
}
function readKey(node: QuestionBody): Key {
  const a = isObj(node.answer) ? (node.answer as Record<string, unknown>) : {};
  // the stored policy value is kept verbatim (an unknown value stays visible to the validator — never silently rewritten)
  return { hiddenTests: Array.isArray(a.hiddenTests) ? (a.hiddenTests as CodingTestCasePrivate[]) : [], comparator: CODING_COMPARATORS.includes(a.comparator as CodingComparator) ? (a.comparator as CodingComparator) : DEFAULT_CODING_COMPARATOR, referenceSolutions: isObj(a.referenceSolutions) ? (a.referenceSolutions as Record<string, string>) : {}, gradingMode: codingGradingMode(a), ...(a.scoringPolicy !== undefined ? { scoringPolicy: a.scoringPolicy as CodingScoringPolicy } : {}), ...(a.compileErrorPolicy !== undefined ? { compileErrorPolicy: a.compileErrorPolicy as CodingCompileErrorPolicy } : {}) };
}
const without = (o: Record<string, string>, k: string) => { const c = { ...o }; delete c[k]; return c; };

export default function CodingQuestionEditor({ node, onChange, disabled }: AuthoringEditorProps) {
  const cfg = readConfig(node), key = readKey(node);
  const known = cfg.allowedLanguages.filter(isCodingLanguage), unknown = cfg.allowedLanguages.filter(l => !isCodingLanguage(l));
  const setCfg = (patch: Partial<CodingQuestionConfigV1>) => onChange({ coding: { ...cfg, ...patch } } as Partial<QuestionBody>);
  const setKey = (patch: Partial<Key>) => onChange({ answer: { ...key, ...patch } } as Partial<QuestionBody>);
  const toggleLanguage = (lang: string, on: boolean) => {
    if (on) {
      if (cfg.allowedLanguages.includes(lang)) return;
      const template = codingStarterTemplate(lang), starter = cfg.starterCode ?? {};
      // Phase 17E-A — a newly allowed language with NO starter code gets the registry's minimal shell; existing code is never replaced
      const starterCode = template && !(typeof starter[lang] === "string" && starter[lang] !== "") ? { ...starter, [lang]: template } : starter;
      setCfg({ allowedLanguages: [...cfg.allowedLanguages, lang], defaultLanguage: cfg.allowedLanguages.length ? cfg.defaultLanguage : lang, starterCode });
      return;
    }
    const allowedLanguages = cfg.allowedLanguages.filter(l => l !== lang);
    const defaultLanguage = cfg.defaultLanguage === lang ? (allowedLanguages.find(isCodingLanguage) ?? "") : cfg.defaultLanguage;
    onChange({ coding: { ...cfg, allowedLanguages, defaultLanguage, starterCode: without(cfg.starterCode ?? {}, lang) }, answer: { ...key, referenceSolutions: without(key.referenceSolutions, lang) } } as Partial<QuestionBody>);
  };
  const setLimit = (k: keyof CodingLimits, raw: string) => { const n = Number(raw); setCfg({ limits: { ...cfg.limits, [k]: raw.trim() === "" || !Number.isFinite(n) ? 0 : n } }); };
  const publicTests = cfg.publicTests ?? [];
  const sourceLimit = Math.min(CODE_SOURCE_MAX_BYTES, cfg.limits.sourceBytes || CODE_SOURCE_MAX_BYTES);
  const labelOf = (l: string) => codingLanguage(l)?.label ?? l;
  const uid = useId(), modeName = uid + "-mode", policyName = uid + "-policy";
  const policy = codingScoringPolicy(key);
  const compilePolicy = codingCompileErrorPolicy(key);
  const marks = (node as unknown as { marks?: unknown }).marks;
  const marksText = typeof marks === "number" && Number.isFinite(marks) && marks > 0 ? String(marks) : "—";
  // the ONE canonical validator — exactly the rules finalization blocks on (no second, editor-only rule set)
  let issues: { code: string; message: string }[] = [];
  try { issues = validateCodingQuestion(node as unknown as Record<string, unknown>); } catch { issues = [{ code: "CODING_CONFIG_MISSING", message: "إعداد سؤال البرمجة غير صالح." }]; }

  return (
    <div className="qt-editor cx-author" data-testid="qt-editor-coding">
      <dl className="cx-inspector" data-testid="coding-inspector">
        <div>نوع السؤال: برمجة</div><div>الإصدار: 1</div><div>طريقة التصحيح الرسمي: {MODE_LABELS[key.gradingMode]}</div><div>اللغات: {known.map(labelOf).join("، ") || "—"}</div>
      </dl>
      <p className="cx-help">يكتب الطالب الكود ويسلّمه، ويمكنه تجربته على الأمثلة الظاهرة عبر محرك التنفيذ المعزول.<br />العلامة الرسمية إما من المعلم، أو تُحتسب تلقائيًا على الخادم من الاختبارات المخفية.</p>
      {unknown.length > 0 && <p className="cx-code-alert" data-testid="coding-unsupported-language" role="alert">لغة غير مدعومة: {unknown.join("، ")} — لن يُقبل السؤال في الاعتماد النهائي ولن تُحوَّل إلى لغة أخرى تلقائيًا.{" "}
        <button type="button" onClick={() => setCfg({ allowedLanguages: known, defaultLanguage: known.includes(cfg.defaultLanguage) ? cfg.defaultLanguage : (known[0] ?? "") })} disabled={disabled}>إزالة اللغات غير المدعومة</button></p>}

      <fieldset data-coding-section="البيئة والتنفيذ">
        <legend>البيئة والتنفيذ</legend>
        <fieldset>
          <legend>اللغات المسموحة</legend>
          <div className="cx-lang-grid">
            {CODING_LANGUAGES.map(l => <label key={l.key}><input type="checkbox" aria-label={l.label} checked={cfg.allowedLanguages.includes(l.key)} onChange={e => toggleLanguage(l.key, e.target.checked)} disabled={disabled} /><span>{l.label}</span>{!l.capabilities.tests && <small> (مراجعة يدوية فقط، بلا اختبارات إدخال/إخراج)</small>}</label>)}
          </div>
          <label className="sb-inline"><span>اللغة الافتراضية</span>
            <select className="sb-input sb-input-sm" aria-label="اللغة الافتراضية" value={known.includes(cfg.defaultLanguage) ? cfg.defaultLanguage : ""} onChange={e => setCfg({ defaultLanguage: e.target.value })} disabled={disabled}>
              {!known.includes(cfg.defaultLanguage) && <option value="">— اختر —</option>}
              {known.map(l => <option key={l} value={l}>{labelOf(l)}</option>)}
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>حدود التنفيذ</legend>
          <p className="cx-help">تُطبَّق على التجربة وعلى التصحيح الرسمي في محرك التنفيذ المعزول. الحد الأقصى لحجم الكود يُطبَّق على إجابة الطالب فورًا.</p>
          <p className="cx-help">التصحيح الرسمي يلتقط حتى {OFFICIAL_STDOUT_CAPTURE_BYTES} بايت من مخرجات كل اختبار مخفي، مهما كان حد المخرجات أعلى.</p>
          <div className="cx-limits">
            {LIMIT_FIELDS.map(([k, label]) => { const hintId = uid + "-limit-" + k, bad = !inRange(k, cfg.limits[k]); return (
              <label key={k}><span>{label}</span>
                <input className="sb-input sb-input-sm" type="number" step="1" min={CODING_LIMIT_RANGES[k][0]} max={CODING_LIMIT_RANGES[k][1]} aria-label={label} aria-describedby={hintId} aria-invalid={bad || undefined} value={Number.isFinite(cfg.limits[k]) ? String(cfg.limits[k]) : ""} onChange={e => setLimit(k, e.target.value)} disabled={disabled} />
                <small id={hintId} className={bad ? "cx-limit-hint is-invalid" : "cx-limit-hint"}>المدى المسموح: {CODING_LIMIT_RANGES[k][0]}–{CODING_LIMIT_RANGES[k][1]} (عدد صحيح)</small>
              </label>); })}
          </div>
        </fieldset>
      </fieldset>

      <fieldset data-coding-section="الكود الابتدائي">
        <legend>الكود الابتدائي</legend>
        <p className="cx-help">اختياري لكل لغة؛ يظهر للطالب في بداية المحرر ويمكنه استعادته. لا تضع الحل هنا.</p>
        {known.map(l => { const template = codingStarterTemplate(l), current = cfg.starterCode?.[l] ?? ""; return (
          <div key={l} className="cx-io-block"><span>{labelOf(l)}</span>
            <CodingEditor value={current} onChange={v => setCfg({ starterCode: v === "" ? without(cfg.starterCode ?? {}, l) : { ...(cfg.starterCode ?? {}), [l]: v } })} language={l} label={"محرر الكود — الكود الابتدائي — " + labelOf(l)} readOnly={disabled} maxBytes={sourceLimit} minRows={4} />
            {template && current === "" && <button type="button" onClick={() => setCfg({ starterCode: { ...(cfg.starterCode ?? {}), [l]: template } })} disabled={disabled}>{"إدراج القالب الأساسي — " + labelOf(l)}</button>}
          </div>); })}
      </fieldset>

      <fieldset data-coding-section="أمثلة ظاهرة للطالب">
        <legend>أمثلة ظاهرة للطالب</legend>
        <p className="cx-help">تظهر للطالب كاملة (المدخلات والمخرجات النموذجية والعنوان) للتوضيح والتدريب.</p>
        {publicTests.map((t, i) => { const n = i + 1, set = (patch: Partial<CodingTestCasePublic>) => setCfg({ publicTests: updateCodingTest(publicTests, t.id, patch) }); return (
          <div key={t.id} className="cx-test-row">
            <div className="cx-test-head"><strong>مثال {n}</strong>
              <span className="cx-test-actions">
                <button type="button" aria-label={"تحريك المثال " + n + " لأعلى"} onClick={() => setCfg({ publicTests: moveCodingTest(publicTests, t.id, -1) })} disabled={disabled || i === 0}>↑</button>
                <button type="button" aria-label={"تحريك المثال " + n + " لأسفل"} onClick={() => setCfg({ publicTests: moveCodingTest(publicTests, t.id, 1) })} disabled={disabled || i === publicTests.length - 1}>↓</button>
                <button type="button" aria-label={"تكرار المثال " + n} onClick={() => setCfg({ publicTests: duplicateCodingTest(publicTests, t.id, () => newCodingTestId("pub")) })} disabled={disabled || publicTests.length >= CODING_TEST_LIMITS.publicTests}>⧉</button>
                <button type="button" aria-label={"حذف المثال " + n} onClick={() => setCfg({ publicTests: removeCodingTest(publicTests, t.id) })} disabled={disabled}>✕</button>
              </span></div>
            <input className="sb-input" aria-label={"عنوان المثال " + n} placeholder="عنوان اختياري (يظهر للطالب)" value={t.title ?? ""} onChange={e => set({ title: e.target.value || undefined })} disabled={disabled} />
            <div className="cx-io-grid">
              <textarea className="cx-io" dir="ltr" aria-label={"مدخلات المثال " + n} value={t.input} onChange={e => set({ input: e.target.value })} disabled={disabled} spellCheck={false} />
              <textarea className="cx-io" dir="ltr" aria-label={"المخرجات النموذجية للمثال " + n} value={t.sampleOutput ?? ""} onChange={e => set({ sampleOutput: e.target.value })} disabled={disabled} spellCheck={false} />
            </div>
          </div>); })}
        <button type="button" onClick={() => setCfg({ publicTests: [...publicTests, { id: newCodingTestId("pub"), input: "", sampleOutput: "" }] })} disabled={disabled || publicTests.length >= CODING_TEST_LIMITS.publicTests}>إضافة مثال ظاهر</button>
      </fieldset>

      <fieldset data-private="true" data-coding-section="اختبارات مخفية للتصحيح">
        <legend>اختبارات مخفية للتصحيح</legend>
        <p className="cx-help">لا تُرسل إلى الطالب أبدًا، ولا يرى محرك التنفيذ إلا مدخلاتها. تُستخدم للتصحيح الآلي الموزون على الخادم عند اختيار «{MODE_LABELS.hiddenTests}». ترتيبها هو ترتيب التنفيذ الرسمي.</p>
        {key.hiddenTests.map((t, i) => { const n = i + 1, set = (patch: Partial<CodingTestCasePrivate>) => setKey({ hiddenTests: updateCodingTest(key.hiddenTests, t.id, patch) }); return (
          <div key={t.id} className="cx-test-row is-private">
            <div className="cx-test-head"><strong>اختبار مخفي {n}</strong><span className="cx-private-badge">مخفي عن الطالب</span>
              <span className="cx-test-actions">
                <button type="button" aria-label={"تحريك الاختبار المخفي " + n + " لأعلى"} onClick={() => setKey({ hiddenTests: moveCodingTest(key.hiddenTests, t.id, -1) })} disabled={disabled || i === 0}>↑</button>
                <button type="button" aria-label={"تحريك الاختبار المخفي " + n + " لأسفل"} onClick={() => setKey({ hiddenTests: moveCodingTest(key.hiddenTests, t.id, 1) })} disabled={disabled || i === key.hiddenTests.length - 1}>↓</button>
                <button type="button" aria-label={"تكرار الاختبار المخفي " + n} onClick={() => setKey({ hiddenTests: duplicateCodingTest(key.hiddenTests, t.id, () => newCodingTestId("hid")) })} disabled={disabled || key.hiddenTests.length >= CODING_TEST_LIMITS.hiddenTests}>⧉</button>
                <button type="button" aria-label={"حذف الاختبار المخفي " + n} onClick={() => setKey({ hiddenTests: removeCodingTest(key.hiddenTests, t.id) })} disabled={disabled}>✕</button>
              </span></div>
            <input className="sb-input" aria-label={"عنوان الاختبار المخفي " + n} placeholder="عنوان للمعلم فقط" value={t.title ?? ""} onChange={e => set({ title: e.target.value || undefined })} disabled={disabled} />
            <div className="cx-io-grid">
              <textarea className="cx-io" dir="ltr" aria-label={"مدخلات الاختبار المخفي " + n} value={t.input} onChange={e => set({ input: e.target.value })} disabled={disabled} spellCheck={false} />
              <textarea className="cx-io" dir="ltr" aria-label={"المخرجات المتوقعة للاختبار المخفي " + n} value={t.expectedOutput} onChange={e => set({ expectedOutput: e.target.value })} disabled={disabled} spellCheck={false} />
            </div>
            <label className="sb-inline"><span>الوزن</span><input className="sb-input sb-input-sm" type="number" min="0" step="any" aria-label={"وزن الاختبار المخفي " + n} value={Number.isFinite(t.weight) ? String(t.weight) : ""} onChange={e => { const w = Number(e.target.value); set({ weight: e.target.value.trim() === "" || !Number.isFinite(w) ? Number.NaN : w }); }} disabled={disabled} /></label>
          </div>); })}
        <button type="button" onClick={() => setKey({ hiddenTests: [...key.hiddenTests, { id: newCodingTestId("hid"), input: "", expectedOutput: "", weight: 1 }] })} disabled={disabled || key.hiddenTests.length >= CODING_TEST_LIMITS.hiddenTests}>إضافة اختبار مخفي</button>
        <label className="sb-inline"><span>طريقة مقارنة المخرجات</span>
          <select className="sb-input sb-input-sm" aria-label="طريقة مقارنة المخرجات" value={key.comparator} onChange={e => setKey({ comparator: e.target.value as CodingComparator })} disabled={disabled}>
            {CODING_COMPARATORS.map(c => <option key={c} value={c}>{COMPARATOR_OPTIONS[c]}</option>)}
          </select>
        </label>
      </fieldset>

      <fieldset data-private="true">
        <legend>الحلول المرجعية (للمعلم فقط)</legend>
        <p className="cx-help">مساعدة للمعلم فقط؛ لا تُرسل إلى الطالب ولا إلى محرك التنفيذ، ولا يُصحَّح بمقارنة نص الكود بها.</p>
        {known.map(l => <div key={l} className="cx-io-block"><span>{labelOf(l)}</span>
          <CodingEditor value={key.referenceSolutions[l] ?? ""} onChange={v => setKey({ referenceSolutions: v === "" ? without(key.referenceSolutions, l) : { ...key.referenceSolutions, [l]: v } })} language={l} label={"محرر الكود — الحل المرجعي — " + labelOf(l)} readOnly={disabled} maxBytes={CODE_SOURCE_MAX_BYTES} minRows={4} />
        </div>)}
      </fieldset>

      <fieldset data-private="true" data-coding-section="التصحيح والعلامة">
        <legend>التصحيح والعلامة</legend>
        <fieldset role="radiogroup" aria-label="طريقة التصحيح الرسمي" className="cx-grading-mode">
          <legend>طريقة التصحيح الرسمي</legend>
          {(["manual", "hiddenTests"] as const).map(m => <label key={m}><input type="radio" name={modeName} value={m} checked={key.gradingMode === m} onChange={() => setKey({ gradingMode: m })} disabled={disabled} /><span>{MODE_LABELS[m]}</span></label>)}
          {key.gradingMode === "hiddenTests"
            ? <div className="cx-help" data-testid="coding-auto-info"><p>الاختبارات المخفية لا تظهر للطالب، ويتم احتساب العلامة على الخادم بواسطة محرك التنفيذ المعزول.</p>
              <p>عدد الاختبارات المخفية: {key.hiddenTests.length} · مجموع الأوزان: {sumWeights(key.hiddenTests)} · طريقة المقارنة: {COMPARATOR_SHORT[key.comparator]}</p>
              {key.hiddenTests.length === 0 && <p className="cx-code-alert" role="alert">أضف اختبارًا مخفيًا واحدًا على الأقل ليُصحَّح السؤال تلقائيًا.</p>}</div>
            : key.hiddenTests.length > 0 && <p className="cx-help" data-testid="coding-manual-hidden-notice">الاختبارات المخفية محفوظة، لكنها لا تُستخدم في العلامة الرسمية في وضع التصحيح اليدوي.</p>}
        </fieldset>
        <fieldset role="radiogroup" aria-label="سياسة احتساب العلامة" className="cx-grading-mode">
          <legend>سياسة احتساب العلامة (للتصحيح التلقائي)</legend>
          {(["proportional", "allOrNothing"] as const).map(p => <label key={p}><input type="radio" name={policyName} value={p} checked={policy === p} aria-describedby={uid + "-policy-" + p} onChange={() => setKey({ scoringPolicy: p })} disabled={disabled} /><span>{POLICY_LABELS[p]}</span></label>)}
          {(["proportional", "allOrNothing"] as const).map(p => <p key={p} id={uid + "-policy-" + p} className="cx-help">{POLICY_LABELS[p]}: {POLICY_HELP[p]}</p>)}
        </fieldset>
        <fieldset role="radiogroup" aria-label="عند فشل تجميع الكود" className="cx-grading-mode" data-testid="coding-compile-policy">
          <legend>عند فشل تجميع الكود</legend>
          {(["zero", "manualReview"] as const).map(p => <label key={p}><input type="radio" name={uid + "-compile"} value={p} checked={compilePolicy === p} aria-describedby={uid + "-compile-" + p} onChange={() => setKey({ compileErrorPolicy: p })} disabled={disabled} /><span>{COMPILE_POLICY_LABELS[p]}</span></label>)}
          {(["zero", "manualReview"] as const).map(p => <p key={p} id={uid + "-compile-" + p} className="cx-help">{COMPILE_POLICY_LABELS[p]}: {COMPILE_POLICY_HELP[p]}</p>)}
          <p className="cx-help">{COMPILE_POLICY_NOTE}</p>
          <p className="cx-help">{COMPILE_POLICY_SCOPE}</p>
        </fieldset>
        <p className="cx-help" data-testid="coding-mark-semantics">علامة السؤال: {marksText}. {key.gradingMode === "hiddenTests" ? POLICY_HELP[policy] + " تحتسبها SmartAssess على الخادم، ولا يقرر محرك التنفيذ أي علامة." : "يضع المعلم العلامة يدويًا عند المراجعة؛ سياسة الاحتساب تُطبَّق فقط عند اختيار التصحيح التلقائي."}</p>
      </fieldset>

      <section className="cx-validation" data-coding-section="التحقق من السؤال" data-testid="coding-validation" aria-labelledby={uid + "-validation"}>
        <h4 id={uid + "-validation"}>التحقق من السؤال</h4>
        {issues.length === 0
          ? <p className="cx-help">لا توجد مشكلات في إعداد سؤال البرمجة.</p>
          : <><p className="cx-code-alert">مشكلات تمنع الاعتماد النهائي ({issues.length}):</p><ul>{issues.map((i, n) => <li key={i.code + n}>{i.message}</li>)}</ul></>}
      </section>
    </div>
  );
}
