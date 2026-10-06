import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import Dialog from "../ui/Dialog";
import { useConfirm } from "../ui/useConfirm";
import type { Answer, FieldValue } from "../StudentQuestionCard";
import { normalizeExamStructure, type StructuredExam as StudentStructuredExam } from "../examStructure";
import { toSafePreviewExam, type PreviewExamInput } from "../examPreviewModel";
import { TeacherPreviewContext } from "../questionTypes/studentAttemptContext";
import { QUESTION_TYPE_CATALOG } from "../questionTypeCatalog";
import PresentationRoot, { PresentationExamSection } from "./PresentationRoot";
import {
  COLOR_TOKENS, CONTRAST_POLICY, PRESENTATION_PRESETS, PRESENTATION_VOCABULARY, contrastRatio, normalizeHexColor, presentationContrastIssues,
  resolvePresentation, validatePresentation, validateSectionPresentation,
  type ColorToken, type ContrastIssue, type Palette, type PresentationIssue, type PresetId, type Slot
} from "./presentationModel";
import "./presentation-studio.css";

// Phase 20D.1 — the Presentation Studio: a lazy builder dialog that edits exam.presentation (and the bounded section overrides) by
// SELECTING vocabulary values only — preset ids, strict #RRGGBB colours, token words, slot / type variants. It never writes CSS, class
// names, URLs or free text, and every write is re-validated by the same authority the finalization gate uses (presentationModel) before
// it reaches the exam. Writes go through the builder's functional updater (history, dirty state and autosave stay with the owner). The
// live preview renders the exam's own questions through the REAL runtime (PresentationRoot → shared section shell → StudentQuestionCard).

type Json = Record<string, unknown>;
// Structural view of the exam the Studio reads / writes (the builder passes its StructuredExam; extra fields are carried through untouched).
type SectionLike = { id: string; title?: string; presentation?: unknown; questions?: unknown[] };
type StudioExam = { title?: unknown; presentation?: unknown; sections?: unknown };
type Props = { exam: StudioExam; onChange: (updater: (prev: StudioExam) => StudioExam) => void; onClose: () => void };
const sectionsOf = (e: StudioExam): SectionLike[] => (Array.isArray(e.sections) ? (e.sections as SectionLike[]).filter(s => isObj(s)) : []);

const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const PRESET_IDS = Object.keys(PRESENTATION_PRESETS) as PresetId[];
const isPresetId = (v: unknown): v is PresetId => typeof v === "string" && (PRESET_IDS as string[]).includes(v);

/** Sets (or, with undefined, deletes) one code-owned path inside a draft, creating intermediate objects. */
function setPath(root: Json, path: readonly string[], value: unknown) {
  let o = root;
  for (const k of path.slice(0, -1)) { if (!isObj(o[k])) o[k] = {}; o = o[k] as Json; }
  const last = path[path.length - 1];
  if (value === undefined) delete o[last]; else o[last] = value;
}
const getPath = (root: unknown, path: readonly string[]): unknown => path.reduce<unknown>((o, k) => (isObj(o) ? o[k] : undefined), root);
/** Removes empty sub-objects so the stored JSON stays minimal. */
function prune(o: Json): Json {
  for (const k of Object.keys(o)) { const v = o[k]; if (isObj(v)) { prune(v); if (!Object.keys(v).length) delete o[k]; } }
  return o;
}

// ── analysis of the stored value ────────────────────────────────────────────────────────────────────────────────────────────────────
type Analysis =
  | { kind: "absent" | "ok"; raw: Json; preset: PresetId; contrast: ContrastIssue[] }
  | { kind: "malformed"; issues: PresentationIssue[]; preset: PresetId | null };
function analyze(value: unknown): Analysis {
  if (value === undefined || value === null) return { kind: "absent", raw: { schemaVersion: 1, preset: "default" }, preset: "default", contrast: [] };
  const r = validatePresentation(value);
  if (r.ok && r.value) return { kind: "ok", raw: clone(r.value) as Json, preset: r.value.preset, contrast: [] };
  // A structurally valid value whose ONLY problem is contrast stays editable (that is how the author fixes it); finalization blocks it.
  if (r.issues.length && r.issues.every(i => i.code === "PRESENTATION_CONTRAST") && isObj(value) && isPresetId(value.preset)) {
    const raw = clone(value);
    return { kind: "ok", raw, preset: value.preset, contrast: presentationContrastIssues(paletteOf(raw)) };
  }
  return { kind: "malformed", issues: r.issues, preset: isObj(value) && isPresetId(value.preset) ? value.preset : null };
}
function paletteOf(raw: Json): Palette {
  const preset = isPresetId(raw.preset) ? raw.preset : "default";
  const out = { ...PRESENTATION_PRESETS[preset].colors };
  const c = getPath(raw, ["tokens", "colors"]);
  if (isObj(c)) for (const k of COLOR_TOKENS) { const h = normalizeHexColor(c[k]); if (h) out[k] = h; }
  return out;
}
const customized = (a: Analysis) => a.kind === "malformed" || (a.kind === "ok" && Object.keys(a.raw).some(k => k !== "schemaVersion" && k !== "preset"));

