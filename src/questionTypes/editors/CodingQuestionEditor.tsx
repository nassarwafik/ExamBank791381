import type { AuthoringEditorProps } from "../registryTypes";
import type { QuestionBody } from "../../examTypes";
import CodingEditor from "../../coding/CodingEditor";
import { duplicateCodingTest, moveCodingTest, newCodingTestId, removeCodingTest, updateCodingTest } from "../../coding/codingTests";
import { CODE_SOURCE_MAX_BYTES, CODING_COMPARATORS, CODING_LANGUAGES, CODING_LIMIT_RANGES, CODING_TEST_LIMITS, DEFAULT_CODING_COMPARATOR, codingLanguage, defaultCodingConfig, isCodingLanguage, type CodingComparator, type CodingLimits, type CodingQuestionConfigV1, type CodingTestCasePrivate, type CodingTestCasePublic } from "../../codingQuestion";
import "../../coding/coding.css";

// Phase 17A — coding@1 authoring (lazy). Edits the canonical node only: the PUBLIC configuration under `coding` (languages,
// default, starter code, public samples, limits) and the PRIVATE key under `answer` (hidden tests with stable ids and weights,
// output comparator, reference solutions). Languages come from the Coding Language Registry (data — no per-language code path).
// Test identity is the stable id (reorder / duplicate / delete never renumber). Nothing here runs, compiles or grades code.
type Key = { hiddenTests: CodingTestCasePrivate[]; comparator: CodingComparator; referenceSolutions: Record<string, string> };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const COMPARATOR_OPTIONS: Record<CodingComparator, string> = { exact: "مطابقة حرفية تامة", trimTrailingWhitespace: "تجاهل المسافات في نهايات الأسطر (افتراضي)", normalizeWhitespace: "توحيد كل المسافات (اختياري صريح)" };
const LIMIT_FIELDS: [keyof CodingLimits, string][] = [["sourceBytes", "الحد الأقصى لحجم الكود (بايت)"], ["outputBytes", "حد المخرجات (بايت)"], ["timeMs", "حد الوقت (ملّي ثانية)"], ["memoryMb", "حد الذاكرة (ميغابايت)"]];

function readConfig(node: QuestionBody): CodingQuestionConfigV1 {
  const c = isObj(node.coding) ? (node.coding as unknown as Record<string, unknown>) : (defaultCodingConfig() as unknown as Record<string, unknown>);
  return { ...(c as unknown as CodingQuestionConfigV1), allowedLanguages: Array.isArray(c.allowedLanguages) ? (c.allowedLanguages as string[]) : [], starterCode: isObj(c.starterCode) ? (c.starterCode as Record<string, string>) : {}, publicTests: Array.isArray(c.publicTests) ? (c.publicTests as CodingTestCasePublic[]) : [], limits: isObj(c.limits) ? (c.limits as unknown as CodingLimits) : defaultCodingConfig().limits };
}
function readKey(node: QuestionBody): Key {
  const a = isObj(node.answer) ? (node.answer as Record<string, unknown>) : {};
  return { hiddenTests: Array.isArray(a.hiddenTests) ? (a.hiddenTests as CodingTestCasePrivate[]) : [], comparator: CODING_COMPARATORS.includes(a.comparator as CodingComparator) ? (a.comparator as CodingComparator) : DEFAULT_CODING_COMPARATOR, referenceSolutions: isObj(a.referenceSolutions) ? (a.referenceSolutions as Record<string, string>) : {} };
}
const without = (o: Record<string, string>, k: string) => { const c = { ...o }; delete c[k]; return c; };

