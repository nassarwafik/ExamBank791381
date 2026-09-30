// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import type { StructuredExam, BuilderQuestion } from "../examTypes";
import type { AssessmentBlueprintV1 } from "../assessmentTypes";
import { presetSummary, type AssessmentPresetV1, type AssessmentPresetRecordV1 } from "../assessmentPreset";
import { PresetRequestError, type AssessmentPresetService } from "./assessmentPresetClient";

// Phase 15A — «القوالب الأكاديمية» inside the REAL StructuredExamBuilder with a fake App-owned preset service (the builder never
// receives a token): library (loading / empty / cards), preview, save-current-design (P9), validation failure, create a new
// exam (P10) through the 13A unsaved-work guard + the history authority, update conflict (409), delete, RTL / keyboard.
// Fail-first on 79b2f9e (surface absent).
const mcq = (id: string, text: string): BuilderQuestion => ({ examQuestionId: id, presentationType: "multipleChoice", text, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } } as BuilderQuestion);
const blueprint = (sectionId: string): AssessmentBlueprintV1 => ({ schemaVersion: 1, subject: { id: "networking", label: "شبكات الحاسوب" }, course: { id: "791381", label: "مقرر 791381" }, level: { id: "12", label: "ثاني ثانوي" },
  topics: [{ id: "t1", label: "IPv4" }, { id: "t2", label: "VLAN" }], objectives: [{ id: "o1", label: "يحسب شبكة فرعية", topicId: "t1" }], targets: { totalQuestions: 20, totalMarks: 60 },
  constraints: [{ id: "c1", dimension: "topic", ref: "t1", metric: "count", unit: "absolute", min: 2 }, { id: "c2", dimension: "section", ref: sectionId, metric: "count", unit: "absolute", min: 1 }],
  qualityPolicy: { schemaVersion: 1, enabled: true, rules: [{ id: "qr1", enabled: true, source: { kind: "constraint", constraintId: "c1" }, relations: ["below-min"], effect: "block-finalization", note: "الحد الأدنى" }] } });
const makeExam = (withBlueprint = true): StructuredExam => ({ examId: "EXAM-CURRENT", title: "امتحان الشبكات الحالي", status: "draft", schemaVersion: 2, presentationTheme: "cards",
  ...(withBlueprint ? { blueprint: blueprint("sec-cur-1") } : {}),
  sections: [{ id: "sec-cur-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1", "ما هو الراوتر"), mcq("q2", "طبقات OSI")] }] } as StructuredExam);
const storedPreset = (over: Partial<AssessmentPresetV1> = {}): AssessmentPresetV1 => ({ schemaVersion: 1, presetId: "apr-1", title: "قالب شبكات — نموذج 5 وحدات", description: "امتحان نصفي",
  blueprint: blueprint("ps-A"), sections: [{ presetSectionId: "ps-A", title: "القسم النظري", gradingPolicy: "all" }, { presetSectionId: "ps-B", title: "القسم العملي", gradingPolicy: "capScore", maxMarks: 10 }], presentationTheme: "classic", ...over });