// ── Arabic labels (display only; the stored values are the vocabulary words) ───────────────────────────────────────────────────────
const COLOR_LABELS: Record<ColorToken, string> = { primary: "اللون الأساسي", accent: "لون التمييز", background: "خلفية الصفحة", surface: "خلفية البطاقات", surfaceAlt: "الخلفية البديلة", text: "النص", muted: "النص الثانوي", border: "الحدود", success: "لون النجاح", warning: "لون التحذير", danger: "لون الخطر" };
const WORDS: Record<string, string> = {
  systemArabic: "خط النظام العربي", systemSans: "خط النظام بلا تذييل", academicSerif: "خط أكاديمي مذيّل", developerMono: "خط أحادي المسافة",
  compact: "مدمج", normal: "عادي", comfortable: "مريح", large: "كبير", spacious: "فسيح", tight: "متقارب", relaxed: "واسع",
  regular: "عادي", medium: "متوسط", bold: "عريض", none: "بلا", sm: "صغير", md: "متوسط", lg: "كبير", xl: "كبير جدًا", subtle: "خفيف", strong: "قوي",
  narrow: "ضيق", wide: "عريض", full: "كامل العرض", inline: "ضمن تدفق الأسئلة", responsiveSide: "جانبي متجاوب", academic: "أكاديمي",
  rtl: "من اليمين إلى اليسار", ltr: "من اليسار إلى اليمين",
  plain: "بسيط", hero: "بارز", banded: "بشريط سفلي", minimal: "مختصر", band: "شريط ملوّن", underline: "خط سفلي", card: "بطاقة", flat: "مسطّح",
  outlined: "بإطار", elevated: "مرتفع بظل", paper: "ورقي", badge: "شارة", circle: "دائرة", square: "مربع", text: "نص", pill: "كبسولة", outline: "إطار",
  corner: "في الزاوية", striped: "مخطط الصفوف", bordered: "بحدود كاملة", soft: "ناعم", solid: "مصمت", contained: "داخل إطار", lined: "مسطّر",
  standard: "قياسي", modern: "حديث", framed: "مؤطّر", light: "فاتح", dark: "داكن",
  writingPaper: "ورقة كتابة", developerWorkspace: "بيئة مطوّر", laboratory: "مساحة مختبرية", networkWorkspace: "مساحة عمل شبكية", storyWorkspace: "مساحة سيناريو", visualWorkspace: "مساحة بصرية"
};
const SPECIFIC: Record<string, Record<string, string>> = { radius: { none: "بلا استدارة" }, shadow: { none: "بلا ظل" }, motion: { none: "بلا حركة", subtle: "حركة خفيفة" } };
const word = (v: string, group?: string) => (group && SPECIFIC[group]?.[v]) || WORDS[v] || v;
const SLOT_LABELS: Record<Slot, string> = { examHeader: "ترويسة الامتحان", sectionHeader: "ترويسة القسم", questionCard: "بطاقة السؤال", questionNumber: "رقم السؤال", marksBadge: "شارة العلامة", questionStem: "نص السؤال", table: "الجداول", callout: "الصناديق التنبيهية", answerArea: "منطقة الإجابة", navigation: "أزرار التنقل", figure: "الصور والأشكال", code: "كتل الكود" };
const typeLabel = (key: string) => QUESTION_TYPE_CATALOG.find(d => d.key === key)?.label ?? key;
const V = PRESENTATION_VOCABULARY;
const SLOTS = Object.keys(V.slots) as Slot[];

const TABS = [
  { key: "presets", label: "القوالب" }, { key: "colors", label: "الألوان" }, { key: "typography", label: "الخطوط" }, { key: "layout", label: "التخطيط" },
  { key: "components", label: "المكوّنات" }, { key: "types", label: "أنواع الأسئلة" }, { key: "sections", label: "الأقسام" }, { key: "print", label: "الطباعة" },
  { key: "a11y", label: "إمكانية الوصول" }
] as const;
type TabKey = (typeof TABS)[number]["key"];
const VIEWPORTS = [{ key: "desktop", label: "سطح المكتب" }, { key: "tablet", label: "جهاز لوحي" }, { key: "phone", label: "هاتف" }] as const;
type Viewport = (typeof VIEWPORTS)[number]["key"];
const PREVIEW_QUESTIONS = 3;

// A built-in sample (an MCQ + a rich stem with a table) so the preview is never empty for an exam without questions.
const SAMPLE_SECTION = {
  id: "xp-studio-sample", title: "قسم تجريبي للمعاينة", instructions: "أجب عن جميع الأسئلة.", gradingPolicy: "all",
  questions: [
    { examQuestionId: "xp-studio-sample-1", presentationType: "multipleChoice", text: "أي العناوين التالية يقع في الشبكة 192.168.10.0/24؟", marks: 2, options: [{ text: "192.168.10.25" }, { text: "192.168.20.25" }, { text: "10.0.10.25" }] },
    { examQuestionId: "xp-studio-sample-2", presentationType: "shortAnswer", text: "ادرس الجدول ثم اذكر رقم VLAN للجهاز PC2.", marks: 3, richContent: { schemaVersion: 1, blocks: [
      { type: "paragraph", runs: [{ text: "ادرس الجدول ثم اذكر رقم " }, { text: "VLAN", marks: ["bold"] }, { text: " للجهاز PC2." }] },
      { type: "table", caption: "الأجهزة", columnHeaders: ["الجهاز", "VLAN", "العنوان"], rows: [["PC1", "10", "192.168.10.10"], ["PC2", "20", "192.168.20.10"]] }
    ] } }
  ]
};

