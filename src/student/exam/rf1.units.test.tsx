// @vitest-environment happy-dom
// Phase 21E.3 review fix 1 — component / module regression tests for the confirmed defects of the independent review of 92f4326.
// Each case failed on 92f4326 (fail-first, docs/enterprise-ux-premium-21e3.md §12) unless it is marked PIN:
//   RF1-U1  a retry that fails later never steals focus from where the student moved (keystrokes are kept)     [#10 #19 #63]
//   RF1-U2  after a successful retry focus follows the recovered part, also outside the exam                    [#81 #47]
//   RF1-U3  an exam-level card recovers focus onto its heading once that heading exists again                   [#24]
//   RF1-U4  outside the exam the card speaks neutrally and offers a reload after a failed retry                 [#46]
//   RF1-U5  repeated activation of «إعادة المحاولة» while loading starts one retry only                          [B3 b1/b2] PIN
//   RF1-U6  grade isolation never splits dates, addresses or teacher text                                       [#32 #45]
//   RF1-U7  keyboard-guide marker, scoped coarse-pointer rules, CLI / cloze minimum widths, heading indicator   [#25 #34 #50 #26 #54]
//   RF1-U8  the label-diagram steps follow the real Tab order                                                  [#57]
//   RF1-U9  a card's retry depends only on ITS loaders, never on another question still failing                [design] new
//   RF1-U10 a stylesheet failure or a recovery refusal is logged with the code chunk-load (code only)            [#84]
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup, waitFor } from "@testing-library/react";
import { Suspense, useRef, type ComponentType } from "react";
import fs from "node:fs";
import path from "node:path";
import QuestionErrorBoundary from "./QuestionErrorBoundary";
import { QuestionRecoveryContext } from "./questionRecovery";
import { recoverableLazy } from "../../recoverableLazy";
import { isolateLtr, GRADE_LTR } from "../../ui/ltrIsland";
import LabelDiagramView from "../../visual/LabelDiagramView";

const repo = path.join(__dirname, "..", "..", "..");
const css = (f: string) => fs.readFileSync(path.join(repo, f), "utf8");
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const origin = window.location.origin;
const chunkError = (name: string) => new TypeError("Failed to fetch dynamically imported module: " + origin + "/assets/" + name + "-abcd1234.js");
const sleep = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

describe("RF1-U1 — a retry that fails later never steals focus", () => {
  it("the student moves to another field and types while the retry is loading: focus and keystrokes stay there", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));   // the remap's source read: no real network in a unit test
    let calls = 0;
    const Part = recoverableLazy<object>("UnitSlowPart", () => (++calls === 1 ? Promise.reject(chunkError("UnitSlowPart")) : new Promise((_, reject) => setTimeout(() => reject(chunkError("UnitSlowPart")), 300))) as Promise<{ default: ComponentType<object> }>);
    render(<div><QuestionErrorBoundary variant="part" resetKey="p1"><Suspense fallback={<i>…</i>}><Part /></Suspense></QuestionErrorBoundary><input aria-label="البند الآخر" /></div>);
    await screen.findByTestId("question-recovery");
    const retry = screen.getByRole("button", { name: "إعادة المحاولة" });
    retry.focus();
    fireEvent.click(retry);
    const other = screen.getByRole("textbox", { name: "البند الآخر" }) as HTMLInputElement;
    other.focus();
    fireEvent.change(other, { target: { value: "إجابة" } });
    await sleep(450);                                                              // the retry failed meanwhile
    expect(screen.getByTestId("question-recovery").textContent).toContain("ما زال التحميل متعذّرًا");
    expect(document.activeElement).toBe(other);
    expect(other.value).toBe("إجابة");
  });
});

describe("RF1-U2 — after a successful retry focus follows the recovered part", () => {
  it("outside the exam (no provider): focus lands on the recovered part's first control, not <body>", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    const Part = recoverableLazy<object>("UnitPartTwo", () => (++calls === 1 ? Promise.reject(chunkError("UnitPartTwo")) : Promise.resolve({ default: () => <label>البند 2 <input aria-label="إجابة البند 2" /></label> })) as Promise<{ default: ComponentType<object> }>);
    render(<div><p><input aria-label="إجابة البند 1" /></p><QuestionErrorBoundary variant="part" resetKey="p2"><Suspense fallback={<p className="iex-loading">…</p>}><Part /></Suspense></QuestionErrorBoundary></div>);
    await screen.findByTestId("question-recovery");
    const retry = screen.getByRole("button", { name: "إعادة المحاولة" });
    retry.focus(); fireEvent.click(retry);
    const input = await screen.findByRole("textbox", { name: "إجابة البند 2" });
    await waitFor(() => expect(document.activeElement).toBe(input));
  });
});

