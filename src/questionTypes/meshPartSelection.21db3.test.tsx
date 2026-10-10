// @vitest-environment happy-dom
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectGlbAsset, type MeshDocument } from "../meshModels/glbAsset";
import { MESH_LIBRARY } from "../meshModels/meshAssetCatalog";
import { draftFromLibrary } from "../meshModels/meshModelDraft";
import type { MeshModelSpecV1 } from "../meshModels/meshModelSpec";
import type { MeshLoadResult } from "../meshModels/meshAssetLoader";
import type { MeshRenderer } from "../meshModels/meshRenderer";
import MeshPartSelectionResponse from "./student/MeshPartSelectionResponse";
import MeshPartSelectionEditor from "./editors/MeshPartSelectionEditor";
import MeshPartSelectionReview from "../meshModels/MeshPartSelectionReview";
import { resolveAuthoringEditor } from "./authoringRegistry";
import { resolveStudentRenderer } from "./studentRegistry";
import { MeshAssetServiceContext, type MeshAssetService } from "../meshModels/meshAssetService";

// Phase 21D-B.3 — meshPartSelection@1 UI: the student answers with named parts (spatial pick or the accessible list; the answer is ids
// only), the teacher authors the question and its PRIVATE key on top of the B.2 model editor (the key is pruned when labelled parts
// change), and the review re-evaluates the stored answer with the same shared authority, showing the real labels.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const docs = new Map<string, MeshDocument>();
for (const a of MESH_LIBRARY) {
  const r = inspectGlbAsset(new Uint8Array(fs.readFileSync(path.join(root, "public/mesh-assets", a.sha256 + ".glb"))));
  if (!r.ok) throw new Error("asset");
  docs.set(a.sha256, r.document);
}
const loads = vi.hoisted(() => ({ count: 0 }));
vi.mock("../meshModels/meshAssetLoader", async orig => ({
  ...(await orig<typeof import("../meshModels/meshAssetLoader")>()),
  loadMeshModelAsset: async (m: MeshModelSpecV1): Promise<MeshLoadResult> => { loads.count++; return { ok: true, value: { sha256: m.asset.sha256, document: docs.get(m.asset.sha256)!, summary: null as never } }; }
}));
vi.mock("../meshModels/meshRenderer", async orig => ({
  ...(await orig<typeof import("../meshModels/meshRenderer")>()),
  createMeshRenderer: (): MeshRenderer => ({ resize() {}, render() {}, pick: () => null, pickMany: () => [], probe: () => null, texturesReady: Promise.resolve(), dispose() {},
    stats: () => ({ drawCalls: 4, triangles: 99207, gpuBytes: 1, textures: 0, frames: 1, samples: 4, dpr: 1, width: 640, height: 400, contextLost: false }) })
}));
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise(r => setTimeout(r, 15)); }); };

const HEART = MESH_LIBRARY[0];
const IDS = ["rightAtrium", "leftAtrium", "rightVentricle", "leftVentricle"];
const model = (id = "heartQ") => { const m = draftFromLibrary(HEART, id); return { ...m, parts: m.parts.filter(p => IDS.includes(p.id)) }; };
const cfg = (over: Record<string, unknown> = {}) => ({ v: 1, model: model(), mode: "multiple", maxSelections: 2, ...over });
const q = (config: unknown) => ({ id: "q1", type: "meshPartSelection", presentationType: "meshPartSelection", text: "اختر", marks: 4, meshPartSelection: config }) as never;
type Ans = { kind: "meshPartSelection"; modelId: string; parts: string[] };

function Student({ config, initial, disabled, spy }: { config: unknown; initial?: Ans; disabled?: boolean; spy?: (a: Ans) => void }) {
  const [answer, setAnswer] = useState<Ans | undefined>(initial);
  return <MeshPartSelectionResponse q={q(config)} id="q1" labelPrefix="" answer={answer as never} disabled={disabled} onAnswer={a => { spy?.(a as Ans); setAnswer(a as Ans); }} />;
}
const box = (label: string) => screen.getByLabelText("اختيار " + label) as HTMLInputElement;