type Handlers = { onChoice: (id: string, i: number) => void; onSeq: (id: string, i: number, v: string) => void; onTable: (id: string, i: number, v: string | boolean) => void; onText: (id: string, v: string) => void; onField: (id: string, f: string, v: FieldValue) => void; onPart: (id: string, p: string, a: Answer) => void; onAnswer: (id: string, a: Answer) => void };
function usePreviewAnswers(): [Record<string, Answer>, Handlers] {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const handlers = useMemo<Handlers>(() => {
    const vals = <K extends "sequence" | "table">(a: Answer | undefined, kind: K) => (a?.kind === kind ? [...(a as { values: (string | boolean)[] }).values] : []);
    return {
      onChoice: (id, index) => setAnswers(a => ({ ...a, [id]: { kind: "choice", index } })),
      onAnswer: (id, next) => setAnswers(a => ({ ...a, [id]: next })),
      onSeq: (id, i, v) => setAnswers(a => { const values = vals(a[id], "sequence") as string[]; values[i] = v; return { ...a, [id]: { kind: "sequence", values } }; }),
      onTable: (id, i, v) => setAnswers(a => { const values = vals(a[id], "table"); values[i] = v; return { ...a, [id]: { kind: "table", values } }; }),
      onText: (id, value) => setAnswers(a => ({ ...a, [id]: { kind: "text", value } })),
      onField: (id, f, v) => setAnswers(a => { const prev = a[id]?.kind === "fields" ? (a[id] as { values: Record<string, FieldValue> }).values : {}; return { ...a, [id]: { kind: "fields", values: { ...prev, [f]: v } } }; }),
      onPart: (id, p, ans) => setAnswers(a => { const prev = a[id]?.kind === "compound" ? (a[id] as { parts: Record<string, Answer> }).parts : {}; return { ...a, [id]: { kind: "compound", parts: { ...prev, [p]: ans } } }; })
    };
  }, []);
  return [answers, handlers];
}

// ── small form primitives ───────────────────────────────────────────────────────────────────────────────────────────────────────────
function Choice({ label, value, inherited, inheritLabel = "حسب القالب", options, group, onPick, disabled }: { label: string; value: unknown; inherited: string; inheritLabel?: string; options: readonly string[]; group?: string; onPick: (v: string | undefined) => void; disabled?: boolean }) {
  const id = "xp-studio-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const current = typeof value === "string" && options.includes(value) ? value : "";
  return (
    <div className="xp-studio-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="xp-studio-select" value={current} disabled={disabled} onChange={e => { const v = e.target.value; if (!v) onPick(undefined); else if (options.includes(v)) onPick(v); }}>
        <option value="">{inheritLabel + " — " + word(inherited, group)}</option>
        {options.map(o => <option key={o} value={o}>{word(o, group)}</option>)}
      </select>
    </div>
  );
}
function TabHead({ title, hint, onReset, canReset }: { title: string; hint?: string; onReset?: () => void; canReset?: boolean }) {
  return (
    <div className="xp-studio-panel-head">
      <div><h3 className="xp-studio-panel-title">{title}</h3>{hint && <p className="xp-studio-hint">{hint}</p>}</div>
      {onReset && <button type="button" className="xp-studio-btn is-quiet" onClick={onReset} disabled={!canReset}>{"إعادة ضبط " + title}</button>}
    </div>
  );
}

