// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import StructuredExamBuilder from "../StructuredExamBuilder";
import StudentQuestionCard from "../StudentQuestionCard";
import AssignmentReview from "../AssignmentReview";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import type { StructuredExam, BuilderQuestion } from "../examTypes";
import { newQuestion } from "../examBuilderState";
import type { Answer } from "../answerState";
import { answered } from "../answerState";
import { resolveAuthoringEditor } from "./authoringRegistry";
import { resolveStudentRenderer } from "./studentRegistry";
import { chipsFor, typeDescription, typeIcon } from "./typePresentation";
import { QUESTION_TYPE_CATALOG, questionTypeDefinition, supportsQuestionTypeVersion } from "../questionTypeCatalog";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import type { Question } from "../studentQuestionTypes";
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (exam: unknown, options?: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;

// Phase 19D — the visual question UI: catalog / palette identity and defaults; the lazy student renderers (hotspot: the image drawn ONCE
// with an SVG overlay, pointer → normalized coordinates measured against the displayed image CONTENT — object-fit letterboxing excluded
// — single / multiple selection with a bound, keyboard placement, marker move / remove, a selection summary, read-only and restore;
// labelDiagram: focusable zones, a label bank, tap-select fallback, select fallback, drag-and-drop, reuse policy, removal), never showing
// targets or the correct mapping; the lazy teacher editors inside the REAL Builder (rectangle / circle / polygon tools, select, move,
// resize, numeric editing, delete, mode / scoring, label bank and mapping, student preview — never raw JSON); the teacher review overlays
// and the lazy-import guards. New-function suite (fail-first on e0ec8e2).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const IMG_URL = "data:image/png;base64,iVBORw0KGgo=";
const IMG = { exists: true, visible: true, assets: [{ dataUrl: IMG_URL, origin: "uploaded", contentType: "image/png" }] };
const ALT = "مخطط شبكة فيه موجّه ومبدّل";
const HCFG = { v: 1, mode: "multiple", selections: 2, alt: ALT };
const HKEY = { scoring: "proportional", regions: [{ id: "t-router", shape: { kind: "rect", x: 0.137, y: 0.113, width: 0.181, height: 0.173 } }, { id: "t-switch", shape: { kind: "circle", cx: 0.617, cy: 0.311, r: 0.093 } }] };
const CANARY = /t-router|t-switch|0\.137|0\.181|0\.617|0\.093/;
const LCFG = { v: 1, alt: "مخطط طبقات OSI", allowReuse: false, zones: [{ id: "z1", shape: { kind: "rect", x: 0.1, y: 0.1, width: 0.2, height: 0.1 }, name: "العليا" }, { id: "z2", shape: { kind: "rect", x: 0.1, y: 0.3, width: 0.2, height: 0.1 } }, { id: "z3", shape: { kind: "circle", cx: 0.7, cy: 0.5, r: 0.1 } }], labels: [{ id: "l-app", text: "Application" }, { id: "l-net", text: "Network" }, { id: "l-phy", text: "Physical" }] };
const LKEY = { scoring: "proportional", correctLabelByZone: { z1: "l-app", z2: "l-net", z3: "l-phy" } };
const hotspotQ = (over: Record<string, unknown> = {}) => ({ ...newQuestion("hotspot" as never, { examQuestionId: "q1", text: "حدّد الجهازين على المخطط.", marks: 2 }), image: clone(IMG), hotspot: clone(HCFG), answer: clone(HKEY), ...over } as unknown as BuilderQuestion);
const labelQ = (over: Record<string, unknown> = {}) => ({ ...newQuestion("labelDiagram" as never, { examQuestionId: "q1", text: "سمِّ الطبقات.", marks: 3 }), image: clone(IMG), labelDiagram: clone(LCFG), answer: clone(LKEY), ...over } as unknown as BuilderQuestion);
const baseExam = (questions: BuilderQuestion[]): StructuredExam => ({ examId: "EXAM-19D", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "sec-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions }] });
const studentQ = (q: BuilderQuestion) => sanitizeExamForStudent(baseExam([q])).sections[0].questions[0];
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** The displayed <img> occupies a 400×300 box at (10, 10); the 800×400 image is letterboxed inside it (content 400×200 at top 60). */
function mockImage(img: HTMLElement, box = { left: 10, top: 10, width: 400, height: 300 }, natural = { width: 800, height: 400 }) {
  img.getBoundingClientRect = () => ({ ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON() { return {}; } }) as DOMRect;
  Object.defineProperty(img, "naturalWidth", { configurable: true, value: natural.width });
  Object.defineProperty(img, "naturalHeight", { configurable: true, value: natural.height });
  fireEvent.load(img);
}

type Hist = ReturnType<typeof useStructuredExamHistory>;
function Host({ initial, onHistory }: { initial: StructuredExam; onHistory: (h: Hist) => void }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial, "saved"); } }, [hist, initial]);
  useEffect(() => { onHistory(hist); });
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={false} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, false)} backupStorage={null} />;
}
async function mountBuilder(initial: StructuredExam) { let hist!: Hist; render(<Host initial={initial} onHistory={h => { hist = h; }} />); await tick(30); return { hist: () => hist }; }
const firstQ = (h: Hist) => h.present!.sections[0].questions[0] as unknown as Record<string, any>;