describe("RF1-U3 — an exam-level card recovers focus onto its heading after the re-render", () => {
  it("the anchor exists only once the surface rendered again; focus is placed then (not lost to <body>)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    const Surface = recoverableLazy<object>("UnitSurface", () => (++calls === 1 ? Promise.reject(chunkError("UnitSurface")) : Promise.resolve({ default: () => <p>سطح الامتحان</p> })) as Promise<{ default: ComponentType<object> }>);
    function Exam() {
      const heading = useRef<HTMLHeadingElement | null>(null);
      return (
        <QuestionRecoveryContext.Provider value={{ scope: "exam", reloadAllowed: false, strict: false, focusAnchor: () => heading.current?.focus({ preventScroll: true }) }}>
          <QuestionErrorBoundary variant="exam"><h2 tabIndex={-1} ref={heading}>السؤال 1 من 3</h2><Suspense fallback={null}><Surface /></Suspense></QuestionErrorBoundary>
        </QuestionRecoveryContext.Provider>
      );
    }
    render(<Exam />);
    await screen.findByTestId("question-recovery");
    const retry = screen.getByRole("button", { name: "إعادة المحاولة" });
    retry.focus(); fireEvent.click(retry);
    await screen.findByText("سطح الامتحان");
    await waitFor(() => expect(document.activeElement?.textContent).toBe("السؤال 1 من 3"));
  });
});

describe("RF1-U4 — outside the exam the wording is neutral; a reload is offered after a failed retry", () => {
  it("no student-exam wording, and «إعادة تحميل الصفحة» only after a failed retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Boom = () => { throw new Error("x"); };
    render(<QuestionErrorBoundary resetKey="t1"><Boom /></QuestionErrorBoundary>);
    const card = screen.getByTestId("question-recovery");
    expect(card.textContent).toContain("تعذّر عرض هذا الجزء الآن");
    expect(card.textContent).not.toMatch(/إجاباتك|الأسئلة الأخرى|الامتحان/);
    expect(screen.queryByRole("button", { name: "إعادة تحميل الصفحة" })).toBeNull();
    const retry = screen.getByRole("button", { name: "إعادة المحاولة" });
    retry.focus(); fireEvent.click(retry);
    expect(await screen.findByRole("button", { name: "إعادة تحميل الصفحة" })).toBeTruthy();
    expect(screen.getByTestId("question-recovery").textContent).not.toMatch(/إجاباتك|الامتحان/);
  });
});

describe("RF1-U5 — repeated activation while loading starts one retry (PIN)", () => {
  it("three quick activations → one new load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    const Part = recoverableLazy<object>("UnitRepeat", () => (++calls === 1 ? Promise.reject(chunkError("UnitRepeat")) : new Promise(r => setTimeout(() => r({ default: () => <p>تم</p> }), 100))) as Promise<{ default: ComponentType<object> }>);
    render(<QuestionErrorBoundary variant="part" resetKey="r1"><Suspense fallback={<i>…</i>}><Part /></Suspense></QuestionErrorBoundary>);
    await screen.findByTestId("question-recovery");
    const retry = screen.getByRole("button", { name: "إعادة المحاولة" });
    fireEvent.click(retry); fireEvent.click(retry); fireEvent.click(retry);
    expect(await screen.findByText("تم")).toBeTruthy();
    expect(calls).toBe(2);
  });
});

describe("RF1-U6 — grade isolation never splits other numeric text", () => {
  it.each([
    ["الاختبار القادم يوم 12/10/2026", []],
    ["عنوان الشبكة 192.168.1.0/24 ثم 10.0.0.0/8", []],
    ["تم تحديث علامتك في امتحان «الوحدة 3/4»، وأصبحت علامتك 8.5/10.", ["3/4", "8.5/10"]],
  ])("%s", (text, matches) => {
    expect([...text.matchAll(GRADE_LTR)].map(m => m[0])).toEqual(matches);
  });
  it("only the last standalone fraction of a grade sentence is an island; the text is unchanged", () => {
    const text = "تم تحديث علامتك في امتحان «الوحدة 3/4»، وأصبحت علامتك 8.5/10.";
    const { container } = render(<p>{isolateLtr(text, GRADE_LTR, { lastOnly: true })}</p>);
    expect(container.textContent).toBe(text);
    expect([...container.querySelectorAll("bdi")].map(b => b.textContent)).toEqual(["8.5/10"]);
    expect(isolateLtr("الاختبار القادم يوم 12/10/2026", GRADE_LTR)).toBe("الاختبار القادم يوم 12/10/2026");
  });
});

