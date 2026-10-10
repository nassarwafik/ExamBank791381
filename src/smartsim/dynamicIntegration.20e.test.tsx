// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState } from "react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, cleanup, act, fireEvent, screen, within } from "@testing-library/react";
import StudentQuestionCard, { type Question } from "../StudentQuestionCard";
import type { Answer } from "../answerState";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import { compositePhysicsExam } from "../composite/compositeFixtures";

// Phase 20E — integration: Composite shared SmartSim (one workspace, one clock, one action stream; answering other parts never resets
// the simulation), presentation-only controls inside Composite never touch the composite answer, the bundle guard knows the dynamic
// signatures (lazy, budget unchanged), dynamic code is repository-owned (no eval / HTML / external URLs) and themed only through the
// validated presentation variables. Fail-first on 78445fd.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f: string) => fs.readFileSync(path.join(repo, f), "utf8");
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (e: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;
type Frame = { id: number; cb: FrameRequestCallback };
let frames: Frame[] = [], nextId = 1;
const runFrame = (ts: number) => { const due = frames; frames = []; for (const f of due) f.cb(ts); };
beforeEach(() => {
  frames = []; nextId = 1;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { const id = nextId++; frames.push({ id, cb }); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames = frames.filter(f => f.id !== id); });
  vi.spyOn(console, "error").mockImplementation(() => {});
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as never;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

const answers: Answer[] = [];
function Harness() {
  const q = sanitizeExamForStudent(compositePhysicsExam()).sections[0].questions[0];
  const [a, setA] = useState<Answer | undefined>(undefined);
  return <StudentQuestionCard q={q} index={0} id="phys1" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={next => { answers.push(next); setA(next); }} />;
}

describe("20E-I1 Composite shared physics: one dynamic simulation, one clock, one action stream", () => {
  it("renders ONE workspace for the shared context; playback runs ONE frame loop; answering another part does not reset the simulation", async () => {
    answers.length = 0;
    render(<Harness />);
    const w = await screen.findByTestId("freefall-workspace", {}, { timeout: 3000 });
    expect(screen.getAllByTestId("freefall-workspace").length).toBe(1);
    fireEvent.click(within(w).getByRole("button", { name: "تشغيل" }));
    expect(frames.length).toBe(1);
    act(() => runFrame(0)); act(() => runFrame(100));
    fireEvent.click(within(w).getByRole("button", { name: "إيقاف مؤقت" }));
    fireEvent.change(within(w).getByRole("slider", { name: /زمن المحاكاة/ }), { target: { value: "1" } });
    expect(answers).toEqual([]);                                                   // presentation never reaches the composite answer
    const part = document.querySelector("[data-part-id=n1]") as HTMLElement;
    fireEvent.change(within(part).getByRole("textbox"), { target: { value: "9.8" } });
    await tick(30);
    expect(answers.length).toBeGreaterThanOrEqual(1);
    const last = answers.at(-1) as unknown as { kind: string; contexts: Record<string, unknown> };
    expect(last.kind).toBe("composite");
    expect(last.contexts).toEqual({});                                             // no SmartSim action was produced by playback
    const again = screen.getAllByTestId("freefall-workspace");
    expect(again.length).toBe(1);
    expect(within(again[0]).getByTestId("freefall-height-plot").querySelector("[data-testid=dyn-marker]")!.getAttribute("data-x")).toBe("1.0000");
  });
  it("a semantic action in the shared workspace produces exactly one context action stream", async () => {
    answers.length = 0;
    render(<Harness />);
    const w = await screen.findByTestId("freefall-workspace", {}, { timeout: 3000 });
    const m = within(w).getAllByTestId("freefall-measurement").find(f => f.getAttribute("data-id") === "impactTime")!;
    fireEvent.change(within(m).getByRole("textbox"), { target: { value: "2.02" } });
    fireEvent.click(within(m).getByRole("button", { name: /حفظ/ })); await tick();
    const last = answers.at(-1) as unknown as { contexts: Record<string, { actions: unknown[] }> };
    expect(Object.keys(last.contexts)).toEqual(["ctxSim"]);
    expect(last.contexts.ctxSim.actions).toEqual([{ type: "measurement.set", measurementId: "impactTime", value: 2.02 }]);
  });
});

describe("20E-I2 bundle, laziness, security and presentation integration", () => {
  const files: string[] = [];
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|tsx|css)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p); } };
  walk(path.join(repo, "src"));
  // Phase 21D-A.1: the physicsMotion@1 core and lazy workspace are scanned by the same repository-owned-code rule.
  // Phase 21D-A.2: the physicsLab@1 workspace and the shared physics widgets are scanned too.
  const dynamicFiles = files.filter(f => /src\/smartsim\/dynamic\/|freeFallDynamics|net2Flow|src\/physicsMotion\/|src\/physicsLab\/|src\/physicsShared\/|src\/physics\//.test(f));
  it("the bundle guard refuses the dynamic signatures in initial files (budget line unchanged)", () => {
    const guard = read("scripts/check-bundle-budget.mjs");
    expect(guard).toMatch(/DYNAMIC_SIGNATURES/);
    for (const s of ["SIMULATION_CLOCK_V1", "xp-dyn-plot", "dyn-flow", "fnstudy-probe"]) expect(guard).toContain('"' + s + '"');
    expect(guard).toMatch(/INITIAL_JS_GZIP_BUDGET_KB = 125;/);
  });
  it("no application module outside the lazy plugin workspaces imports the dynamic runtime statically", () => {
    const allowed = /src\/(smartsim\/dynamic|physicsFreeFall|physicsMotion|physicsLab|physicsShared|functionStudy|networkTopology2)\/|src\/net2Flow\.ts$/;   // 21D-A.1 / A.2: lazy plugin workspaces + their shared widgets
    const offenders = files.filter(f => !allowed.test(f) && /from\s+"[^"]*smartsim\/dynamic\//.test(fs.readFileSync(f, "utf8")));
    expect(offenders.map(f => path.relative(repo, f))).toEqual([]);
  });
  it("dynamic code is repository-owned: no eval / Function / innerHTML / dangerouslySetInnerHTML / external URLs / foreignObject", () => {
    expect(dynamicFiles.length).toBeGreaterThanOrEqual(6);
    for (const f of dynamicFiles) {
      const src = fs.readFileSync(f, "utf8").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
      expect(src, f).not.toMatch(/\beval\s*\(|new Function|innerHTML|dangerouslySetInnerHTML|insertAdjacentHTML|foreignObject|https?:\/\/|url\((?!#)|import\(\s*[^"'\s]/);   // url(#id) = an internal clip-path reference
    }
  });
  it("dynamic styling uses the validated presentation variables (no second theming system) and has a print / reduced-motion policy", () => {
    const css = read("src/smartsim/dynamic/dynamic.css");
    expect(css).toMatch(/var\(--xp-primary/);
    expect(css).toMatch(/@media print/);
    expect(css).toMatch(/prefers-reduced-motion/);
    expect(css).not.toMatch(/url\(|@import/);
  });
});
