// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import QuestionComposer from "../QuestionComposer";
import CompoundQuestionEditor from "../CompoundQuestionEditor";
import StudentQuestionCard from "../StudentQuestionCard";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import type { StructuredExam, BuilderQuestion } from "../examTypes";
import type { Question } from "../studentQuestionTypes";
import type { Answer } from "../answerState";
import { newQuestion, newPart } from "../examBuilderState";
import { registerQuestionTypePlugin, type QuestionTypePlugin } from "./registerQuestionTypePlugin";
import { resolveAuthoringEditor } from "./authoringRegistry";
import { resolveStudentRenderer, registerStudentRenderer } from "./studentRegistry";
import { validateQuestionTypeNode } from "../questionTypeValidation";
import { hasRegisteredTypeDefaults } from "../questionTypeDefaults";
import { validateStructuredExam } from "../examQuality";
import { validateBlueprint, emptyBlueprint } from "../assessmentBlueprint";
import { evaluateBlueprintCoverage } from "../assessmentBlueprintCoverage";
import { effectiveQuestionTypeVersion, isKnownQuestionType, questionTypeDefinition, compoundPartTypeKeys, listQuestionTypes, type QuestionTypeDefinition } from "../questionTypeCatalog";

// Phase 16A — Independent Review Fix 1 (R1 + R2): runtime implementations are bound to (key, version), never to the key
// alone; a dynamically registered plugin is reflected by EVERY authoring / planning / student surface through the live
// canonical catalog; registration is transactional. Fail-first on e1f295a (key-only registries, frozen snapshots).

type Hist = ReturnType<typeof useStructuredExamHistory>;
const baseExam = (questions: BuilderQuestion[]): StructuredExam => ({ examId: "EXAM-RF1", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "sec-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions }] });
function Host({ initial, onHistory }: { initial: StructuredExam; onHistory: (h: Hist) => void }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial, "saved"); } }, [hist, initial]);
  useEffect(() => { onHistory(hist); });
  const [saving] = useState(false);
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={saving} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, saving)} backupStorage={null} onRecover={hist.recover} autosaveDelayMs={5} />;
}
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
async function mount(initial: StructuredExam) { let hist!: Hist; render(<Host initial={initial} onHistory={h => { hist = h; }} />); await tick(20); return { hist: () => hist }; }
async function openPalette() { fireEvent.click(screen.getByRole("button", { name: "+ إضافة سؤال" })); const d = await screen.findByRole("dialog", { name: "إضافة سؤال" }); await tick(30); return d; }
const cards = (d: HTMLElement) => within(d).getAllByTestId("qt-card");
function StudentHarness({ q, initial }: { q: Question; initial?: Answer }) {
  const [answer, setAnswer] = useState<Answer | undefined>(initial);
  return <><StudentQuestionCard q={q} index={0} id={String(q.examQuestionId)} answer={answer} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={setAnswer} /><output data-testid="answer">{JSON.stringify(answer ?? null)}</output></>;
}
const readAnswer = () => JSON.parse(screen.getByTestId("answer").textContent || "null");

const caps = (over: Partial<QuestionTypeDefinition["capabilities"]> = {}): QuestionTypeDefinition["capabilities"] => ({ autoGrading: true, manualGrading: false, hybridGrading: false, partialCredit: true, compoundPart: true, interactive: true, requiresImage: false, offline: true, ...over });