describe("RF1-U7 — CSS: disclosure marker, scoped touch rules, kept minimum widths, heading indicator", () => {
  it("the keyboard-guide summary keeps its disclosure marker and still reaches 44px", () => {
    const visual = css("src/visual/visual.css");
    const rule = /\.vq-keyboard-guide > summary \{([^}]*)\}/.exec(visual)?.[1] || "";
    expect(rule).not.toMatch(/display:\s*(inline-)?flex/);
    expect(rule).toMatch(/display:\s*list-item/);
    expect(rule).toMatch(/min-height:\s*44px/);
  });
  it("coarse-pointer enlargements of visual / cloze controls are scoped to the student exam (teacher editors unchanged)", () => {
    const coarse = (f: string) => [...css(f).matchAll(/@media\s*\(pointer:\s*coarse\)\s*\{([\s\S]*?)\}\s*\}/g)].map(m => m[1]).join("\n");
    for (const f of ["src/visual/visual.css", "src/inlineCloze/inlineCloze.css"]) {
      const block = coarse(f);
      for (const sel of block.split("}").map(r => r.split("{")[0].trim()).filter(Boolean)) expect(sel, f).toMatch(/^\.interactive-exam-page /);
    }
  });
  it("coarse-pointer rules never lower an existing minimum width (CLI 90px, cloze 6ch)", () => {
    const exam = css("src/studentexam-pro.css");
    expect(/@media \(pointer: coarse\)\{\s*\.iex-cli-input\{([^}]*)\}/.exec(exam)?.[1]).not.toMatch(/min-width/);
    expect(css("src/inlineCloze/inlineCloze.css")).toMatch(/\.cloze-input \{ min-height: 44px; min-width: max\(6ch, 44px\); \}/);
  });
  it("the pointer-focus indicator of the headings is not drawn over the first glyph (no inset bar)", () => {
    const exam = css("src/studentexam-pro.css");
    expect(exam).not.toMatch(/box-shadow:inset -?3px 0 0 var\(--eb-primary\)/);
  });
});

describe("RF1-U8 — the label-diagram keyboard steps follow the real Tab order", () => {
  it("the zones come before the label bank, and the steps say so (Shift+Tab back to the zone)", () => {
    const q = { labelDiagram: { v: 1, alt: "مخطط", allowReuse: false, zones: [{ id: "z1", shape: { kind: "rect", x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }], labels: [{ id: "l1", text: "موجه" }] }, image: { exists: true, visible: true, assets: [{ dataUrl: "data:image/png;base64,iVBORw0KGgo=", origin: "uploaded", contentType: "image/png" }] } };
    render(<LabelDiagramView q={q as never} id="ld1" answer={undefined} onAnswer={() => {}} labelPrefix="السؤال 1" textId="t1" />);
    const zone = screen.getByTestId("label-zone"), chip = screen.getByRole("button", { name: /موجه/ });
    expect(zone.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const keys = document.getElementById((zone.getAttribute("aria-describedby") || "").split(" ")[1]) as HTMLElement;
    expect(keys.textContent).toContain("Shift+Tab");
    expect(keys.closest("details")).toBeNull();
  });
});

describe("RF1-U9 — a card's retry depends only on its own loaders", () => {
  it("another question's loader is still down: this card's retry still recovers this part", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let mine = 0;
    const Down = recoverableLazy<object>("UnitStillDown", () => Promise.reject(chunkError("UnitStillDown")) as Promise<{ default: ComponentType<object> }>);
    const Mine = recoverableLazy<object>("UnitMine", () => (++mine === 1 ? Promise.reject(chunkError("UnitMine")) : Promise.resolve({ default: () => <p>بندي</p> })) as Promise<{ default: ComponentType<object> }>);
    render(<div>
      <QuestionErrorBoundary variant="part" resetKey="down"><Suspense fallback={null}><Down /></Suspense></QuestionErrorBoundary>
      <QuestionErrorBoundary variant="part" resetKey="mine"><Suspense fallback={null}><Mine /></Suspense></QuestionErrorBoundary>
    </div>);
    await waitFor(() => expect(screen.getAllByTestId("question-recovery")).toHaveLength(2));
    const retries = screen.getAllByRole("button", { name: "إعادة المحاولة" });
    retries[1].focus(); fireEvent.click(retries[1]);
    expect(await screen.findByText("بندي")).toBeTruthy();
    expect(screen.getAllByTestId("question-recovery")).toHaveLength(1);        // the other card is untouched
  });
});

describe("RF1-U10 — load failures of every kind are logged as chunk-load, with the code only", () => {
  it("«Unable to preload CSS» and a recovery refusal are chunk-load; any other error is runtime", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const Boom = ({ m }: { m: string }): null => { throw new Error(m); };
    const codes = (m: string) => {
      log.mockClear();
      render(<QuestionErrorBoundary variant="part" resetKey={m}><Boom m={m} /></QuestionErrorBoundary>);
      cleanup();
      return log.mock.calls.filter(c => c[0] === "[QuestionErrorBoundary]").map(c => c[1]);
    };
    expect(codes("Unable to preload CSS for " + origin + "/assets/VisualCanvas-abcd1234.css")).toEqual([{ code: "chunk-load" }]);
    expect(codes("recovery-css")).toEqual([{ code: "chunk-load" }]);
    expect(codes("internal detail")).toEqual([{ code: "runtime" }]);
  });
});