function StudentHarness({ q, initial, disabled }: { q: Question; initial?: Answer; disabled?: boolean }) {
  const [a, setA] = useState<Answer | undefined>(initial);
  return <><StudentQuestionCard q={q} index={0} id="q1" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={setA} disabled={disabled} /><output data-testid="answer">{JSON.stringify(a ?? null)}</output></>;
}
const answerOut = () => JSON.parse(screen.getByTestId("answer").textContent || "null");

describe("catalog, palette and defaults", () => {
  it("22 types; hotspot@1 / labelDiagram@1 are appended with factual chips; renderers and editors exist for exactly version 1", () => {
    expect(QUESTION_TYPE_CATALOG.length).toBe(26);   /* 20D adds composite (after compound) · 21A.1 adds chartSelection (after composite) */
    expect(QUESTION_TYPE_CATALOG.at(-4)!.key).toBe("hotspot"); expect(QUESTION_TYPE_CATALOG.at(-3)!.key).toBe("labelDiagram");
    for (const key of ["hotspot", "labelDiagram"]) {
      const d = questionTypeDefinition(key)!;
      expect(supportsQuestionTypeVersion(key, 1)).toBe(true); expect(supportsQuestionTypeVersion(key, 2)).toBe(false);
      expect(chipsFor(d)).toEqual(expect.arrayContaining(["تصحيح تلقائي", "علامة جزئية", "تفاعلي", "يحتاج صورة"]));
      expect(chipsFor(d)).not.toContain("يدعم السؤال المركب");
      expect(typeDescription(d).length).toBeGreaterThan(20); expect(typeIcon(d)).not.toBe("▫");
      expect(resolveStudentRenderer(key, 1)).toBeDefined(); expect(resolveStudentRenderer(key, 2)).toBeUndefined();
      expect(resolveAuthoringEditor(key, 1)).toBeDefined();
    }
    const h = newQuestion("hotspot" as never) as unknown as Record<string, unknown>;
    expect(h.hotspot).toEqual({ v: 1, mode: "single", selections: 1, alt: "" }); expect(h.answer).toEqual({ scoring: "allOrNothing", regions: [] }); expect(h.questionTypeVersion).toBe(1);
    const l = newQuestion("labelDiagram" as never) as unknown as Record<string, unknown>;
    expect(l.labelDiagram).toEqual({ v: 1, alt: "", allowReuse: false, zones: [], labels: [] }); expect(l.answer).toEqual({ scoring: "proportional", correctLabelByZone: {} });
  });
  it("the palette offers both visual types under «تفاعلي»; picking one mounts its lazy editor, which asks for the question image first", async () => {
    const { hist } = await mountBuilder(baseExam([newQuestion("multipleChoice", { examQuestionId: "q0", text: "س" })]));
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة سؤال" }));
    const d = await screen.findByRole("dialog", { name: "إضافة سؤال" }); await tick(30);
    expect(within(d).getAllByTestId("qt-card").length).toBe(26);   /* 20D adds composite · 21A.1 adds chartSelection */
    fireEvent.click(within(d).getByRole("tab", { name: "تفاعلي" })); await tick();
    const keys = within(d).getAllByTestId("qt-card").map(c => c.getAttribute("data-type-key"));
    expect(keys).toContain("hotspot"); expect(keys).toContain("labelDiagram");
    fireEvent.click(within(d).getAllByTestId("qt-card").find(c => c.getAttribute("data-type-key") === "hotspot")!); await tick(50);
    const q = hist().present!.sections[0].questions[1] as unknown as Record<string, unknown>;
    expect(q.presentationType).toBe("hotspot"); expect(q.questionTypeVersion).toBe(1);
    const editor = await screen.findByTestId("qt-editor-hotspot", {}, { timeout: 3000 });
    expect(within(editor).getByTestId("visual-needs-image").textContent).toMatch(/صورة السؤال/);
  });
});

