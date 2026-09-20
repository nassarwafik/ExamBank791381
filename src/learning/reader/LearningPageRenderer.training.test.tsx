// @vitest-environment happy-dom
// Learning Practice — the `library-training` card in the Reader: every visible state is decided by the injected
// HOST (never by the content): no host → generic label card; loading; error (+ retry); unavailable (printed label +
// availability note, NO title, disabled CTA); available (title, best result / "not yet", start vs redo CTA).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import LearningPageRenderer, { type ReaderPageHeader } from "./LearningPageRenderer";
import type { ContentPage } from "../content/types";
import type { LibraryTrainingHost, TrainingStatus } from "../training/types";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const page: ContentPage = {
  id: "syn-p1", title: "تدريبات", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 22 },
  blocks: [
    { id: "b-t1", type: "library-training", origin: "book", trainingId: "T01", label: "تدريب 1", requiredModuleId: "syn-m01" },
    { id: "b-t3", type: "library-training", origin: "book", trainingId: "T03", label: "تدريب 3", requiredModuleId: "syn-m07" },
  ],
};
const header: ReaderPageHeader = { courseId: "791381", pageTitle: page.title, moduleTitle: "م", lessonTitle: "د", position: { index: 1, total: 1 } };
const hostOf = (statuses: Record<string, TrainingStatus>, onOpen = vi.fn(), onRetry?: () => void): LibraryTrainingHost =>
  ({ status: id => statuses[id] ?? { kind: "unavailable" }, onOpen, onRetry });
const draw = (host?: LibraryTrainingHost) => render(<LearningPageRenderer header={header} body={{ kind: "ready", page }} training={host} />);
const card = (label: string) => screen.getByRole("region", { name: label });