/** The synthetic V1 / V2 family: observably different editor, renderer, validator and defaults per version. */
const versionedFamily = (): QuestionTypePlugin => ({
  definition: { key: "versionedSynthetic", version: 2, label: "محاكاة مُصدَّرة", category: "interactive", gradingMode: "auto", capabilities: caps(), responseKinds: ["fields"], legacy: false },
  versions: {
    1: {
      defaults: ensure => { ensure("scenario", { rule: "v1" }); ensure("answer", { expectedState: { a: 1 } }); },
      validate: node => ((node.scenario as { rule?: string } | undefined)?.rule === "v1" ? [] : [{ code: "VS1_RULE", message: "V1 يتطلب rule=v1", severity: "error" as const }]),
      Editor: () => <div data-testid="vs-editor">محرر V1</div>,
      StudentRenderer: ({ onAnswer }) => <button type="button" data-testid="vs-renderer" onClick={() => onAnswer({ kind: "fields", values: { a: "1" } })}>عرض V1</button>
    },
    2: {
      defaults: ensure => { ensure("scenario", { rule: "v2", extra: true }); ensure("answer", { expectedState: { a: 2 } }); },
      validate: node => ((node.scenario as { rule?: string } | undefined)?.rule === "v2" ? [] : [{ code: "VS2_RULE", message: "V2 يتطلب rule=v2", severity: "error" as const }]),
      Editor: () => <div data-testid="vs-editor">محرر V2</div>,
      StudentRenderer: ({ onAnswer }) => <button type="button" data-testid="vs-renderer" onClick={() => onAnswer({ kind: "fields", values: { a: "2" } })}>عرض V2</button>
    }
  }
});

/** The universal interactive plugin: public scenario, private expected state under `answer`, serializable response. */
const universalPlugin = (over: Partial<QuestionTypeDefinition> = {}): QuestionTypePlugin => ({
  definition: { key: "universalSim", version: 1, label: "محاكاة عامة", category: "interactive", gradingMode: "auto", capabilities: caps(), responseKinds: ["fields"], legacy: false, ...over },
  versions: {
    1: {
      defaults: ensure => { ensure("scenario", { bodies: [{ id: "b1", mass: 2 }], gravity: 9.8 }); ensure("answer", { expectedState: { b1: "rest" }, tolerance: 0.1 }); },
      validate: node => (Array.isArray((node.scenario as { bodies?: unknown[] } | undefined)?.bodies) ? [] : [{ code: "US_NO_BODIES", message: "لا توجد أجسام.", severity: "error" as const }]),
      Editor: ({ node }) => <div data-testid="qt-editor-universalSim">محرر المحاكاة: g={String((node as unknown as { scenario?: { gravity?: number } }).scenario?.gravity)}</div>,
      StudentRenderer: ({ answer, onAnswer }) => <button type="button" data-testid="us-toggle" onClick={() => onAnswer({ kind: "fields", values: { b1: "rest" } })}>{answer?.kind === "fields" ? "rest" : "moving"}</button>
    }
  }
});

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("RF1 R1 — version normalization authority", () => {
  it("RV1 — absence → V1 for every known type (legacy and Wave 1); explicit supported integers → themselves; malformed / unsupported → fail closed; never coerce or upgrade", () => {
    for (const key of ["multipleChoice", "compound", "multipleSelect", "categorization"]) expect(effectiveQuestionTypeVersion(key, undefined)).toBe(1);
    expect(effectiveQuestionTypeVersion("multipleSelect", 1)).toBe(1);
    expect(effectiveQuestionTypeVersion("multipleSelect", 2)).toBeUndefined();
    expect(effectiveQuestionTypeVersion("multipleChoice", 0)).toBeUndefined(); expect(effectiveQuestionTypeVersion("multipleChoice", 1.5)).toBeUndefined(); expect(effectiveQuestionTypeVersion("multipleChoice", "1")).toBeUndefined(); expect(effectiveQuestionTypeVersion("multipleChoice", null)).toBeUndefined();
    expect(effectiveQuestionTypeVersion("hotspot", undefined)).toBeUndefined();
    const unregister = registerQuestionTypePlugin(versionedFamily());
    try {
      expect(effectiveQuestionTypeVersion("versionedSynthetic", undefined)).toBe(1);                       // absent stays V1 even when current = 2
      expect(effectiveQuestionTypeVersion("versionedSynthetic", 2)).toBe(2);
      expect(effectiveQuestionTypeVersion("versionedSynthetic", 3)).toBeUndefined();                       // RV9
    } finally { unregister(); }
  });
});