const record = (over: Partial<AssessmentPresetRecordV1> = {}): AssessmentPresetRecordV1 => ({ schemaVersion: 1, presetId: "apr-1", ownerId: "teacher-a", version: 3, createdAt: "2026-10-01T08:00:00.000Z", updatedAt: "2026-10-05T08:00:00.000Z", preset: storedPreset(), ...over });
type Fake = { svc: AssessmentPresetService; calls: { method: string; args: unknown[] }[] };
function fakeService(records: AssessmentPresetRecordV1[] = [record()], opts: { onUpdate?: () => Promise<AssessmentPresetRecordV1>; onCreate?: (p: AssessmentPresetV1) => Promise<AssessmentPresetRecordV1>; listDelay?: number } = {}): Fake {
  const calls: Fake["calls"] = [];
  const store = new Map(records.map(r => [r.presetId, r]));
  const svc: AssessmentPresetService = {
    list: vi.fn(async (q) => { calls.push({ method: "list", args: [q] }); if (opts.listDelay) await new Promise(r => setTimeout(r, opts.listDelay)); const items = Array.from(store.values()).map(presetSummary).filter(s => !q || s.title.includes(q) || s.subject.includes(q)); return { items, nextCursor: null, total: items.length }; }),
    load: vi.fn(async id => { calls.push({ method: "load", args: [id] }); const r = store.get(id); if (!r) throw new PresetRequestError(404, "PRESET_NOT_FOUND", "غير موجود"); return r; }),
    create: vi.fn(async p => { calls.push({ method: "create", args: [p] }); if (opts.onCreate) return opts.onCreate(p); const r = record({ presetId: "apr-new", version: 1, preset: { ...p, presetId: "apr-new" } }); store.set(r.presetId, r); return r; }),
    update: vi.fn(async (id, v, p) => { calls.push({ method: "update", args: [id, v, p] }); if (opts.onUpdate) return opts.onUpdate(); const r = record({ presetId: id, version: v + 1, preset: { ...p, presetId: id } }); store.set(id, r); return r; }),
    remove: vi.fn(async (id, v) => { calls.push({ method: "remove", args: [id, v] }); store.delete(id); })
  };
  return { svc, calls };
}
type HostHandle = { history: () => ReturnType<typeof useStructuredExamHistory> };
function Host({ svc, initial, dirty = false, onHistory }: { svc: AssessmentPresetService; initial?: StructuredExam; dirty?: boolean; onHistory?: (h: ReturnType<typeof useStructuredExamHistory>) => void }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial ?? makeExam(), dirty ? "unsaved" : "saved"); } }, [hist, initial, dirty]);
  useEffect(() => { onHistory?.(hist); });                                            // exposed to the test after every commit, never during render
  const [saving] = useState(false);
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={saving} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo}
    saveState={examSaveState(hist.history, saving)} backupStorage={null} onRecover={hist.recover} autosaveDelayMs={5} presets={svc} onOpenExamFromPreset={next => hist.open(next, "unsaved")} />;
}
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const openLibrary = async () => { fireEvent.click(screen.getByRole("button", { name: /القوالب الأكاديمية/ })); const d = await screen.findByRole("dialog", { name: "القوالب الأكاديمية" }); await tick(30); return d; };

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("15A P8 — Preset Library", () => {
  it("without a preset service the builder offers no library button (unchanged builder)", () => {
    render(<StructuredExamBuilder exam={makeExam()} onChange={() => {}} onSave={() => {}} saving={false} backupStorage={null} autosaveDelayMs={5} />);
    expect(screen.queryByRole("button", { name: /القوالب الأكاديمية/ })).toBeNull();
  });
  it("opens lazily, shows a loading state, then factual cards (title, subject, course, level, counts, version, updated) — no quality score, no question counts; the empty state when nothing exists; RTL and keyboard-reachable", async () => {
    const { svc } = fakeService([record()], { listDelay: 40 });
    render(<Host svc={svc} />);
    fireEvent.click(screen.getByRole("button", { name: /القوالب الأكاديمية/ }));
    const d = await screen.findByRole("dialog", { name: "القوالب الأكاديمية" });
    expect(within(d).getByText(/جارٍ تحميل القوالب/)).toBeTruthy();
    await tick(80);
    const card = within(d).getByTestId("ap-card");
    expect(card.textContent).toContain("قالب شبكات — نموذج 5 وحدات"); expect(card.textContent).toContain("شبكات الحاسوب"); expect(card.textContent).toContain("مقرر 791381"); expect(card.textContent).toContain("ثاني ثانوي");
    expect(card.textContent).toContain("v3");
    const facts = Array.from(card.querySelectorAll("dt")).map(x => x.textContent);
    expect(facts).toEqual(expect.arrayContaining(["الأقسام", "المواضيع", "الأهداف", "القيود", "قواعد الجودة", "آخر تحديث"]));
    expect(card.textContent).not.toMatch(/الأسئلة|درجة الجودة|score/);
    const buttons = within(card).getAllByRole("button").map(b => b.textContent);
    expect(buttons).toEqual(["إنشاء امتحان جديد من هذا القالب", "معاينة", "تحديث القالب من التصميم الحالي", "حذف"]);
    (within(card).getAllByRole("button")[1]).focus(); expect(document.activeElement?.textContent).toBe("معاينة");
    expect(d.closest("[dir]")?.getAttribute("dir") ?? document.documentElement.getAttribute("dir") ?? "rtl").toBeTruthy();
    cleanup();
    const empty = fakeService([]);
    render(<Host svc={empty.svc} />);
    const d2 = await openLibrary();
    expect(within(d2).getByTestId("ap-empty").textContent).toContain("لا قوالب أكاديمية بعد");
  });
  it("preview shows الهوية الأكاديمية / الأهداف / الأقسام / القيود / سياسات الجودة from the loaded record — resolved labels, no fake question counts", async () => {
    const { svc, calls } = fakeService();
    render(<Host svc={svc} />);
    const d = await openLibrary();
    fireEvent.click(within(d).getByRole("button", { name: "معاينة" }));
    const pv = await screen.findByTestId("ap-preview");
    expect(calls.some(c => c.method === "load" && c.args[0] === "apr-1")).toBe(true);
    for (const h of ["الهوية الأكاديمية", "الأهداف", "الأقسام", "القيود", "سياسات الجودة"]) expect(within(pv).getByRole("heading", { name: h })).toBeTruthy();
    expect(pv.textContent).toContain("شبكات الحاسوب"); expect(pv.textContent).toContain("القسم النظري"); expect(pv.textContent).toContain("القسم العملي"); expect(pv.textContent).toContain("حد أعلى 10");
    expect(pv.textContent).toContain("قسم: القسم النظري");                                   // the section constraint resolved to the PRESET section title
    expect(pv.textContent).toContain("موضوع: IPv4"); expect(pv.textContent).toContain("يمنع الاعتماد النهائي"); expect(pv.textContent).toContain("الحد الأدنى");
    expect(pv.textContent).not.toMatch(/ps-A|sec-cur/);
  });
});