export default function PresentationStudio({ exam, onChange, onClose }: Props) {
  const { confirm, confirmDialog } = useConfirm();
  const analysis = useMemo(() => analyze(exam.presentation), [exam.presentation]);
  const locked = analysis.kind === "malformed";
  const raw: Json = useMemo(() => (analysis.kind === "malformed" ? { schemaVersion: 1, preset: "default" } : analysis.raw), [analysis]);
  const preset: PresetId = analysis.kind === "malformed" ? analysis.preset ?? "default" : analysis.preset;
  const P = PRESENTATION_PRESETS[preset];
  const palette = useMemo(() => paletteOf(raw), [raw]);
  const contrast = analysis.kind === "malformed" ? [] : analysis.contrast;
  const sections = useMemo(() => sectionsOf(exam), [exam]);

  // Every exam-level write: applied to the owner's LATEST exam, refused when the stored value is malformed (that path is an explicit,
  // confirmed reset) and refused when the result would carry anything but vocabulary values (contrast alone is allowed while editing).
  const commit = useCallback((mutate: (draft: Json) => void) => {
    onChange(prev => {
      const a = analyze(prev.presentation);
      if (a.kind === "malformed") return prev;
      const draft = clone(a.raw);
      mutate(draft);
      const next = prune(draft);
      next.schemaVersion = 1;
      const check = validatePresentation(next);
      if (!check.ok && check.issues.some(i => i.code !== "PRESENTATION_CONTRAST")) return prev;
      return { ...prev, presentation: next };
    });
  }, [onChange]);
  const set = (path: readonly string[], value: unknown) => commit(d => setPath(d, path, value));

  const writePreset = (id: PresetId) => onChange(prev => ({ ...prev, presentation: { schemaVersion: 1, preset: id } }));
  const choosePreset = async (id: PresetId) => {
    if (!isPresetId(id)) return;
    if (analysis.kind === "ok" && !customized(analysis) && analysis.preset === id) return;
    if (customized(analysis) && !(await confirm({ title: "تطبيق قالب", message: "تطبيق قالب «" + PRESENTATION_PRESETS[id].label + "» سيستبدل كل تخصيصات العرض الحالية للامتحان (الألوان والخطوط والتخطيط والمكوّنات وأنماط الأنواع).\nتبقى تخصيصات الأقسام والأسئلة كما هي.", confirmLabel: "تطبيق القالب", cancelLabel: "إلغاء", tone: "danger" }))) return;
    writePreset(id);
  };
  const resetAll = async () => {
    if (!(await confirm({ title: "إعادة ضبط العرض بالكامل", message: "سيُحذف إعداد العرض من هذا الامتحان بالكامل ويعود إلى سمة العرض السابقة.\nتبقى تخصيصات الأقسام والأسئلة محفوظة لكنها لا تُطبَّق دون إعداد عرض للامتحان.", confirmLabel: "إعادة الضبط", cancelLabel: "إلغاء", tone: "danger" }))) return;
    onChange(prev => { const next = { ...prev }; delete next.presentation; return next; });
  };
  const resetGroup = async (title: string, paths: readonly (readonly string[])[]) => {
    if (!(await confirm({ title: "إعادة ضبط " + title, message: "ستعود إعدادات «" + title + "» إلى قيم القالب «" + P.label + "».", confirmLabel: "إعادة الضبط", cancelLabel: "إلغاء", tone: "danger" }))) return;
    commit(d => { for (const p of paths) setPath(d, p, undefined); });
  };
  const has = (paths: readonly (readonly string[])[]) => analysis.kind === "ok" && paths.some(p => getPath(raw, p) !== undefined);

  // ── tabs (roving tabindex, arrow keys follow the RTL reading direction) ──
  const [tab, setTab] = useState<TabKey>("presets");
  const baseId = "xp-studio-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onTabKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex(t => t.key === tab);
    const rtl = (e.currentTarget.closest("[dir]")?.getAttribute("dir") ?? "rtl") === "rtl";
    let n = -1;
    if (e.key === (rtl ? "ArrowLeft" : "ArrowRight") || e.key === "ArrowDown") n = (i + 1) % TABS.length;
    else if (e.key === (rtl ? "ArrowRight" : "ArrowLeft") || e.key === "ArrowUp") n = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = TABS.length - 1;
    if (n < 0) return;
    e.preventDefault();
    setTab(TABS[n].key);
    tabRefs.current[TABS[n].key]?.focus();
  };

  // ── preview ──
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const firstWithQuestions = Math.max(0, sections.findIndex(s => (s.questions || []).length > 0));
  const [previewPick, setPreviewPick] = useState<number | null>(null);
  const previewIndex = previewPick !== null && previewPick < sections.length ? previewPick : firstWithQuestions;
  const [answers, handlers] = usePreviewAnswers();
  const preview = useMemo(() => {
    const own = sections[previewIndex];
    const sample = !own || !(own.questions || []).length;
    const section = sample ? SAMPLE_SECTION : { ...own, questions: (own.questions || []).slice(0, PREVIEW_QUESTIONS) };
    const safe = toSafePreviewExam({ title: typeof exam.title === "string" ? exam.title : "", sections: [section] } as PreviewExamInput);
    const norm = normalizeExamStructure(safe as unknown as StudentStructuredExam);
    return { sample, safe, section: norm.sections[0], raw: (safe.sections || [])[0] };
  }, [sections, previewIndex, exam.title]);
  const previewFallback = useMemo(() => resolvePresentation(exam.presentation)?.fallback === true, [exam.presentation]);

  const disabled = locked;
  const color = (k: ColorToken) => getPath(raw, ["tokens", "colors", k]);

  const panel = (): ReactNode => {
    switch (tab) {
      case "presets": return (
        <>
          <TabHead title="القوالب" hint="اختيار قالب يكتب إعداد عرض نظيفًا يعتمد على القالب وحده؛ يمكنك بعدها تخصيص الألوان والخطوط والمكوّنات." />
          <div className="xp-studio-presets">
            {PRESET_IDS.map(id => {
              const def = PRESENTATION_PRESETS[id];
              const current = analysis.kind === "ok" && preset === id;
              return (
                <button key={id} type="button" className={"xp-studio-preset" + (current ? " is-current" : "")} aria-pressed={current} onClick={() => { void choosePreset(id); }}>
                  <span className="xp-studio-swatches" aria-hidden="true">{(["primary", "accent", "background", "surface", "text"] as const).map(k => <i key={k} style={{ background: def.colors[k] }} />)}</span>
                  <strong className="xp-studio-preset-name">{def.label}</strong>
                  <span className="xp-studio-preset-desc">{def.description}</span>
                </button>
              );
            })}
          </div>
        </>
      );
      case "colors": return (
        <>
          <TabHead title="الألوان" hint="الألوان بصيغة ‎#RRGGBB‎ فقط. تُفحص نسب التباين فورًا، وأي نسبة غير كافية تمنع الاعتماد النهائي." onReset={() => { void resetGroup("الألوان", [["tokens", "colors"]]); }} canReset={has([["tokens", "colors"]])} />
          <fieldset className="xp-studio-fieldset" disabled={disabled}>
            <legend className="xp-studio-sr">ألوان العرض</legend>
            {COLOR_TOKENS.map(k => <ColorRow key={k} token={k} value={palette[k]} overridden={color(k) !== undefined} presetValue={P.colors[k]} onWrite={hex => set(["tokens", "colors", k], hex)} />)}
          </fieldset>
        </>
      );
      case "typography": return (
        <>
          <TabHead title="الخطوط" onReset={() => { void resetGroup("الخطوط", [["tokens", "typography"]]); }} canReset={has([["tokens", "typography"]])} />
          <fieldset className="xp-studio-fieldset" disabled={disabled}>
            <legend className="xp-studio-sr">إعدادات الخط</legend>
            <Choice label="عائلة الخط" value={getPath(raw, ["tokens", "typography", "family"])} inherited={P.typography.family} options={V.families} onPick={v => set(["tokens", "typography", "family"], v)} />
            <Choice label="حجم الخط" value={getPath(raw, ["tokens", "typography", "scale"])} inherited={P.typography.scale} options={V.scales} onPick={v => set(["tokens", "typography", "scale"], v)} />
            <Choice label="تباعد الأسطر" value={getPath(raw, ["tokens", "typography", "lineHeight"])} inherited={P.typography.lineHeight} options={V.lineHeights} onPick={v => set(["tokens", "typography", "lineHeight"], v)} />
            <Choice label="سماكة نص السؤال" value={getPath(raw, ["tokens", "typography", "questionWeight"])} inherited={P.typography.questionWeight} options={V.questionWeights} onPick={v => set(["tokens", "typography", "questionWeight"], v)} />
          </fieldset>
        </>
      );
      case "layout": {
        const paths = [["layout"], ["tokens", "spacing"], ["tokens", "radius"], ["tokens", "shadow"]] as const;
        const sticky = getPath(raw, ["layout", "stickyTopBar"]);
        const stickyOn = typeof sticky === "boolean" ? sticky : P.layout.stickyTopBar;
        return (
          <>
            <TabHead title="التخطيط" onReset={() => { void resetGroup("التخطيط", paths); }} canReset={has(paths)} />
            <fieldset className="xp-studio-fieldset" disabled={disabled}>
              <legend className="xp-studio-sr">التخطيط والمسافات</legend>
              <Choice label="عرض الصفحة" value={getPath(raw, ["layout", "pageWidth"])} inherited={P.layout.pageWidth} options={V.pageWidths} onPick={v => set(["layout", "pageWidth"], v)} />
              <Choice label="المسافة بين الأسئلة" value={getPath(raw, ["layout", "questionSpacing"])} inherited={P.layout.questionSpacing} options={V.spacings} onPick={v => set(["layout", "questionSpacing"], v)} />
              <Choice label="المسافة بين الأقسام" value={getPath(raw, ["layout", "sectionSpacing"])} inherited={P.layout.sectionSpacing} options={V.sectionSpacings} onPick={v => set(["layout", "sectionSpacing"], v)} />
              <Choice label="موضع السيناريو المشترك" value={getPath(raw, ["layout", "scenarioPlacement"])} inherited={P.layout.scenarioPlacement} options={V.scenarioPlacements} onPick={v => set(["layout", "scenarioPlacement"], v)} />
              <div className="xp-studio-field is-check">
                <label><input type="checkbox" checked={stickyOn} onChange={e => set(["layout", "stickyTopBar"], e.target.checked === P.layout.stickyTopBar ? undefined : e.target.checked)} /> تثبيت الشريط العلوي أثناء التمرير</label>
              </div>
              <Choice label="كثافة المسافات الداخلية" value={getPath(raw, ["tokens", "spacing"])} inherited={P.spacing} options={V.spacings} onPick={v => set(["tokens", "spacing"], v)} />
              <Choice label="استدارة الزوايا" value={getPath(raw, ["tokens", "radius"])} inherited={P.radius} options={V.radii} group="radius" onPick={v => set(["tokens", "radius"], v)} />
              <Choice label="الظلال" value={getPath(raw, ["tokens", "shadow"])} inherited={P.shadow} options={V.shadows} group="shadow" onPick={v => set(["tokens", "shadow"], v)} />
            </fieldset>
          </>
        );
      }
      case "components": return (
        <>
          <TabHead title="المكوّنات" hint="نمط كل مكوّن في صفحة الامتحان؛ الأنماط مملوكة للنظام ولا تقبل تنسيقًا حرًا." onReset={() => { void resetGroup("المكوّنات", [["components"]]); }} canReset={has([["components"]])} />
          <fieldset className="xp-studio-fieldset" disabled={disabled}>
            <legend className="xp-studio-sr">أنماط المكوّنات</legend>
            {SLOTS.map(slot => <Choice key={slot} label={SLOT_LABELS[slot]} value={getPath(raw, ["components", slot, "variant"])} inherited={P.components[slot]} options={V.slots[slot]} onPick={v => set(["components", slot], v ? { variant: v } : undefined)} />)}
          </fieldset>
        </>
      );
      case "types": return (
        <>
          <TabHead title="أنواع الأسئلة" hint="مساحة العرض لكل نوع سؤال (تؤثر في الشكل فقط، ولا تغيّر التصحيح أو العلامات)." onReset={() => { void resetGroup("أنواع الأسئلة", [["questionTypeVariants"]]); }} canReset={has([["questionTypeVariants"]])} />
          <fieldset className="xp-studio-fieldset" disabled={disabled}>
            <legend className="xp-studio-sr">أنماط أنواع الأسئلة</legend>
            {V.questionTypes.map(k => <Choice key={k} label={typeLabel(k)} value={getPath(raw, ["questionTypeVariants", k])} inherited={P.typeVariants[k] ?? "standard"} options={V.typeVariants} onPick={v => set(["questionTypeVariants", k], v)} />)}
          </fieldset>
        </>
      );
      case "sections": return <SectionsPanel sections={sections} examComponents={{ ...P.components, ...componentsOf(raw) }} examQuestionSpacing={(getPath(raw, ["layout", "questionSpacing"]) as string | undefined) ?? P.layout.questionSpacing} hasExamPresentation={analysis.kind !== "absent"} onChange={onChange} confirm={confirm} />;
      case "print": return (
        <>
          <TabHead title="الطباعة" onReset={() => { void resetGroup("الطباعة", [["print"]]); }} canReset={has([["print"]])} />
          <fieldset className="xp-studio-fieldset" disabled={disabled}>
            <legend className="xp-studio-sr">إعدادات الطباعة</legend>
            <Choice label="نمط الطباعة" value={getPath(raw, ["print", "mode"])} inherited="academic" options={V.printModes} onPick={v => set(["print"], v ? { mode: v } : undefined)} />
            <p className="xp-studio-hint">النمط الأكاديمي يطبع كل سؤال كاملًا مع هوامش مريحة ومنع انقسام البطاقات؛ النمط المدمج يقلّل المسافات لتوفير الورق. لا تُطبع أزرار التنقل أو حالة الحفظ في أي نمط.</p>
          </fieldset>
        </>
      );
      case "a11y": return (
        <>
          <TabHead title="إمكانية الوصول" onReset={() => { void resetGroup("إمكانية الوصول", [["direction"], ["motion"]]); }} canReset={has([["direction"], ["motion"]])} />
          <table className="xp-studio-contrast">
            <caption>تقرير التباين (WCAG)</caption>
            <thead><tr><th scope="col">العنصر</th><th scope="col">النسبة</th><th scope="col">الحد الأدنى</th><th scope="col">النتيجة</th></tr></thead>
            <tbody>{CONTRAST_POLICY.map(r => {
              const ratio = contrastRatio(r.fg.startsWith("#") ? r.fg : palette[r.fg as ColorToken], palette[r.bg as ColorToken]);
              const pass = ratio >= r.min - 1e-9;
              return <tr key={r.label} className={pass ? "is-pass" : "is-fail"}><th scope="row">{r.label}</th><td>{ratio.toFixed(2)}:1</td><td>{r.min}:1</td><td>{pass ? "ناجح" : "غير كافٍ"}</td></tr>;
            })}</tbody>
          </table>
          <fieldset className="xp-studio-fieldset" disabled={disabled}>
            <legend className="xp-studio-sr">الاتجاه والحركة</legend>
            <Choice label="اتجاه الصفحة" value={getPath(raw, ["direction"])} inherited="rtl" options={V.directions} onPick={v => set(["direction"], v)} />
            <Choice label="الحركة والانتقالات" value={getPath(raw, ["motion", "level"])} inherited={P.motion} options={V.motion} group="motion" onPick={v => set(["motion"], v ? { level: v } : undefined)} />
            <p className="xp-studio-hint">يحترم الامتحان دائمًا إعداد «تقليل الحركة» في جهاز الطالب مهما كان هذا الخيار.</p>
          </fieldset>
          <button type="button" className="xp-studio-btn" onClick={() => { void choosePreset("highContrast"); }} disabled={analysis.kind === "ok" && preset === "highContrast" && !customized(analysis)}>تطبيق قالب التباين العالي</button>
        </>
      );
    }
  };

  return (
    <>
      <Dialog open size="lg" title="استوديو العرض" onClose={onClose} className="xp-studio"
        footer={<>
          <button type="button" className="xp-studio-btn is-danger" onClick={() => { void resetAll(); }} disabled={exam.presentation == null}>إعادة ضبط العرض بالكامل</button>
          <button type="button" className="xp-studio-btn is-primary" onClick={onClose}>تم</button>
        </>}>
        <div className="xp-studio-shell" dir="rtl">
          <p className="xp-studio-status" role="status">
            {analysis.kind === "absent" ? "هذا الامتحان يستخدم سمة العرض السابقة. اختيار قالب أو تعديل أي إعداد يُنشئ إعداد عرض للامتحان." : "القالب الحالي: " + P.label + (customized(analysis) && analysis.kind === "ok" ? " (مع تخصيصات)" : "") + ". تُحفظ التغييرات مع الامتحان ويمكن التراجع عنها من شريط المحرر."}
          </p>
          {analysis.kind === "malformed" && (
            <div className="xp-studio-alert is-danger" role="alert" data-testid="xp-malformed-notice">
              <strong>إعداد العرض المخزّن غير صالح، لذلك يُعرض الامتحان بالقالب الافتراضي الآمن ويُمنع اعتماده نهائيًا.</strong>
              <ul>{analysis.issues.map((i, n) => <li key={n}>{i.message} <bdi className="xp-studio-path">{i.path}</bdi></li>)}</ul>
              <p>لن يُعدَّل الإعداد تلقائيًا. أعد ضبطه إلى قالب صالح ثم خصّصه من جديد.</p>
              <button type="button" className="xp-studio-btn" onClick={() => { void choosePreset(analysis.preset ?? "default"); }}>{"إعادة الضبط إلى قالب «" + PRESENTATION_PRESETS[analysis.preset ?? "default"].label + "»"}</button>
            </div>
          )}
          {contrast.length > 0 && (
            <div className="xp-studio-alert is-danger" role="alert" data-testid="xp-contrast-warning">
              <strong>تباين الألوان غير كافٍ — لا يمكن اعتماد الامتحان نهائيًا حتى تُصلَح هذه الألوان:</strong>
              <ul>{contrast.map(c => <li key={c.label}>{c.label}: النسبة {c.ratio.toFixed(2)}:1 والحد الأدنى {c.min}:1</li>)}</ul>
            </div>
          )}
          <div className="xp-studio-grid">
            <div className="xp-studio-editor">
              <div className="xp-studio-tabs" role="tablist" aria-label="أقسام استوديو العرض" onKeyDown={onTabKey}>
                {TABS.map(t => (
                  <button key={t.key} ref={el => { tabRefs.current[t.key] = el; }} type="button" role="tab" id={baseId + "-tab-" + t.key} aria-selected={tab === t.key} aria-controls={baseId + "-panel"} tabIndex={tab === t.key ? 0 : -1} className="xp-studio-tab" onClick={() => setTab(t.key)}>{t.label}</button>
                ))}
              </div>
              <div className="xp-studio-panel" role="tabpanel" id={baseId + "-panel"} aria-labelledby={baseId + "-tab-" + tab} tabIndex={0}>{panel()}</div>
            </div>
            <section className="xp-studio-preview-pane" aria-label="المعاينة الحية">
              <div className="xp-studio-preview-bar">
                <div className="xp-studio-viewports" role="group" aria-label="حجم المعاينة">
                  {VIEWPORTS.map(v => <button key={v.key} type="button" className="xp-studio-btn is-small" aria-pressed={viewport === v.key} onClick={() => setViewport(v.key)}>{v.label}</button>)}
                </div>
                {sections.length > 1 && (
                  <div className="xp-studio-field is-inline">
                    <label htmlFor={baseId + "-psec"}>القسم في المعاينة</label>
                    <select id={baseId + "-psec"} className="xp-studio-select" value={previewIndex} onChange={e => setPreviewPick(Number(e.target.value))}>
                      {sections.map((s, i) => <option key={s.id} value={i}>{"القسم " + (i + 1) + (s.title ? ": " + s.title : "")}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <p className="xp-studio-hint">{preview.sample ? "لا توجد أسئلة في هذا القسم بعد — تعرض المعاينة أسئلة نموذجية." : "معاينة أول " + Math.min(PREVIEW_QUESTIONS, preview.section?.questions.length ?? 0) + " أسئلة من القسم كما يراها الطالب؛ الإجابات هنا للتجربة ولا تُحفظ."}{previewFallback ? " الإعداد الحالي غير صالح، لذلك تعرض المعاينة القالب الافتراضي الآمن الذي سيراه الطالب." : ""}{analysis.kind === "absent" ? " (المعاينة بالقالب الافتراضي؛ يرى الطالب السمة السابقة إلى أن تختار قالبًا.)" : ""}</p>
              <div className="xp-studio-frame" data-xp-viewport={viewport} data-testid="xp-studio-preview">
                {preview.section && (
                  <TeacherPreviewContext.Provider value={true}>
                    <PresentationRoot presentation={exam.presentation} className="interactive-exam-page xp-studio-preview-root">
                      <div className="iex-wrap">
                        <PresentationExamSection section={preview.section} raw={preview.raw} sectionNumber={preview.sample ? 1 : previewIndex + 1} startIndex={0} answers={answers} {...handlers} />
                      </div>
                    </PresentationRoot>
                  </TeacherPreviewContext.Provider>
                )}
              </div>
            </section>
          </div>
        </div>
      </Dialog>
      {confirmDialog}
    </>
  );
}

function componentsOf(raw: Json): Partial<Record<Slot, string>> {
  const out: Partial<Record<Slot, string>> = {};
  const c = raw.components;
  if (isObj(c)) for (const s of SLOTS) { const v = getPath(c, [s, "variant"]); if (typeof v === "string") out[s] = v; }
  return out;
}

// ── colours: picker + strict hex text field (invalid input is shown and never written) ─────────────────────────────────────────────
function ColorRow({ token, value, overridden, presetValue, onWrite }: { token: ColorToken; value: string; overridden: boolean; presetValue: string; onWrite: (hex: string | undefined) => void }) {
  const id = "xp-studio-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const label = COLOR_LABELS[token];
  const commitText = () => {
    if (draft === null) return;
    const hex = normalizeHexColor(draft.trim());
    if (!hex) { setError(true); return; }
    setError(false); setDraft(null);
    if (hex !== value || !overridden) onWrite(hex);
  };
  return (
    <div className="xp-studio-color">
      <input type="color" className="xp-studio-swatch" value={value.toLowerCase()} aria-label={"اختيار " + label} onChange={e => { const hex = normalizeHexColor(e.target.value); if (hex) { setDraft(null); setError(false); onWrite(hex); } }} />
      <div className="xp-studio-field">
        <label htmlFor={id}>{label}{overridden ? " (مخصّص)" : ""}</label>
        <input id={id} className="xp-studio-input" dir="ltr" inputMode="text" spellCheck={false} maxLength={7} value={draft ?? value}
          aria-invalid={error || undefined} aria-describedby={error ? id + "-err" : undefined}
          onChange={e => { setDraft(e.target.value); if (error) setError(false); }} onBlur={commitText}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commitText(); } }} />
        {error && <p id={id + "-err"} className="xp-studio-error">صيغة اللون غير صحيحة — استخدم ‎#RRGGBB‎ (مثل ‎#1D4ED8‎). لم يُحفظ هذا اللون.</p>}
      </div>
      {overridden && <button type="button" className="xp-studio-btn is-quiet is-small" onClick={() => { setDraft(null); setError(false); onWrite(undefined); }} aria-label={"استخدام لون القالب لـ" + label} title={"لون القالب: " + presetValue}>لون القالب</button>}
    </div>
  );
}

// ── sections: bounded overrides (section-override slots + question spacing only) ───────────────────────────────────────────────────
const SECTION_SLOTS = V.sectionOverrideSlots;
type ConfirmFn = ReturnType<typeof useConfirm>["confirm"];
function SectionsPanel({ sections, examComponents, examQuestionSpacing, hasExamPresentation, onChange, confirm }: { sections: SectionLike[]; examComponents: Record<Slot, string>; examQuestionSpacing: string; hasExamPresentation: boolean; onChange: Props["onChange"]; confirm: ConfirmFn }) {
  const editSection = (sectionId: string, mutate: ((d: Json) => void) | null) => onChange(prev => ({
    ...prev,
    sections: Array.isArray(prev.sections) ? prev.sections.map((s: unknown) => {
      if (!isObj(s) || s.id !== sectionId) return s;
      if (mutate === null) { const next = { ...s }; delete next.presentation; return next; }
      let base: Json = { schemaVersion: 1 };
      if (s.presentation !== undefined) { const r = validateSectionPresentation(s.presentation); if (!r.ok || !r.value) return s; base = clone(r.value) as Json; }
      mutate(base);
      const next = prune(base);
      next.schemaVersion = 1;
      if (Object.keys(next).length === 1) { const out = { ...s }; delete out.presentation; return out; }
      if (!validateSectionPresentation(next).ok) return s;
      return { ...s, presentation: next };
    }) : prev.sections
  }));
  const remove = async (s: SectionLike, i: number) => {
    if (!(await confirm({ title: "إزالة تخصيص القسم", message: "سيعود «" + (s.title || "القسم " + (i + 1)) + "» إلى إعدادات عرض الامتحان.", confirmLabel: "إعادة الضبط", cancelLabel: "إلغاء", tone: "danger" }))) return;
    editSection(s.id, null);
  };
  const removeAll = async () => {
    if (!(await confirm({ title: "إعادة ضبط الأقسام", message: "ستُزال تخصيصات العرض من جميع الأقسام.", confirmLabel: "إعادة الضبط", cancelLabel: "إلغاء", tone: "danger" }))) return;
    onChange(prev => ({ ...prev, sections: Array.isArray(prev.sections) ? prev.sections.map((s: unknown) => { if (!isObj(s) || s.presentation === undefined) return s; const n = { ...s }; delete n.presentation; return n; }) : prev.sections }));
  };
  return (
    <>
      <TabHead title="الأقسام" hint="تخصيص محدود لكل قسم (الترويسة والبطاقات والأرقام والعلامات ومنطقة الإجابة والمسافات)؛ باقي الإعدادات تتبع الامتحان." onReset={() => { void removeAll(); }} canReset={sections.some(s => s.presentation !== undefined)} />
      {!hasExamPresentation && <p className="xp-studio-hint is-note">تُطبَّق تخصيصات الأقسام فقط عندما يكون للامتحان إعداد عرض (اختر قالبًا أولًا).</p>}
      {!sections.length && <p className="xp-studio-hint">لا توجد أقسام في هذا الامتحان بعد.</p>}
      {sections.map((s, i) => {
        const name = "القسم " + (i + 1) + (s.title ? ": " + s.title : "");
        const r = s.presentation === undefined ? null : validateSectionPresentation(s.presentation);
        const malformed = !!r && !r.ok;
        const cur = r?.ok ? r.value : undefined;
        return (
          <fieldset key={s.id} className="xp-studio-section">
            <legend>{name}</legend>
            {malformed ? (
              <div className="xp-studio-alert is-danger" role="alert">
                <strong>تخصيص العرض المخزّن لهذا القسم غير صالح ويُتجاهَل عند العرض.</strong>
                <ul>{r!.issues.map((x, n) => <li key={n}>{x.message}</li>)}</ul>
              </div>
            ) : (
              <>
                {SECTION_SLOTS.map(slot => <Choice key={slot} label={SLOT_LABELS[slot]} value={cur?.components?.[slot]?.variant} inherited={examComponents[slot]} inheritLabel="حسب الامتحان" options={V.slots[slot]} onPick={v => editSection(s.id, d => setPath(d, ["components", slot], v ? { variant: v } : undefined))} />)}
                <Choice label="المسافة بين الأسئلة" value={cur?.layout?.questionSpacing} inherited={examQuestionSpacing} inheritLabel="حسب الامتحان" options={V.spacings} onPick={v => editSection(s.id, d => setPath(d, ["layout", "questionSpacing"], v))} />
              </>
            )}
            {s.presentation !== undefined && <button type="button" className="xp-studio-btn is-quiet is-small" onClick={() => { void remove(s, i); }}>{"إزالة تخصيص " + name}</button>}
          </fieldset>
        );
      })}
    </>
  );
}