describe("student hotspot renderer", () => {
  it("draws the image ONCE (with the authored description as alt) and starts with an empty selection summary", async () => {
    const { container } = render(<StudentHarness q={studentQ(hotspotQ())} />);
    const view = await screen.findByTestId("hotspot-response", {}, { timeout: 3000 });
    expect(container.querySelectorAll("img").length).toBe(1);
    const img = within(view).getByTestId("visual-image") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(IMG_URL); expect(img.getAttribute("alt")).toBe(ALT);
    expect(within(view).getByTestId("hotspot-status").textContent).toMatch(/0 من 2/);
    expect(within(view).getByTestId("visual-overlay").getAttribute("tabindex")).toBe("0");
  });
  it("pointer → normalized coordinates of the displayed CONTENT (letterbox excluded); multiple mode stops at the allowed count", async () => {
    render(<StudentHarness q={studentQ(hotspotQ())} />);
    const view = await screen.findByTestId("hotspot-response", {}, { timeout: 3000 });
    mockImage(within(view).getByTestId("visual-image"));
    const overlay = within(view).getByTestId("visual-overlay");
    fireEvent.click(overlay, { clientX: 110, clientY: 110 });
    expect(answerOut()).toEqual({ kind: "hotspot", points: [{ x: 0.25, y: 0.25 }] });
    fireEvent.click(overlay, { clientX: 110, clientY: 30 });                                       // top letterbox band: not on the image
    expect(answerOut().points).toHaveLength(1);
    fireEvent.click(overlay, { clientX: 310, clientY: 160 });
    expect(answerOut()).toEqual({ kind: "hotspot", points: [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.5 }] });
    fireEvent.click(overlay, { clientX: 200, clientY: 200 });
    expect(answerOut().points).toHaveLength(2);
    expect(within(view).getByTestId("hotspot-status").textContent).toMatch(/2 من 2/);
    expect(within(view).getAllByTestId("hotspot-marker")).toHaveLength(2);
    expect(answered(answerOut())).toBe(true);
  });
  it("single mode: a new click MOVES the one selection", async () => {
    render(<StudentHarness q={studentQ(hotspotQ({ hotspot: { ...HCFG, mode: "single", selections: 1 }, answer: { scoring: "allOrNothing", regions: [HKEY.regions[0]] } }))} />);
    const view = await screen.findByTestId("hotspot-response", {}, { timeout: 3000 });
    mockImage(within(view).getByTestId("visual-image"));
    fireEvent.click(within(view).getByTestId("visual-overlay"), { clientX: 110, clientY: 110 });
    fireEvent.click(within(view).getByTestId("visual-overlay"), { clientX: 310, clientY: 160 });
    expect(answerOut()).toEqual({ kind: "hotspot", points: [{ x: 0.75, y: 0.5 }] });
  });
  it("selection summary lists each point with a remove button; markers are buttons", async () => {
    render(<StudentHarness q={studentQ(hotspotQ())} initial={{ kind: "hotspot", points: [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.5 }] } as Answer} />);
    const view = await screen.findByTestId("hotspot-response", {}, { timeout: 3000 });
    const list = within(view).getByTestId("hotspot-selections");
    expect(list.textContent).toMatch(/النقطة 1/); expect(list.textContent).toMatch(/النقطة 2/);
    expect(within(view).getByRole("button", { name: /^النقطة 1/ })).toBeTruthy();
    fireEvent.click(within(view).getByRole("button", { name: "إزالة النقطة 1" }));
    expect(answerOut()).toEqual({ kind: "hotspot", points: [{ x: 0.75, y: 0.5 }] });
  });
  it("keyboard: arrows move a visible cursor (Shift = larger step), Enter / Space place a point; a focused marker moves with arrows and Delete removes it", async () => {
    render(<StudentHarness q={studentQ(hotspotQ())} />);
    const view = await screen.findByTestId("hotspot-response", {}, { timeout: 3000 });
    const overlay = within(view).getByTestId("visual-overlay");
    overlay.focus();
    for (let i = 0; i < 5; i++) { fireEvent.keyDown(overlay, { key: "ArrowRight" }); fireEvent.keyDown(overlay, { key: "ArrowDown" }); }
    expect(within(view).getByTestId("visual-cursor")).toBeTruthy();
    fireEvent.keyDown(overlay, { key: "Enter" });
    expect(answerOut()).toEqual({ kind: "hotspot", points: [{ x: 0.6, y: 0.6 }] });
    fireEvent.keyDown(overlay, { key: "ArrowLeft", shiftKey: true });
    fireEvent.keyDown(overlay, { key: " " });
    expect(answerOut()).toEqual({ kind: "hotspot", points: [{ x: 0.6, y: 0.6 }, { x: 0.5, y: 0.6 }] });
    const marker = within(view).getByRole("button", { name: /^النقطة 1/ });
    fireEvent.keyDown(marker, { key: "ArrowLeft" });
    expect(answerOut().points[0]).toEqual({ x: 0.58, y: 0.6 });
    fireEvent.keyDown(within(view).getByRole("button", { name: /^النقطة 1/ }), { key: "Delete" });
    expect(answerOut()).toEqual({ kind: "hotspot", points: [{ x: 0.5, y: 0.6 }] });
  });
  it("a marker can be dragged to a new position (pointer events, normalized)", async () => {
    render(<StudentHarness q={studentQ(hotspotQ())} initial={{ kind: "hotspot", points: [{ x: 0.25, y: 0.25 }] } as Answer} />);
    const view = await screen.findByTestId("hotspot-response", {}, { timeout: 3000 });
    mockImage(within(view).getByTestId("visual-image"));
    const marker = within(view).getAllByTestId("hotspot-marker")[0];
    fireEvent.pointerDown(marker, { clientX: 110, clientY: 110, pointerId: 1 });
    fireEvent.pointerMove(within(view).getByTestId("visual-overlay"), { clientX: 210, clientY: 110, pointerId: 1 });
    fireEvent.pointerUp(within(view).getByTestId("visual-overlay"), { clientX: 210, clientY: 110, pointerId: 1 });
    expect(answerOut()).toEqual({ kind: "hotspot", points: [{ x: 0.5, y: 0.25 }] });
  });
  it("read-only: restored markers are shown but nothing changes", async () => {
    render(<StudentHarness q={studentQ(hotspotQ())} initial={{ kind: "hotspot", points: [{ x: 0.25, y: 0.25 }] } as Answer} disabled />);
    const view = await screen.findByTestId("hotspot-response", {}, { timeout: 3000 });
    mockImage(within(view).getByTestId("visual-image"));
    fireEvent.click(within(view).getByTestId("visual-overlay"), { clientX: 310, clientY: 160 });
    expect((within(view).getByRole("button", { name: "إزالة النقطة 1" }) as HTMLButtonElement).disabled).toBe(true);
    expect(answerOut()).toEqual({ kind: "hotspot", points: [{ x: 0.25, y: 0.25 }] });
  });
  it("never draws targets: even the unsanitized teacher question renders no region geometry or ids", async () => {
    const { container } = render(<StudentHarness q={hotspotQ() as unknown as Question} />);
    await screen.findByTestId("hotspot-response", {}, { timeout: 3000 });
    expect(container.innerHTML).not.toMatch(CANARY);
    expect(container.querySelectorAll("[data-testid=region-shape]").length).toBe(0);
  });
  it("an image-less or invalid config is an explicit unavailable state; ordinary questions keep their image", async () => {
    render(<StudentHarness q={studentQ(hotspotQ({ image: undefined }))} />);
    expect((await screen.findByTestId("visual-unavailable", {}, { timeout: 3000 })).textContent).toMatch(/أبلغ معلّمك/);
    cleanup();
    const mc = { ...newQuestion("multipleChoice", { examQuestionId: "m1", text: "ما هذا؟" }), options: [{ text: "أ" }, { text: "ب" }], image: clone(IMG) } as unknown as BuilderQuestion;
    const { container } = render(<StudentHarness q={studentQ(mc)} />);
    expect(container.querySelectorAll("img.iex-image").length).toBe(1);
  });
});