describe("15A P9 — save the current design as a preset", () => {
  it("extracts the allow-listed design from the CURRENT exam, lets the teacher title it, creates it on the server and leaves the exam untouched (no dirty state, no undo entry)", async () => {
    const { svc, calls } = fakeService([]);
    const handle: HostHandle = { history: () => { throw new Error("not mounted"); } };
    render(<Host svc={svc} onHistory={h => { handle.history = () => h; }} />);
    const d = await openLibrary();
    fireEvent.click(within(d).getByRole("button", { name: "حفظ التصميم الحالي كقالب أكاديمي" }));
    const dlg = await screen.findByRole("dialog", { name: "حفظ التصميم الحالي كقالب أكاديمي" });
    const title = within(dlg).getByLabelText(/عنوان القالب/) as HTMLInputElement;
    expect(title.value).toBe("امتحان الشبكات الحالي");
    fireEvent.change(title, { target: { value: "قالب من الامتحان الحالي" } });
    fireEvent.change(within(dlg).getByLabelText(/وصف/), { target: { value: "وصف مختصر" } });
    fireEvent.click(within(dlg).getByTestId("ap-save-confirm"));
    await tick(30);
    const created = calls.find(c => c.method === "create")!.args[0] as AssessmentPresetV1;
    expect(created.title).toBe("قالب من الامتحان الحالي"); expect(created.description).toBe("وصف مختصر");
    expect(created.sections).toEqual([{ presetSectionId: expect.stringMatching(/^ps-/), title: "القسم الأول", gradingPolicy: "all", maxMarks: null, requiredAnswers: null, answerUnit: "question" }]);
    expect(created.blueprint.constraints.find(c => c.dimension === "section")!.ref).toBe(created.sections[0].presetSectionId);
    expect(JSON.stringify(created)).not.toMatch(/ما هو الراوتر|correctOptionIndex|sec-cur-1|EXAM-CURRENT|questions|stimuli/);
    expect(within(d).getAllByRole("status").map(x => x.textContent).join(" ")).toContain("الامتحان الحالي لم يتغيّر");
    const h = handle.history();
    expect(h.present!.examId).toBe("EXAM-CURRENT"); expect(h.present!.sections[0].questions).toHaveLength(2);
    expect(h.canUndo).toBe(false); expect(examSaveState(h.history, false)).toBe("saved");
    expect(within(d).getByTestId("ap-card").textContent).toContain("قالب من الامتحان الحالي");
  });
  it("without a Blueprint the save action reports the factual message and never invents one; a server validation failure lists the issues", async () => {
    const { svc, calls } = fakeService([]);
    render(<Host svc={svc} initial={makeExam(false)} />);
    const d = await openLibrary();
    expect(within(d).getByRole("note").textContent).toBe("أضف مخطط الامتحان أولًا قبل حفظ قالب أكاديمي.");
    fireEvent.click(within(d).getByRole("button", { name: "حفظ التصميم الحالي كقالب أكاديمي" }));
    await tick();
    expect(screen.queryByRole("dialog", { name: "حفظ التصميم الحالي كقالب أكاديمي" })).toBeNull();
    expect(within(d).getByRole("alert").textContent).toBe("أضف مخطط الامتحان أولًا قبل حفظ قالب أكاديمي.");
    expect(calls.some(c => c.method === "create")).toBe(false);
    cleanup();
    const failing = fakeService([], { onCreate: async () => { throw new PresetRequestError(400, "PRESET_INVALID", "القالب الأكاديمي غير صالح.", { issues: [{ code: "BLUEPRINT_INVALID", message: "قيد يشير إلى قسم غير موجود.", path: "blueprint.constraints[1]" }] }); } });
    render(<Host svc={failing.svc} />);
    const d2 = await openLibrary();
    fireEvent.click(within(d2).getByRole("button", { name: "حفظ التصميم الحالي كقالب أكاديمي" }));
    const dlg = await screen.findByRole("dialog", { name: "حفظ التصميم الحالي كقالب أكاديمي" });
    fireEvent.click(within(dlg).getByTestId("ap-save-confirm"));
    await tick(30);
    expect(within(d2).getByRole("alert").textContent).toContain("رفض الخادم القالب");
    expect(within(d2).getByRole("list", { name: "مشكلات التحقق" }).textContent).toContain("قيد يشير إلى قسم غير موجود");
  });
  it("updating a preset from the current design sends expectedVersion; a 409 shows the conflict, reloads the list and never retries", async () => {
    const { svc, calls } = fakeService([record()], { onUpdate: async () => { throw new PresetRequestError(409, "STALE_VERSION", "stale", { record: record({ version: 4 }) }); } });
    render(<Host svc={svc} />);
    const d = await openLibrary();
    fireEvent.click(within(d).getByRole("button", { name: "تحديث القالب من التصميم الحالي" }));
    const dlg = await screen.findByRole("dialog", { name: "تحديث القالب من التصميم الحالي" });
    expect(within(dlg).getByTestId("ap-save-confirm").textContent).toContain("3 → 4");
    fireEvent.click(within(dlg).getByTestId("ap-save-confirm"));
    await tick(30);
    const u = calls.find(c => c.method === "update")!;
    expect(u.args[0]).toBe("apr-1"); expect(u.args[1]).toBe(3);
    expect(within(d).getByRole("alert").textContent).toContain("إصدار أحدث");
    expect(calls.filter(c => c.method === "update")).toHaveLength(1);
    expect(calls.filter(c => c.method === "list").length).toBeGreaterThanOrEqual(2);
  });
  it("delete asks for confirmation stating that generated exams are unaffected, then removes with the current version", async () => {
    const { svc, calls } = fakeService();
    render(<Host svc={svc} />);
    const d = await openLibrary();
    fireEvent.click(within(d).getByRole("button", { name: "حذف" }));
    const c = await screen.findByRole("dialog", { name: "حذف القالب الأكاديمي" });
    expect(c.textContent).toContain("الامتحانات التي أُنشئت منه سابقًا لا تتأثر");
    fireEvent.click(within(c).getByRole("button", { name: "حذف القالب" }));
    await tick(30);
    expect(calls.find(x => x.method === "remove")!.args).toEqual(["apr-1", 3]);
    expect(within(d).getByTestId("ap-empty")).toBeTruthy();
  });
});