describe("library-training card — host-decided states", () => {
  it("no host → the printed label and a generic note; no CTA, no title, zero requests", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    draw();
    const c = card("تدريب 1");
    expect(within(c).getByText("يُحلّ هذا التدريب تفاعليًا من داخل المنصة.")).toBeTruthy();
    expect(within(c).queryByRole("button")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("loading → a status line; error → a note with a retry that calls the host", () => {
    const onRetry = vi.fn();
    draw(hostOf({ T01: { kind: "loading" }, T03: { kind: "error" } }, vi.fn(), onRetry));
    expect(within(card("تدريب 1")).getByRole("status").textContent).toContain("جارٍ التحقق من إتاحة التدريب");
    const c3 = card("تدريب 3");
    expect(within(c3).getByText(/تعذّر التحقق من إتاحة التدريب/)).toBeTruthy();
    within(c3).getByRole("button", { name: "إعادة المحاولة" }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
  it("unavailable → the exact availability note, a DISABLED start button and NO title text anywhere", () => {
    draw(hostOf({ T01: { kind: "available", title: "أساسيات الشبكات", best: null }, T03: { kind: "unavailable" } }));
    const c3 = card("تدريب 3");
    expect(within(c3).getByText("سيصبح متاحًا عند نشر الجزء المرتبط به.")).toBeTruthy();
    const btn = within(c3).getByRole("button", { name: "ابدأ التدريب" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(c3.textContent).not.toContain("IPv4");
    expect(c3.querySelector(".learning-reader-training-title")).toBeNull();
    expect(c3.classList.contains("is-pending")).toBe(true);
  });
  it("available without a result → title + «لم تحلّ» + «ابدأ التدريب» that opens the training by id", () => {
    const onOpen = vi.fn();
    draw(hostOf({ T01: { kind: "available", title: "أساسيات الشبكات", best: null } }, onOpen));
    const c1 = card("تدريب 1");
    expect(within(c1).getByText("أساسيات الشبكات")).toBeTruthy();
    expect(within(c1).getByText("لم تحلّ هذا التدريب بعد.")).toBeTruthy();
    const btn = within(c1).getByRole("button", { name: "ابدأ التدريب" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    btn.click();
    expect(onOpen).toHaveBeenCalledWith("T01");
    expect(c1.classList.contains("is-available")).toBe(true);
  });
  it("available with a best result → «أفضل نتيجة: 80% · نقاط التقوية: 20 / 25» and the CTA reads «أعد التدريب»", () => {
    draw(hostOf({ T01: { kind: "available", title: "أساسيات الشبكات", best: { bestPercentage: 80, bestPoints: 20, maxPoints: 25, attempts: 2, lastCompletedAt: "2026-09-01T00:00:00.000Z" } } }));
    const c1 = card("تدريب 1");
    expect(within(c1).getByText(/أفضل نتيجة:/).textContent).toBe("أفضل نتيجة: 80% · نقاط التقوية: 20 / 25");
    expect(within(c1).getByRole("button", { name: "أعد التدريب" })).toBeTruthy();
    expect(within(c1).queryByText("لم تحلّ هذا التدريب بعد.")).toBeNull();
  });
  it("a best result advertised with maxPoints 0 (an F-series final exam for training) shows the percentage only — no «نقاط التقوية» fragment", () => {
    draw(hostOf({ T01: { kind: "available", title: "نموذج A — 2025", best: { bestPercentage: 94, bestPoints: 0, maxPoints: 0, attempts: 2, lastCompletedAt: "2026-09-20T00:00:00.000Z" } } }));
    const c1 = screen.getByRole("region", { name: "تدريب 1" });
    expect(within(c1).getByText(/أفضل نتيجة:/).textContent).toBe("أفضل نتيجة: 94%");
    expect(c1.textContent).not.toContain("نقاط التقوية");
    expect(within(c1).getByRole("button", { name: "أعد التدريب" })).toBeTruthy();
  });
  it("a REAL 0% attempt is a result (attempts 1): «أفضل نتيجة: 0% · نقاط التقوية: 0 / 25» + «أعد التدريب» — never confused with «لم تحلّ»", () => {
    draw(hostOf({ T01: { kind: "available", title: "أساسيات الشبكات", best: { bestPercentage: 0, bestPoints: 0, maxPoints: 25, attempts: 1, lastCompletedAt: "2026-09-19T00:00:00.000Z" } } }));
    const c1 = card("تدريب 1");
    expect(within(c1).getByText(/أفضل نتيجة:/).textContent).toBe("أفضل نتيجة: 0% · نقاط التقوية: 0 / 25");
    expect(within(c1).getByRole("button", { name: "أعد التدريب" })).toBeTruthy();
    expect(within(c1).queryByText("لم تحلّ هذا التدريب بعد.")).toBeNull();
  });
  it("no `best` (never attempted) → «لم تحلّ هذا التدريب بعد.» + «ابدأ التدريب», and no «أفضل نتيجة» line", () => {
    draw(hostOf({ T01: { kind: "available", title: "أساسيات الشبكات", best: null } }));
    const c1 = card("تدريب 1");
    expect(within(c1).getByText("لم تحلّ هذا التدريب بعد.")).toBeTruthy();
    expect(within(c1).getByRole("button", { name: "ابدأ التدريب" })).toBeTruthy();
    expect(within(c1).queryByText(/أفضل نتيجة:/)).toBeNull();
  });
  it("every card shows the canonical library code (T01 / T03) as an LTR badge next to the printed label, in every host state", () => {
    draw(hostOf({ T01: { kind: "available", title: "أساسيات الشبكات", best: null }, T03: { kind: "unavailable" } }));
    const c1 = card("تدريب 1"), c3 = card("تدريب 3");
    const code1 = c1.querySelector(".learning-reader-training-code")!, code3 = c3.querySelector(".learning-reader-training-code")!;
    expect([code1.textContent, code1.getAttribute("dir"), code3.textContent, code3.getAttribute("dir")]).toEqual(["T01", "ltr", "T03", "ltr"]);
    cleanup();
    draw();
    expect(card("تدريب 1").querySelector(".learning-reader-training-code")!.textContent).toBe("T01");   // no host → still the safe code
  });
  it("the card never emits answer-key vocabulary or training titles the host did not disclose", () => {
    const { container } = draw(hostOf({ T01: { kind: "unavailable" }, T03: { kind: "unavailable" } }));
    const html = container.innerHTML;
    for (const banned of ["correct", "hint", "أساسيات الشبكات", "IPv4"]) expect(html, banned).not.toContain(banned);
  });
});