describe("RF1 R1 — V1 / V2 coexistence across every runtime registry", () => {
  it("RV2 / RV3 — the authoring registry resolves the EXACT version; absent → V1; unsupported → nothing (never latest)", () => {
    const unregister = registerQuestionTypePlugin(versionedFamily());
    try {
      const E1 = resolveAuthoringEditor("versionedSynthetic", 1), E2 = resolveAuthoringEditor("versionedSynthetic", 2);
      expect(E1).toBeTruthy(); expect(E2).toBeTruthy(); expect(E1).not.toBe(E2);
      expect(resolveAuthoringEditor("versionedSynthetic", undefined)).toBe(E1);
      expect(resolveAuthoringEditor("versionedSynthetic", 3)).toBeUndefined();
      expect(resolveAuthoringEditor("multipleSelect", 2)).toBeUndefined(); expect(resolveAuthoringEditor("multipleSelect", 1)).toBeTruthy();
    } finally { unregister(); }
  });
  it("RV4 / RV5 — the student registry resolves the EXACT version for the stored question; V3 fails closed with a safe notice (no crash)", async () => {
    const unregister = registerQuestionTypePlugin(versionedFamily());
    try {
      const r1 = resolveStudentRenderer("versionedSynthetic", 1), r2 = resolveStudentRenderer("versionedSynthetic", 2), rAbsent = resolveStudentRenderer("versionedSynthetic", undefined);
      expect(r1!.version).toBe(1); expect(r2!.version).toBe(2); expect(rAbsent!.Renderer).toBe(r1!.Renderer); expect(r1!.Renderer).not.toBe(r2!.Renderer);
      expect(resolveStudentRenderer("versionedSynthetic", 3)).toBeUndefined();
      render(<StudentHarness q={{ examQuestionId: "v1", presentationType: "versionedSynthetic", questionTypeVersion: 1, text: "س", marks: 2 } as Question} />);
      expect((await screen.findByTestId("vs-renderer")).textContent).toBe("عرض V1");
      fireEvent.click(screen.getByTestId("vs-renderer")); expect(readAnswer()).toEqual({ kind: "fields", values: { a: "1" } });
      cleanup();
      render(<StudentHarness q={{ examQuestionId: "v2", presentationType: "versionedSynthetic", questionTypeVersion: 2, text: "س", marks: 2 } as Question} />);
      expect((await screen.findByTestId("vs-renderer")).textContent).toBe("عرض V2");
      cleanup();
      render(<StudentHarness q={{ examQuestionId: "v3", presentationType: "versionedSynthetic", questionTypeVersion: 3, text: "س", marks: 2 } as Question} />);
      expect(await screen.findByTestId("qt-student-unsupported")).toBeTruthy(); expect(screen.queryByTestId("vs-renderer")).toBeNull();
    } finally { unregister(); }
  });
  it("RV2 / RV3 in the Builder — a stored V1 question opens the V1 editor, a stored V2 question the V2 editor, a V3 question the explicit unsupported-version state", async () => {
    const unregister = registerQuestionTypePlugin(versionedFamily());
    try {
      const v1 = { examQuestionId: "a", presentationType: "versionedSynthetic", questionTypeVersion: 1, text: "أ", marks: 1, scenario: { rule: "v1" }, answer: { expectedState: { a: 1 } } } as unknown as BuilderQuestion;
      const v2 = { ...v1, examQuestionId: "b", questionTypeVersion: 2, scenario: { rule: "v2" } } as unknown as BuilderQuestion;
      const v3 = { ...v1, examQuestionId: "c", questionTypeVersion: 3 } as unknown as BuilderQuestion;
      await mount(baseExam([v1, v2, v3]));
      const editors = await screen.findAllByTestId("vs-editor");
      expect(editors.map(e => e.textContent)).toEqual(["محرر V1", "محرر V2"]);
      const unsupported = screen.getByTestId("qt-unsupported"); expect(unsupported.textContent).toMatch(/إصدار/); expect(unsupported.textContent).toContain("3");
    } finally { unregister(); }
  });
  it("RV-validator — a V1 configuration is checked by the V1 validator and a V2 configuration by the V2 validator, even though the current version is 2", () => {
    const unregister = registerQuestionTypePlugin(versionedFamily());
    try {
      const v1ok = { scenario: { rule: "v1" } }, v2ok = { scenario: { rule: "v2" } };
      expect(validateQuestionTypeNode(v1ok, "versionedSynthetic", 1)).toEqual([]);
      expect(validateQuestionTypeNode(v1ok, "versionedSynthetic", undefined)).toEqual([]);                    // absent = V1 rules
      expect(validateQuestionTypeNode(v2ok, "versionedSynthetic", 2)).toEqual([]);
      expect(validateQuestionTypeNode(v2ok, "versionedSynthetic", 1).map(i => i.code)).toEqual(["VS1_RULE"]);
      expect(validateQuestionTypeNode(v1ok, "versionedSynthetic", 2).map(i => i.code)).toEqual(["VS2_RULE"]);
      expect(validateQuestionTypeNode(v1ok, "versionedSynthetic", 3).map(i => i.code)).toEqual(["UNSUPPORTED_QUESTION_TYPE_VERSION"]);
    } finally { unregister(); }
  });
  it("RV-defaults — a NEW question is created at the current version with THAT version's defaults; an existing V1 node keeps V1 defaults; legacy stays unstamped", () => {
    const unregister = registerQuestionTypePlugin(versionedFamily());
    try {
      const fresh = newQuestion("versionedSynthetic" as never, { examQuestionId: "n" });
      expect(fresh.questionTypeVersion).toBe(2); expect((fresh as unknown as { scenario: unknown }).scenario).toEqual({ rule: "v2", extra: true });
      const old = newQuestion("versionedSynthetic" as never, { examQuestionId: "o", questionTypeVersion: 1 });
      expect(old.questionTypeVersion).toBe(1); expect((old as unknown as { scenario: unknown }).scenario).toEqual({ rule: "v1" });
      expect(hasRegisteredTypeDefaults("versionedSynthetic", 1)).toBe(true); expect(hasRegisteredTypeDefaults("versionedSynthetic", 2)).toBe(true); expect(hasRegisteredTypeDefaults("versionedSynthetic", 3)).toBe(false);
      expect("questionTypeVersion" in newQuestion("multipleChoice")).toBe(false);
      expect(newQuestion("multipleSelect").questionTypeVersion).toBe(1);
    } finally { unregister(); }
  });
  it("RV8 — registering the family keeps BOTH versions; a duplicate identity is refused without disturbing the existing V1", () => {
    const unregister = registerQuestionTypePlugin(versionedFamily());
    try {
      const before = resolveAuthoringEditor("versionedSynthetic", 1);
      expect(() => registerQuestionTypePlugin(versionedFamily())).toThrow();                              // same key again → refused as a whole
      expect(resolveAuthoringEditor("versionedSynthetic", 1)).toBe(before);
      expect(resolveAuthoringEditor("versionedSynthetic", 2)).toBeTruthy();
      expect(isKnownQuestionType("versionedSynthetic")).toBe(true);
    } finally { unregister(); }
    expect(isKnownQuestionType("versionedSynthetic")).toBe(false); expect(resolveAuthoringEditor("versionedSynthetic", 1)).toBeUndefined(); expect(resolveStudentRenderer("versionedSynthetic", 1)).toBeUndefined();
  });
  it("registration refuses a family whose current version has no implementation or whose versions fall outside 1..current", () => {
    const bad = versionedFamily(); delete (bad.versions as Record<number, unknown>)[2];
    expect(() => registerQuestionTypePlugin(bad)).toThrow();
    expect(isKnownQuestionType("versionedSynthetic")).toBe(false);
    const outOfRange = versionedFamily(); (outOfRange.versions as Record<number, unknown>)[3] = outOfRange.versions[2];
    expect(() => registerQuestionTypePlugin(outOfRange)).toThrow();
    expect(isKnownQuestionType("versionedSynthetic")).toBe(false);
  });
});