describe("student labelDiagram renderer", () => {
  const zone = (view: HTMLElement, n: number) => within(view).getAllByTestId("label-zone")[n - 1];
  const chip = (view: HTMLElement, text: string) => within(within(view).getByTestId("label-bank")).getByRole("button", { name: new RegExp("^" + text) });
  it("zones are labelled focusable buttons; labels form a bank; nothing shows the correct mapping", async () => {
    const { container } = render(<StudentHarness q={labelQ() as unknown as Question} />);
    const view = await screen.findByTestId("label-diagram-response", {}, { timeout: 3000 });
    expect(within(view).getAllByTestId("label-zone")).toHaveLength(3);
    expect(zone(view, 1).tagName).toBe("BUTTON"); expect(zone(view, 1).getAttribute("aria-label")).toBe("المنطقة 1 — العليا: فارغة");
    expect(zone(view, 2).getAttribute("aria-label")).toBe("المنطقة 2: فارغة");
    expect(within(within(view).getByTestId("label-bank")).getAllByRole("button")).toHaveLength(3);
    expect(container.querySelectorAll("img").length).toBe(1);
    expect(within(view).getByTestId("visual-image").getAttribute("alt")).toBe("مخطط طبقات OSI");
  });
  it("tap fallback: select a label, then tap a zone; reuse disabled moves the label; removal before submission", async () => {
    render(<StudentHarness q={studentQ(labelQ())} />);
    const view = await screen.findByTestId("label-diagram-response", {}, { timeout: 3000 });
    fireEvent.click(chip(view, "Application"));
    expect(chip(view, "Application").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(zone(view, 1));
    expect(answerOut()).toEqual({ kind: "fields", values: { z1: "l-app" } });
    expect(zone(view, 1).getAttribute("aria-label")).toBe("المنطقة 1 — العليا: Application");
    fireEvent.click(chip(view, "Application")); fireEvent.click(zone(view, 2));
    expect(answerOut()).toEqual({ kind: "fields", values: { z2: "l-app" } });
    fireEvent.click(within(view).getByRole("button", { name: "إزالة التسمية من المنطقة 2" }));
    expect(answerOut()).toEqual({ kind: "fields", values: {} });
  });
  it("select fallback (keyboard / screen readers / phones): one labelled combobox per zone", async () => {
    render(<StudentHarness q={studentQ(labelQ())} />);
    const view = await screen.findByTestId("label-diagram-response", {}, { timeout: 3000 });
    fireEvent.change(within(view).getByRole("combobox", { name: "تسمية المنطقة 2" }), { target: { value: "l-net" } });
    fireEvent.change(within(view).getByRole("combobox", { name: "تسمية المنطقة 1" }), { target: { value: "l-app" } });
    expect(answerOut()).toEqual({ kind: "fields", values: { z2: "l-net", z1: "l-app" } });
    fireEvent.change(within(view).getByRole("combobox", { name: "تسمية المنطقة 1" }), { target: { value: "" } });
    expect(answerOut()).toEqual({ kind: "fields", values: { z2: "l-net" } });
  });
  it("drag and drop on desktop", async () => {
    render(<StudentHarness q={studentQ(labelQ())} />);
    const view = await screen.findByTestId("label-diagram-response", {}, { timeout: 3000 });
    expect(chip(view, "Physical").getAttribute("draggable")).toBe("true");
    fireEvent.dragStart(chip(view, "Physical")); fireEvent.dragOver(zone(view, 3)); fireEvent.drop(zone(view, 3));
    expect(answerOut()).toEqual({ kind: "fields", values: { z3: "l-phy" } });
  });
  it("read-only: assignments are shown, nothing changes", async () => {
    render(<StudentHarness q={studentQ(labelQ())} initial={{ kind: "fields", values: { z1: "l-app" } }} disabled />);
    const view = await screen.findByTestId("label-diagram-response", {}, { timeout: 3000 });
    fireEvent.click(chip(view, "Network")); fireEvent.click(zone(view, 2));
    expect(answerOut()).toEqual({ kind: "fields", values: { z1: "l-app" } });
    expect((within(view).getByRole("combobox", { name: "تسمية المنطقة 1" }) as HTMLSelectElement).disabled).toBe(true);
  });
});

describe("teacher editors inside the REAL Builder", () => {
  it("hotspot: description, mode, scoring, rectangle / circle / polygon tools, numeric edit, delete — normalized, never raw JSON", async () => {
    const { hist } = await mountBuilder(baseExam([hotspotQ({ hotspot: { v: 1, mode: "single", selections: 1, alt: "" }, answer: { scoring: "allOrNothing", regions: [] } })]));
    const editor = await screen.findByTestId("qt-editor-hotspot", {}, { timeout: 3000 });
    fireEvent.change(within(editor).getByRole("textbox", { name: "وصف الصورة للطلاب" }), { target: { value: ALT } }); await tick();
    expect(firstQ(hist()).hotspot.alt).toBe(ALT);
    fireEvent.change(within(editor).getByRole("combobox", { name: "طريقة التحديد" }), { target: { value: "multiple" } }); await tick();
    fireEvent.change(within(editor).getByRole("combobox", { name: "طريقة الاحتساب" }), { target: { value: "proportional" } }); await tick();
    expect(firstQ(hist()).answer.scoring).toBe("proportional");
    mockImage(within(editor).getByTestId("visual-image"));
    const overlay = () => within(editor).getByTestId("visual-overlay");
    fireEvent.click(within(editor).getByRole("button", { name: "مستطيل" })); await tick();
    expect(within(editor).getByRole("button", { name: "مستطيل" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(overlay(), { clientX: 110, clientY: 110 }); await tick();
    fireEvent.click(within(editor).getByRole("button", { name: "دائرة" })); await tick();
    fireEvent.click(overlay(), { clientX: 310, clientY: 160 }); await tick();
    fireEvent.click(within(editor).getByRole("button", { name: "مضلع" })); await tick();
    for (const [x, y] of [[110, 160], [210, 160], [160, 210]]) { fireEvent.click(overlay(), { clientX: x, clientY: y }); await tick(); }
    fireEvent.click(within(editor).getByRole("button", { name: "إنهاء المضلع" })); await tick();
    expect(firstQ(hist()).answer.regions).toEqual([
      { id: "t1", shape: { kind: "rect", x: 0.2, y: 0.2, width: 0.1, height: 0.1 } },
      { id: "t2", shape: { kind: "circle", cx: 0.75, cy: 0.5, r: 0.05 } },
      { id: "t3", shape: { kind: "polygon", points: [{ x: 0.25, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.375, y: 0.75 }] } }
    ]);
    expect(firstQ(hist()).hotspot).toEqual({ v: 1, mode: "multiple", selections: 3, alt: ALT });
    fireEvent.click(within(within(editor).getByTestId("region-list")).getByRole("button", { name: "المنطقة 1" })); await tick();
    fireEvent.change(within(editor).getByRole("spinbutton", { name: "عرض المنطقة 1 (%)" }), { target: { value: "30" } }); await tick();
    expect(firstQ(hist()).answer.regions[0].shape).toEqual({ kind: "rect", x: 0.2, y: 0.2, width: 0.3, height: 0.1 });
    fireEvent.click(within(editor).getByRole("button", { name: "حذف المنطقة 1" })); await tick();
    expect(firstQ(hist()).answer.regions.map((r: { id: string }) => r.id)).toEqual(["t2", "t3"]);
    expect(firstQ(hist()).hotspot.selections).toBe(2);
    expect(editor.querySelectorAll("textarea").length).toBe(1);
    expect(editor.textContent).not.toMatch(/"kind"|"regions"|\{"x"/);
  });
  it("hotspot: select tool drags a region and its corner handle resizes it; the student preview shows no targets", async () => {
    const { hist } = await mountBuilder(baseExam([hotspotQ({ hotspot: { ...HCFG, mode: "single", selections: 1 }, answer: { scoring: "allOrNothing", regions: [{ id: "t1", shape: { kind: "rect", x: 0.2, y: 0.2, width: 0.1, height: 0.1 } }] } })]));
    const editor = await screen.findByTestId("qt-editor-hotspot", {}, { timeout: 3000 });
    mockImage(within(editor).getByTestId("visual-image"));
    const overlay = within(editor).getByTestId("visual-overlay");
    fireEvent.click(within(editor).getByRole("button", { name: "تحديد ونقل" })); await tick();
    fireEvent.pointerDown(within(editor).getAllByTestId("region-shape")[0], { clientX: 110, clientY: 110, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 150, clientY: 130, pointerId: 1 });
    fireEvent.pointerUp(overlay, { clientX: 150, clientY: 130, pointerId: 1 }); await tick();
    expect(firstQ(hist()).answer.regions[0].shape).toEqual({ kind: "rect", x: 0.3, y: 0.3, width: 0.1, height: 0.1 });
    fireEvent.pointerDown(within(editor).getByTestId("region-handle"), { clientX: 170, clientY: 140, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 210, clientY: 160, pointerId: 1 });
    fireEvent.pointerUp(overlay, { clientX: 210, clientY: 160, pointerId: 1 }); await tick();
    expect(firstQ(hist()).answer.regions[0].shape).toEqual({ kind: "rect", x: 0.3, y: 0.3, width: 0.2, height: 0.2 });
    fireEvent.click(within(editor).getByRole("button", { name: "معاينة الطالب" })); await tick(50);
    const preview = await within(editor).findByTestId("visual-student-preview", {}, { timeout: 3000 });
    expect(within(preview).queryAllByTestId("region-shape")).toHaveLength(0);
    expect(within(preview).getByTestId("hotspot-response")).toBeTruthy();
  });
  it("labelDiagram: zones, zone names, label bank, correct-label mapping, reuse policy — mapping cleaned when a label is deleted", async () => {
    const { hist } = await mountBuilder(baseExam([labelQ({ labelDiagram: { v: 1, alt: "", allowReuse: false, zones: [], labels: [] }, answer: { scoring: "proportional", correctLabelByZone: {} } })]));
    const editor = await screen.findByTestId("qt-editor-labelDiagram", {}, { timeout: 3000 });
    fireEvent.change(within(editor).getByRole("textbox", { name: "وصف الصورة للطلاب" }), { target: { value: "مخطط طبقات OSI" } }); await tick();
    mockImage(within(editor).getByTestId("visual-image"));
    fireEvent.click(within(editor).getByRole("button", { name: "مستطيل" })); await tick();
    fireEvent.click(within(editor).getByTestId("visual-overlay"), { clientX: 110, clientY: 110 }); await tick();
    expect(firstQ(hist()).labelDiagram.zones).toEqual([{ id: "z1", shape: { kind: "rect", x: 0.2, y: 0.2, width: 0.1, height: 0.1 } }]);
    fireEvent.change(within(editor).getByRole("textbox", { name: "اسم المنطقة 1 (اختياري)" }), { target: { value: "العليا" } }); await tick();
    expect(firstQ(hist()).labelDiagram.zones[0].name).toBe("العليا");
    fireEvent.click(within(editor).getByRole("button", { name: "+ تسمية" })); await tick();
    fireEvent.click(within(editor).getByRole("button", { name: "+ تسمية" })); await tick();
    fireEvent.change(within(editor).getByRole("textbox", { name: "نص التسمية 1" }), { target: { value: "Application" } }); await tick();
    fireEvent.change(within(editor).getByRole("textbox", { name: "نص التسمية 2" }), { target: { value: "Network" } }); await tick();
    const made = firstQ(hist()).labelDiagram.labels as { id: string; text: string }[];
    expect(made.map(l => l.text)).toEqual(["Application", "Network"]);
    // Independent review: label ids are PUBLIC, so they are opaque — never "l1, l2, …" mirroring the zones "z1, z2, …".
    const [idA, idB] = made.map(l => l.id);
    for (const id of [idA, idB]) { expect(id).toMatch(/^[A-Za-z][A-Za-z0-9_-]{0,31}$/); expect(id).not.toMatch(/^l\d+$/); }
    expect(idA).not.toBe(idB);
    fireEvent.change(within(editor).getByRole("combobox", { name: "التسمية الصحيحة للمنطقة 1" }), { target: { value: idB } }); await tick();
    expect(firstQ(hist()).answer.correctLabelByZone).toEqual({ z1: idB });
    fireEvent.click(within(editor).getByRole("checkbox", { name: "السماح باستخدام التسمية أكثر من مرة" })); await tick();
    expect(firstQ(hist()).labelDiagram.allowReuse).toBe(true);
    fireEvent.click(within(editor).getByRole("button", { name: "حذف التسمية 2" })); await tick();
    expect(firstQ(hist()).labelDiagram.labels).toEqual([{ id: idA, text: "Application" }]);
    expect(firstQ(hist()).answer.correctLabelByZone).toEqual({});
    expect(within(editor).getByTestId("visual-issues").textContent).toMatch(/المنطقة 1/);
    expect(editor.textContent).not.toMatch(/"zones"|"correctLabelByZone"|\{"x"/);
  });
});

describe("teacher review", () => {
  const body = (q: Record<string, unknown>) => ({ ok: true, assignment: { assignmentId: "a1", title: "واجب", totalMarks: 3 }, student: { studentId: "s1", studentName: "سارة", studentCode: "S1" }, attempt: { attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 1, totalMarks: 3, percentage: 33, manualReviewMarks: 0, finalized: true, gradingStatus: "final", teacherFeedback: "" }, attempts: [{ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 1, totalMarks: 3, percentage: 33, manualReviewMarks: 0, finalized: true, gradingStatus: "final" }], questions: [{ questionId: "q1", questionNumber: 1, text: "س", marks: 2, manualScore: null, teacherComment: "", ...q }] });
  const mount = async (q: Record<string, unknown>, testId: string) => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ status: 200, ok: true, json: async () => body(q) } as Response)) as unknown as typeof fetch;
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    return screen.findByTestId(testId, {}, { timeout: 3000 });
  };
  it("hotspot: the image, the private targets (matched / missed), the student's points and the earned parts", async () => {
    const view = await mount({ type: "hotspot", hotspot: HCFG, image: IMG, studentAnswer: { kind: "hotspot", points: [{ x: 0.2, y: 0.2 }, { x: 0.95, y: 0.9 }] }, expectedAnswer: HKEY, autoGrade: { score: 1, manualReview: false, parts: { correct: 1, total: 2 } } }, "hotspot-review");
    expect(within(view).getByTestId("visual-image").getAttribute("src")).toBe(IMG_URL);
    const targets = within(view).getAllByTestId("hotspot-review-target");
    expect(targets.map(t => t.getAttribute("data-matched"))).toEqual(["true", "false"]);
    expect(within(view).getAllByTestId("hotspot-review-point")).toHaveLength(2);
    expect(view.textContent).toMatch(/1 من 2/);
  });
  it("hotspot: an invalid published key is an explicit manual-review state", async () => {
    const view = await mount({ type: "hotspot", hotspot: HCFG, image: IMG, studentAnswer: { kind: "hotspot", points: [] }, expectedAnswer: { ...HKEY, scoring: "bonus" }, autoGrade: { score: 0, manualReview: true } }, "hotspot-review");
    expect(within(view).getByTestId("hotspot-review-unavailable").textContent).toMatch(/تصحيح يدوي/);
  });
  it("labelDiagram: per zone the student's label, the correct label and ✓ / ✗", async () => {
    const view = await mount({ type: "labelDiagram", labelDiagram: LCFG, image: IMG, studentAnswer: { kind: "fields", values: { z1: "l-app", z2: "l-phy" } }, expectedAnswer: LKEY, autoGrade: { score: 1, manualReview: false, parts: { correct: 1, total: 3 } } }, "label-review");
    const rows = within(view).getAllByTestId("label-review-row");
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toMatch(/Application.*Application.*✓/); expect(rows[1].textContent).toMatch(/Physical.*Network.*✗/); expect(rows[2].textContent).toMatch(/—.*Physical.*✗/);
    expect(view.textContent).toMatch(/1 من 3/);
  });
});

describe("lazy loading and module hygiene", () => {
  it("renderers / editors are reached ONLY through the registries' import() edges; no innerHTML / eval / network in the new UI modules", () => {
    const srcFiles: string[] = [];
    const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|dist/.test(p)) walk(p); } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) srcFiles.push(p); } };
    walk(path.join(repo, "src"));
    const staticImporters = (name: string) => srcFiles.filter(f => new RegExp("^import[^;]*from\\s*\"[^\"]*" + name + "\"", "m").test(fs.readFileSync(f, "utf8"))).map(f => path.relative(repo, f));
    for (const m of ["editors/HotspotEditor", "editors/LabelDiagramEditor", "student/HotspotResponse", "student/LabelDiagramResponse"]) expect(staticImporters(m), m).toEqual([]);
    expect(staticImporters("visual/VisualReviewView")).toEqual(["src/AssignmentReview.tsx"]);
    const strip = (t: string) => t.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const f of ["src/visual/VisualCanvas.tsx", "src/visual/RegionEditor.tsx", "src/visual/VisualReviewView.tsx", "src/questionTypes/student/HotspotResponse.tsx", "src/questionTypes/student/LabelDiagramResponse.tsx", "src/questionTypes/editors/HotspotEditor.tsx", "src/questionTypes/editors/LabelDiagramEditor.tsx", "src/visualGeometry.ts", "src/hotspotQuestion.ts", "src/labelDiagramQuestion.ts"])
      expect(strip(fs.readFileSync(path.join(repo, f), "utf8")), f).not.toMatch(/dangerouslySetInnerHTML|innerHTML|\beval\s*\(|new Function|fetch\(|XMLHttpRequest|localStorage|Math\.random|https?:\/\//);
    for (const f of ["src/visualGeometry.ts", "src/hotspotQuestion.ts", "src/labelDiagramQuestion.ts"]) expect(fs.readFileSync(path.join(repo, f), "utf8"), f).not.toMatch(/from "react"|document\.|window\./);
    expect(fs.readFileSync(path.join(repo, "src/questionTypes/studentRegistry.tsx"), "utf8")).toMatch(/registerStudentRenderer\("hotspot", 1, lazy\(\(\) => import\("\.\/student\/HotspotResponse"\)\)\)/);
    expect(fs.readFileSync(path.join(repo, "src/questionTypes/studentRegistry.tsx"), "utf8")).toMatch(/registerStudentRenderer\("labelDiagram", 1, lazy\(\(\) => import\("\.\/student\/LabelDiagramResponse"\)\)\)/);
    expect(fs.readFileSync(path.join(repo, "src/questionTypes/authoringRegistry.tsx"), "utf8")).toMatch(/registerAuthoringEditor\("hotspot", 1, lazy\(\(\) => import\("\.\/editors\/HotspotEditor"\)\)\)/);
    expect(fs.readFileSync(path.join(repo, "src/questionTypes/authoringRegistry.tsx"), "utf8")).toMatch(/registerAuthoringEditor\("labelDiagram", 1, lazy\(\(\) => import\("\.\/editors\/LabelDiagramEditor"\)\)\)/);
    expect(fs.readFileSync(path.join(repo, "scripts/check-bundle-budget.mjs"), "utf8")).toMatch(/VISUAL_SIGNATURES/);
  });
});