export default function CodingQuestionEditor({ node, onChange, disabled }: AuthoringEditorProps) {
  const cfg = readConfig(node), key = readKey(node);
  const known = cfg.allowedLanguages.filter(isCodingLanguage), unknown = cfg.allowedLanguages.filter(l => !isCodingLanguage(l));
  const setCfg = (patch: Partial<CodingQuestionConfigV1>) => onChange({ coding: { ...cfg, ...patch } } as Partial<QuestionBody>);
  const setKey = (patch: Partial<Key>) => onChange({ answer: { ...key, ...patch } } as Partial<QuestionBody>);
  const toggleLanguage = (lang: string, on: boolean) => {
    if (on) { if (!cfg.allowedLanguages.includes(lang)) setCfg({ allowedLanguages: [...cfg.allowedLanguages, lang], defaultLanguage: cfg.allowedLanguages.length ? cfg.defaultLanguage : lang }); return; }
    const allowedLanguages = cfg.allowedLanguages.filter(l => l !== lang);
    const defaultLanguage = cfg.defaultLanguage === lang ? (allowedLanguages.find(isCodingLanguage) ?? "") : cfg.defaultLanguage;
    onChange({ coding: { ...cfg, allowedLanguages, defaultLanguage, starterCode: without(cfg.starterCode ?? {}, lang) }, answer: { ...key, referenceSolutions: without(key.referenceSolutions, lang) } } as Partial<QuestionBody>);
  };
  const setLimit = (k: keyof CodingLimits, raw: string) => { const n = Number(raw); setCfg({ limits: { ...cfg.limits, [k]: raw.trim() === "" || !Number.isFinite(n) ? 0 : n } }); };
  const publicTests = cfg.publicTests ?? [];
  const sourceLimit = Math.min(CODE_SOURCE_MAX_BYTES, cfg.limits.sourceBytes || CODE_SOURCE_MAX_BYTES);
  const labelOf = (l: string) => codingLanguage(l)?.label ?? l;

  return (
    <div className="qt-editor cx-author" data-testid="qt-editor-coding">
      <dl className="cx-inspector" data-testid="coding-inspector">
        <div>نوع السؤال: برمجة</div><div>الإصدار: 1</div><div>طريقة التقييم الحالية: مراجعة يدوية</div><div>اللغات: {known.map(labelOf).join("، ") || "—"}</div>
      </dl>
      <p className="cx-help">في هذه المرحلة يمكن للطالب كتابة وتسليم الكود، ويقوم المعلم بمراجعته.<br />التشغيل والتصحيح الآلي يحتاجان إلى بيئة تنفيذ معزولة وسيتم ربطهما عبر محرك التنفيذ الآمن.</p>
      {unknown.length > 0 && <p className="cx-code-alert" data-testid="coding-unsupported-language" role="alert">لغة غير مدعومة: {unknown.join("، ")} — لن يُقبل السؤال في الاعتماد النهائي ولن تُحوَّل إلى لغة أخرى تلقائيًا.{" "}
        <button type="button" onClick={() => setCfg({ allowedLanguages: known, defaultLanguage: known.includes(cfg.defaultLanguage) ? cfg.defaultLanguage : (known[0] ?? "") })} disabled={disabled}>إزالة اللغات غير المدعومة</button></p>}

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
        <legend>الكود الابتدائي</legend>
        <p className="cx-help">اختياري لكل لغة؛ يظهر للطالب في بداية المحرر ويمكنه استعادته. لا تضع الحل هنا.</p>
        {known.map(l => <div key={l} className="cx-io-block"><span>{labelOf(l)}</span>
          <CodingEditor value={cfg.starterCode?.[l] ?? ""} onChange={v => setCfg({ starterCode: v === "" ? without(cfg.starterCode ?? {}, l) : { ...(cfg.starterCode ?? {}), [l]: v } })} language={l} label={"محرر الكود — الكود الابتدائي — " + labelOf(l)} readOnly={disabled} maxBytes={sourceLimit} minRows={4} />
        </div>)}
      </fieldset>

      <fieldset>
        <legend>أمثلة ظاهرة للطالب</legend>
        <p className="cx-help">تظهر للطالب كاملة (المدخلات والمخرجات النموذجية) للتوضيح والتدريب.</p>
        {publicTests.map((t, i) => { const n = i + 1, set = (patch: Partial<CodingTestCasePublic>) => setCfg({ publicTests: updateCodingTest(publicTests, t.id, patch) }); return (
          <div key={t.id} className="cx-test-row">
            <div className="cx-test-head"><strong>مثال {n}</strong>
              <span className="cx-test-actions">
                <button type="button" aria-label={"تحريك المثال " + n + " لأعلى"} onClick={() => setCfg({ publicTests: moveCodingTest(publicTests, t.id, -1) })} disabled={disabled || i === 0}>↑</button>
                <button type="button" aria-label={"تحريك المثال " + n + " لأسفل"} onClick={() => setCfg({ publicTests: moveCodingTest(publicTests, t.id, 1) })} disabled={disabled || i === publicTests.length - 1}>↓</button>
                <button type="button" aria-label={"تكرار المثال " + n} onClick={() => setCfg({ publicTests: duplicateCodingTest(publicTests, t.id, () => newCodingTestId("pub")) })} disabled={disabled || publicTests.length >= CODING_TEST_LIMITS.publicTests}>⧉</button>
                <button type="button" aria-label={"حذف المثال " + n} onClick={() => setCfg({ publicTests: removeCodingTest(publicTests, t.id) })} disabled={disabled}>✕</button>
              </span></div>
            <input className="sb-input" aria-label={"عنوان المثال " + n} placeholder="عنوان اختياري" value={t.title ?? ""} onChange={e => set({ title: e.target.value || undefined })} disabled={disabled} />
            <div className="cx-io-grid">
              <textarea className="cx-io" dir="ltr" aria-label={"مدخلات المثال " + n} value={t.input} onChange={e => set({ input: e.target.value })} disabled={disabled} spellCheck={false} />
              <textarea className="cx-io" dir="ltr" aria-label={"المخرجات النموذجية للمثال " + n} value={t.sampleOutput ?? ""} onChange={e => set({ sampleOutput: e.target.value })} disabled={disabled} spellCheck={false} />
            </div>
          </div>); })}
        <button type="button" onClick={() => setCfg({ publicTests: [...publicTests, { id: newCodingTestId("pub"), input: "", sampleOutput: "" }] })} disabled={disabled || publicTests.length >= CODING_TEST_LIMITS.publicTests}>إضافة مثال ظاهر</button>
      </fieldset>

      <fieldset data-private="true">
        <legend>اختبارات مخفية للتصحيح</legend>
        <p className="cx-help">لا تُرسل إلى الطالب أبدًا. ستُستخدم للتصحيح الآلي الموزون عند ربط محرك التنفيذ الآمن؛ حاليًا العلامة الرسمية هي علامة المعلم.</p>
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
        <p className="cx-help">مساعدة للتأليف والمراجعة اليدوية؛ لا تُرسل إلى الطالب ولا يُصحَّح بمقارنة نص الكود بها.</p>
        {known.map(l => <div key={l} className="cx-io-block"><span>{labelOf(l)}</span>
          <CodingEditor value={key.referenceSolutions[l] ?? ""} onChange={v => setKey({ referenceSolutions: v === "" ? without(key.referenceSolutions, l) : { ...key.referenceSolutions, [l]: v } })} language={l} label={"محرر الكود — الحل المرجعي — " + labelOf(l)} readOnly={disabled} maxBytes={CODE_SOURCE_MAX_BYTES} minRows={4} />
        </div>)}
      </fieldset>

      <fieldset>
        <legend>حدود التنفيذ</legend>
        <p className="cx-help">تُرسل إلى محرك التنفيذ الآمن عند تفعيله؛ لا يُشغَّل أي كود الآن. الحد الأقصى لحجم الكود يُطبَّق على إجابة الطالب فورًا.</p>
        <div className="cx-limits">
          {LIMIT_FIELDS.map(([k, label]) => <label key={k}><span>{label}</span><input className="sb-input sb-input-sm" type="number" step="1" min={CODING_LIMIT_RANGES[k][0]} max={CODING_LIMIT_RANGES[k][1]} aria-label={label} value={Number.isFinite(cfg.limits[k]) ? String(cfg.limits[k]) : ""} onChange={e => setLimit(k, e.target.value)} disabled={disabled} /></label>)}
        </div>
      </fieldset>
    </div>
  );
}