describe("RF1 — registration transaction safety", () => {
  it("a mid-registration conflict (the LAST step, the student renderer, is already taken) rolls back every earlier step: no catalog / defaults / validator / editor residue", () => {
    const Occupant = () => null;
    const occupy = registerStudentRenderer("universalSim", 1, Occupant);                                  // the slot the plugin's last step needs
    try {
      expect(() => registerQuestionTypePlugin(universalPlugin())).toThrow(/already registered/);
      expect(isKnownQuestionType("universalSim")).toBe(false);                                            // catalog step undone
      expect(hasRegisteredTypeDefaults("universalSim", 1)).toBe(false);                                   // defaults step undone
      expect(resolveAuthoringEditor("universalSim", 1)).toBeUndefined();                                  // editor step undone
      expect(validateQuestionTypeNode({}, "universalSim", 1).map(i => i.code)).toEqual(["UNKNOWN_QUESTION_TYPE"]); // validator step undone (type unknown again)
      expect(resolveStudentRenderer("universalSim", 1)?.Renderer).toBe(Occupant);                         // the pre-existing registration is untouched
    } finally { occupy(); }
    expect(resolveStudentRenderer("universalSim", 1)).toBeUndefined();
    // malformed families are refused BEFORE any step runs (no residue either)
    const broken = universalPlugin();
    (broken.versions as Record<number, { StudentRenderer: unknown }>)[1] = { ...broken.versions[1], StudentRenderer: "not-a-component" as unknown as never };
    expect(() => registerQuestionTypePlugin(broken)).toThrow();
    expect(isKnownQuestionType("universalSim")).toBe(false);
    // and a clean registration afterwards succeeds (nothing blocked it)
    const ok = registerQuestionTypePlugin(universalPlugin());
    expect(isKnownQuestionType("universalSim")).toBe(true); expect(resolveStudentRenderer("universalSim", 1)).toBeTruthy();
    ok();
    expect(isKnownQuestionType("universalSim")).toBe(false);
  });
});