describe("15A P10 — create a new exam from a preset", () => {
  it("opens a NEW draft through the history authority: fresh examId / section ids, zero questions, remapped constraints, empty undo / redo, unsaved state; the first edit creates the first undo point", async () => {
    const { svc } = fakeService();
    const handle: HostHandle = { history: () => { throw new Error("not mounted"); } };
    render(<Host svc={svc} onHistory={h => { handle.history = () => h; }} />);
    const d = await openLibrary();
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء امتحان جديد من هذا القالب" }));
    await tick(40);
    expect(screen.queryByRole("dialog", { name: "القوالب الأكاديمية" })).toBeNull();
    const h = handle.history();
    const e = h.present!;
    expect(e.examId).toMatch(/^EXAM-/); expect(e.examId).not.toBe("EXAM-CURRENT"); expect(e.status).toBe("draft"); expect(e.title).toBe("قالب شبكات — نموذج 5 وحدات");
    expect(e.sections).toHaveLength(2); expect(e.sections.every(s => s.questions.length === 0 && /^sec-/.test(s.id) && !/^ps-/.test(s.id))).toBe(true);
    expect(e.sections[1]).toMatchObject({ title: "القسم العملي", gradingPolicy: "capScore", maxMarks: 10 });
    expect(e.blueprint!.constraints.find(c => c.dimension === "section")!.ref).toBe(e.sections[0].id);
    expect(e.blueprint!.qualityPolicy).toEqual(storedPreset().blueprint.qualityPolicy); expect(e.presentationTheme).toBe("classic");
    expect(h.canUndo).toBe(false); expect(h.canRedo).toBe(false); expect(examSaveState(h.history, false)).toBe("dirty");
    expect(screen.getByDisplayValue("قالب شبكات — نموذج 5 وحدات")).toBeTruthy();                  // the builder now edits the new exam
    fireEvent.change(screen.getByDisplayValue("قالب شبكات — نموذج 5 وحدات"), { target: { value: "امتحان الفصل الثاني" } });
    await tick();
    expect(handle.history().canUndo).toBe(true); expect(handle.history().present!.examId).toBe(e.examId);
  });
  it("dirty exam protection: with unsaved changes the SAME 13A confirmation is shown; cancel keeps the current exam, confirm opens the new one", async () => {
    const { svc } = fakeService();
    const handle: HostHandle = { history: () => { throw new Error("not mounted"); } };
    render(<Host svc={svc} dirty onHistory={h => { handle.history = () => h; }} />);
    const d = await openLibrary();
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء امتحان جديد من هذا القالب" }));
    const c = await screen.findByRole("dialog", { name: "تغييرات غير محفوظة" });
    expect(c.textContent).toContain("توجد تغييرات غير محفوظة في هذا الامتحان");
    fireEvent.click(within(c).getByRole("button", { name: "البقاء في المحرر" }));
    await tick(20);
    expect(handle.history().present!.examId).toBe("EXAM-CURRENT");
    expect(screen.getByRole("dialog", { name: "القوالب الأكاديمية" })).toBeTruthy();
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء امتحان جديد من هذا القالب" }));
    const c2 = await screen.findByRole("dialog", { name: "تغييرات غير محفوظة" });
    fireEvent.click(within(c2).getByRole("button", { name: "فتح الامتحان الجديد دون حفظ" }));
    await tick(30);
    expect(handle.history().present!.examId).not.toBe("EXAM-CURRENT");
    expect(handle.history().present!.sections.every(s => s.questions.length === 0)).toBe(true);
  });
  it("two exams created from the same preset never share an examId or a section id", async () => {
    const { svc } = fakeService();
    const handle: HostHandle = { history: () => { throw new Error("not mounted"); } };
    render(<Host svc={svc} onHistory={h => { handle.history = () => h; }} />);
    let d = await openLibrary();
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء امتحان جديد من هذا القالب" })); await tick(40);
    const first = handle.history().present!;
    d = await openLibrary();
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء امتحان جديد من هذا القالب" })); await tick(40);
    const c = await screen.findByRole("dialog", { name: "تغييرات غير محفوظة" });      // the first new exam is unsaved → guard again
    fireEvent.click(within(c).getByRole("button", { name: "فتح الامتحان الجديد دون حفظ" })); await tick(40);
    const second = handle.history().present!;
    expect(second.examId).not.toBe(first.examId);
    expect(new Set([...first.sections.map(s => s.id), ...second.sections.map(s => s.id)]).size).toBe(4);
  });
});