describe("21D-B.3 student renderer", () => {
  let io: unknown;
  beforeEach(() => { io = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver; (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined; });
  afterEach(() => { cleanup(); (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = io; });

  it("answers with part ids of the published model (canonical model order), within the limit, via the accessible list", async () => {
    const spy = vi.fn();
    render(<Student config={cfg()} spy={spy} />);
    await flush();
    expect(screen.getByText("اختر حتى 2 أجزاء من النموذج.")).toBeTruthy();
    fireEvent.click(box("البطين الأيسر"));
    fireEvent.click(box("الأذين الأيمن"));
    expect(spy).toHaveBeenLastCalledWith({ kind: "meshPartSelection", modelId: "heartQ", parts: ["leftVentricle", "rightAtrium"] });
    expect(box("الأذين الأيسر").disabled).toBe(true);                                  // the limit is reached
    fireEvent.click(box("البطين الأيسر"));
    expect(spy).toHaveBeenLastCalledWith({ kind: "meshPartSelection", modelId: "heartQ", parts: ["rightAtrium"] });
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/camera|azimuth|"x"|score/);
  });
  it("single choice replaces the selection; the teacher's instruction is shown; a disabled question emits nothing", async () => {
    const spy = vi.fn();
    const { unmount } = render(<Student config={cfg({ mode: "single", maxSelections: 1, label: "انقر الحجرة التي تضخ الدم إلى الجسم." })} spy={spy} />);
    await flush();
    expect(screen.getByText("انقر الحجرة التي تضخ الدم إلى الجسم.")).toBeTruthy();
    fireEvent.click(box("البطين الأيمن"));
    fireEvent.click(box("البطين الأيسر"));
    expect(spy).toHaveBeenLastCalledWith({ kind: "meshPartSelection", modelId: "heartQ", parts: ["leftVentricle"] });
    unmount();
    const none = vi.fn();
    render(<Student config={cfg()} disabled spy={none} />);
    await flush();
    fireEvent.click(box("البطين الأيسر"));
    expect(none).not.toHaveBeenCalled();
  });
  it("restores a saved answer; an answer for another model is not shown as selected", async () => {
    const { unmount } = render(<Student config={cfg()} initial={{ kind: "meshPartSelection", modelId: "heartQ", parts: ["leftAtrium"] }} />);
    await flush();
    expect(box("الأذين الأيسر").checked).toBe(true);
    unmount();
    render(<Student config={cfg()} initial={{ kind: "meshPartSelection", modelId: "other", parts: ["leftAtrium"] }} />);
    await flush();
    expect(box("الأذين الأيسر").checked).toBe(false);
  });
  it("hidden labels: the student sees neutral part names only; an invalid config shows a meaningful note, never a broken model", async () => {
    const { unmount, container } = render(<Student config={cfg({ hideLabels: true })} />);
    await flush();
    fireEvent.click(box("الجزء ٤"));
    // the parts list, the scene's accessible name and the live status name neutral parts only (the provenance block keeps the licence's
    // attribution and the general educational limitations of the asset, which name no part of this question)
    const named = [container.querySelector(".mm3d-parts")!.textContent, container.querySelector("[role=img]")!.getAttribute("aria-label"), container.querySelector(".mm3d-status")!.textContent].join(" | ");
    expect(named).toContain("الجزء ١");
    expect(named).toContain("اخترت 1 من 2: الجزء ٤");
    expect(named).not.toMatch(/البطين|الأذين/);
    unmount();
    render(<Student config={cfg({ mode: "nope" })} />);
    expect(screen.getByTestId("mesh-selection-unavailable").textContent).toContain("تعذّر عرض النموذج");
  });
  it("is registered lazily for meshPartSelection@1 only (unknown versions are unsupported, never guessed)", () => {
    expect(resolveStudentRenderer("meshPartSelection", 1)?.key).toBe("meshPartSelection");
    expect(resolveStudentRenderer("meshPartSelection", 2)).toBeUndefined();
    expect(resolveAuthoringEditor("meshPartSelection", 1)).toBeTruthy();
  });
});

type Node = { presentationType: string; questionTypeVersion: number; meshPartSelection?: unknown; answer?: unknown };
function Editor({ initial }: { initial: Node }) {
  const [node, setNode] = useState<Node>(initial);
  return <><MeshPartSelectionEditor node={node as never} onChange={p => setNode(n => ({ ...n, ...(p as object) }))} />
    <output data-testid="node">{JSON.stringify(node)}</output></>;
}
const current = (): Node => JSON.parse(screen.getByTestId("node").textContent || "{}");
const keyBox = (label: string) => within(screen.getByTestId("mesh-answer-key")).getByLabelText("إجابة صحيحة: " + label) as HTMLInputElement;

describe("21D-B.3 teacher editor", () => {
  let io: unknown;
  beforeEach(() => { io = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver; (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined; });
  afterEach(() => { cleanup(); (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = io; });

  it("choosing a library model writes a canonical config + an empty private key, and explains what is missing", async () => {
    render(<Editor initial={{ presentationType: "meshPartSelection", questionTypeVersion: 1 }} />);
    expect(screen.getByTestId("mesh-question-issues").textContent).toContain("مفقود");
    const heart = document.querySelector('.mm3d-lib li[data-asset="human-heart-bp3d"]') as HTMLElement;
    fireEvent.click(within(heart).getByRole("button"));
    await flush();
    const n = current();
    expect(n.meshPartSelection).toMatchObject({ v: 1, mode: "single", maxSelections: 1, model: { asset: { source: "library", id: "human-heart-bp3d" } } });
    expect(n.answer).toEqual({ scoring: "allOrNothing", correct: [] });
    expect(within(screen.getByTestId("mesh-question-issues")).getByText(/حدّد الجزء الصحيح/)).toBeTruthy();
    fireEvent.click(keyBox("البطين الأيسر"));
    expect(current().answer).toEqual({ scoring: "allOrNothing", correct: ["leftVentricle"] });
    expect(screen.queryByTestId("mesh-question-issues")).toBeNull();
  });
  it("multiple selection with partial scoring; the key follows the model order; single mode keeps one answer", async () => {
    render(<Editor initial={{ presentationType: "meshPartSelection", questionTypeVersion: 1, meshPartSelection: cfg({ mode: "single", maxSelections: 1 }), answer: { scoring: "allOrNothing", correct: ["leftVentricle"] } }} />);
    await flush();
    fireEvent.click(screen.getByLabelText("اختيار عدة أجزاء"));
    fireEvent.change(screen.getByLabelText("أقصى عدد للاختيارات"), { target: { value: "2" } });
    fireEvent.click(screen.getByLabelText(/علامة جزئية/));
    fireEvent.click(keyBox("الأذين الأيمن"));
    expect(current().meshPartSelection).toMatchObject({ mode: "multiple", maxSelections: 2 });
    expect(current().answer).toEqual({ scoring: "partial", correct: ["rightAtrium", "leftVentricle"] });
    fireEvent.change(screen.getByLabelText("أقصى عدد للاختيارات"), { target: { value: "99" } });
    expect((current().meshPartSelection as { maxSelections: number }).maxSelections).toBe(4);        // bounded by the labelled parts
    fireEvent.click(screen.getByLabelText("اختيار جزء واحد"));
    expect(current().answer).toEqual({ scoring: "allOrNothing", correct: ["rightAtrium"] });
    expect(screen.getByText("الاختيار الواحد يحتفظ بإجابة صحيحة واحدة فقط.")).toBeTruthy();
  });
  it("removing a labelled part prunes it from the private key and tells the teacher; hideLabels and the instruction are authored", async () => {
    render(<Editor initial={{ presentationType: "meshPartSelection", questionTypeVersion: 1, meshPartSelection: cfg(), answer: { scoring: "partial", correct: ["leftAtrium", "leftVentricle"] } }} />);
    await flush();
    fireEvent.click(screen.getByLabelText("تضمين الجزء leftAtrium"));
    expect(current().answer).toEqual({ scoring: "partial", correct: ["leftVentricle"] });
    expect(screen.getByText(/أُزيل من مفتاح الإجابة/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/إخفاء أسماء الأجزاء عن الطالب/));
    fireEvent.change(screen.getByPlaceholderText(/مثال: انقر الحجرة/), { target: { value: "اختر الحجرتين." } });
    expect(current().meshPartSelection).toMatchObject({ hideLabels: true, label: "اختر الحجرتين." });
    expect(JSON.stringify(current().meshPartSelection)).not.toMatch(/correct|scoring/);       // the key never sits in the public config
  });
});

describe("21D-B.3 upload service wiring (App → Builder → question editor)", () => {
  let io: unknown;
  beforeEach(() => { io = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver; (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined; });
  afterEach(() => { cleanup(); (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = io; });
  const RAW = import.meta.glob(["../App.tsx", "../StructuredExamBuilder.tsx"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

  it("the editor reaches the App-owned service through the builder's context: with it the teacher's uploads are offered, without it only the library", async () => {
    const svc: MeshAssetService = { list: vi.fn(async () => []), upload: vi.fn() as never };
    const { unmount } = render(<MeshAssetServiceContext.Provider value={svc}><Editor initial={{ presentationType: "meshPartSelection", questionTypeVersion: 1 }} /></MeshAssetServiceContext.Provider>);
    await flush();
    expect(screen.getByRole("tab", { name: "نماذجي المرفوعة" })).toBeTruthy();
    unmount();
    render(<Editor initial={{ presentationType: "meshPartSelection", questionTypeVersion: 1 }} />);
    expect(screen.queryByRole("tab", { name: "نماذجي المرفوعة" })).toBeNull();
  });
  it("App builds the service lazily with the shared builder auth headers and hands it to the builder, which provides it to every editor", () => {
    expect(RAW["../App.tsx"]).toMatch(/import\("\.\/meshModels\/meshAssetClient"\)\.then\(m => m\.createMeshAssetService\(\{ requestJson: url => apiRequestRef\.current\(url\), authHeaders: builderAuthHeaders \}\)\)/);
    expect(RAW["../App.tsx"]).toMatch(/meshAssets=\{structuredMeshAssets\}/);
    expect(RAW["../App.tsx"]).not.toMatch(/^import [^;]*meshAssetClient/m);
    expect(RAW["../StructuredExamBuilder.tsx"]).toMatch(/<MeshAssetServiceContext\.Provider value=\{meshAssets\}>/);
  });
});

describe("21D-B.3 teacher review", () => {
  let io: unknown;
  beforeEach(() => { io = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver; (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined; });
  afterEach(() => { cleanup(); (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = io; });

  it("marks every labelled part with the REAL label (also for hidden-label questions) and summarizes the result", async () => {
    render(<MeshPartSelectionReview config={cfg({ hideLabels: true })} answerKey={{ scoring: "partial", correct: ["rightVentricle", "leftVentricle"] }} answer={{ kind: "meshPartSelection", modelId: "heartQ", parts: ["leftVentricle", "leftAtrium"] }} />);
    await flush();
    expect(screen.getByTestId("mesh-review-summary").textContent).toBe("الأجزاء الصحيحة المختارة: 1 من 2 · رأى الطالب أسماء محايدة للأجزاء");
    const items = [...document.querySelectorAll(".mm3d-review-list li")].map(li => [li.className, li.textContent]);
    expect(items).toEqual([["is-incorrect", "الأذين الأيسر — اختيار غير صحيح"], ["is-missed", "البطين الأيمن — جزء صحيح لم يُختر"], ["is-correct", "البطين الأيسر — اختيار صحيح"]]);
    const boxes = [...document.querySelectorAll(".mm3d-parts input[type=checkbox]")] as HTMLInputElement[];
    expect(boxes.every(b => b.disabled)).toBe(true);
  });
  it("an exact answer is reported as such; an unclassifiable key is reported for manual review, never guessed", async () => {
    const { unmount } = render(<MeshPartSelectionReview config={cfg()} answerKey={{ scoring: "allOrNothing", correct: ["leftVentricle"] }} answer={{ kind: "meshPartSelection", modelId: "heartQ", parts: ["leftVentricle"] }} />);
    await flush();
    expect(screen.getByTestId("mesh-review-summary").textContent).toBe("إجابة صحيحة تمامًا");
    unmount();
    render(<MeshPartSelectionReview config={cfg()} answerKey={{ scoring: "allOrNothing", correct: ["aorta"] }} answer={null} />);
    expect(screen.getByTestId("mesh-review-invalid").textContent).toContain("يحتاج تصحيحًا يدويًا");
  });
});