describe("RF1 R2 — one universal plugin registration is reflected by every platform surface", () => {
  it("UP1 / UP2 / UP6 / UP8 — palette card, composer type selector (selected option + canonical label, undo / redo), exact-version editor, ordinary Answer", async () => {
    const unregister = registerQuestionTypePlugin(universalPlugin());
    try {
      const { hist } = await mount(baseExam([]));
      const d = await openPalette();
      const card = cards(d).find(c => c.getAttribute("data-type-key") === "universalSim"); expect(card).toBeTruthy();
      fireEvent.click(card!); await tick(30);
      const added = hist().present!.sections[0].questions[0];
      expect(added.presentationType).toBe("universalSim"); expect(added.questionTypeVersion).toBe(1); expect((added as unknown as { scenario: { gravity: number } }).scenario.gravity).toBe(9.8);
      const selects = screen.getAllByRole("combobox", { name: "نوع السؤال" }) as HTMLSelectElement[];
      const sel = selects[selects.length - 1];
      expect(sel.value).toBe("universalSim");                                                               // UP2: selected option is the plugin
      const opt = Array.from(sel.options).find(o => o.value === "universalSim"); expect(opt?.textContent).toBe("محاكاة عامة");
      expect(Array.from(sel.options).map(o => o.value)).toEqual(expect.arrayContaining(listQuestionTypes().map(t => t.key)));
      expect((await screen.findByTestId("qt-editor-universalSim")).textContent).toContain("g=9.8");        // UP6 exact version editor
      act(() => hist().undo()); await tick();
      expect(hist().present!.sections[0].questions.length).toBe(0);
      act(() => hist().redo()); await tick();
      expect(hist().present!.sections[0].questions[0].presentationType).toBe("universalSim");
      expect((screen.getAllByRole("combobox", { name: "نوع السؤال" }).at(-1) as HTMLSelectElement).value).toBe("universalSim");
      // the only blocker left is the empty prompt of the freshly added question — no type / version / plugin issue at all
      expect(validateStructuredExam(hist().present!).filter(i => i.severity === "error" && i.code !== "EMPTY_TEXT")).toEqual([]);
    } finally { unregister(); }
  });
  it("UP3 — Blueprint `questionType` constraints ask the live catalog: valid while registered, INVALID_QUESTION_TYPE after unregister; UP4 — coverage shows the canonical label", () => {
    const bp = { ...emptyBlueprint(), constraints: [{ id: "c1", dimension: "questionType" as const, ref: "universalSim", metric: "count" as const, unit: "absolute" as const, target: 1 }] };
    const exam = baseExam([{ examQuestionId: "u1", presentationType: "universalSim", questionTypeVersion: 1, text: "س", marks: 3 } as unknown as BuilderQuestion]);
    expect(validateBlueprint(bp).map(i => i.code)).toContain("INVALID_QUESTION_TYPE");
    const unregister = registerQuestionTypePlugin(universalPlugin());
    try {
      expect(validateBlueprint(bp).filter(i => i.code === "INVALID_QUESTION_TYPE")).toEqual([]);
      const report = evaluateBlueprintCoverage(exam, bp);
      expect(report.constraints[0].refLabel).toBe("محاكاة عامة");
      expect(report.constraints[0].count).toBe(1);
    } finally { unregister(); }
    expect(validateBlueprint(bp).map(i => i.code)).toContain("INVALID_QUESTION_TYPE");
    expect(evaluateBlueprintCoverage(exam, bp).constraints[0].refLabel).toBe("universalSim");
  });
  it("UP5 — the compound part selector follows the live `compoundPart` capability: a compoundPart:true plugin appears, a compoundPart:false plugin does not", () => {
    const yes = registerQuestionTypePlugin(universalPlugin());
    const no = registerQuestionTypePlugin(universalPlugin({ key: "standaloneSim", label: "محاكاة مستقلة", capabilities: caps({ compoundPart: false }) }));
    try {
      expect(compoundPartTypeKeys()).toContain("universalSim"); expect(compoundPartTypeKeys()).not.toContain("standaloneSim");
      const compound = newQuestion("compound", { examQuestionId: "c1", parts: [newPart("multipleChoice", { id: "p1" })] });
      render(<CompoundQuestionEditor question={compound} onChange={() => {}} />);
      const values = Array.from((screen.getByDisplayValue("اختيار من متعدد") as HTMLSelectElement).options).map(o => o.value);
      expect(values).toContain("universalSim"); expect(values).not.toContain("standaloneSim"); expect(values).not.toContain("compound");
    } finally { yes(); no(); }
    cleanup();
    render(<CompoundQuestionEditor question={newQuestion("compound", { examQuestionId: "c2", parts: [newPart("multipleChoice", { id: "p1" })] })} onChange={() => {}} />);
    expect(Array.from((screen.getByDisplayValue("اختيار من متعدد") as HTMLSelectElement).options).map(o => o.value)).not.toContain("universalSim");
  });
  it("UP2 (standalone composer) — the composer's selector mirrors the live catalog and shows the plugin's label; the unknown-type option keeps working", () => {
    const unregister = registerQuestionTypePlugin(universalPlugin());
    try {
      render(<QuestionComposer question={{ examQuestionId: "x", presentationType: "universalSim" as never, questionTypeVersion: 1, text: "س", marks: 1 }} onChange={() => {}} />);
      const sel = screen.getByRole("combobox", { name: "نوع السؤال" }) as HTMLSelectElement;
      expect(sel.value).toBe("universalSim"); expect(sel.selectedOptions[0].textContent).toBe("محاكاة عامة");
    } finally { unregister(); }
  });
  it("UP7 — student renderer resolves the exact version; UP11 — after unregister the same stored question is an unsupported (fail-closed) student state, no crash", async () => {
    const unregister = registerQuestionTypePlugin(universalPlugin());
    const q = { examQuestionId: "u", presentationType: "universalSim", questionTypeVersion: 1, text: "حرّك الجسم", marks: 4, scenario: { bodies: [{ id: "b1", mass: 2 }], gravity: 9.8 } } as unknown as Question;
    try {
      render(<StudentHarness q={q} />);
      fireEvent.click(await screen.findByTestId("us-toggle"));
      expect(readAnswer()).toEqual({ kind: "fields", values: { b1: "rest" } });
    } finally { unregister(); }
    cleanup();
    render(<StudentHarness q={q} />);
    expect(await screen.findByTestId("qt-student-unsupported")).toBeTruthy();
    expect(screen.queryByTestId("us-toggle")).toBeNull();
    expect(questionTypeDefinition("universalSim")).toBeUndefined();
  });
});
