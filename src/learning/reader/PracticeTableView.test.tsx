// @vitest-environment happy-dom
// The generic interactive worksheet renderer over a SYNTHETIC block (no book vocabulary): same table skeleton as a
// static table (wrapper / thead / per-column direction), a neutral placeholder per choice cell, an immediate verdict
// that is icon + word (never colour-only) announced as a status and described from the select, in-place retry, a
// reset, accessible labels from the row's first plain cell, and NO persistence or network.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import LearningPageRenderer, { type ReaderPageHeader } from "./LearningPageRenderer";
import type { ContentPage } from "../content/types";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const page: ContentPage = {
  id: "syn-p1", title: "ورقة عمل", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 1 },
  blocks: [{
    id: "syn-pt", type: "practice-table", origin: "book", caption: "صنّف",
    headers: ["الرمز", "التصنيف", "ملاحظة"], columnDirs: ["ltr", "rtl", "rtl"],
    rows: [
      ["AB-1", { kind: "select", options: ["أحمر", "أزرق", "أخضر"], key: "أزرق" }, ""],
      ["", { kind: "select", options: ["أحمر", "أزرق"], key: "أحمر" }, "بلا رمز"],
    ],
  }],
};
const header: ReaderPageHeader = { courseId: "791381", pageTitle: page.title, moduleTitle: "م", lessonTitle: "د", position: { index: 1, total: 1 } };
const draw = () => render(<LearningPageRenderer header={header} body={{ kind: "ready", page }} />);
const selects = (root: HTMLElement) => [...root.querySelectorAll("tbody select")] as HTMLSelectElement[];
const statusIn = (s: HTMLSelectElement) => within(s.closest("td") as HTMLElement).queryByRole("status");

describe("PracticeTableView", () => {
  it("renders the shared table skeleton with per-column direction, a caption, and a neutral choice per answerable cell", () => {
    const { container } = draw();
    const table = container.querySelector(".learning-reader-tablewrap > table.learning-reader-table") as HTMLTableElement;
    expect(table).toBeTruthy();
    expect(table.querySelector("caption")?.textContent).toBe("صنّف");
    expect([...table.querySelectorAll("thead th")].map(th => th.textContent)).toEqual(["الرمز", "التصنيف", "ملاحظة"]);
    const firstRow = [...table.querySelectorAll("tbody tr")[0].querySelectorAll("td")];
    expect(firstRow[0].getAttribute("dir")).toBe("ltr");
    expect(firstRow[0].textContent).toBe("AB-1");
    expect(firstRow[1].getAttribute("dir")).toBe("rtl");
    expect(firstRow[2].textContent).toBe("");
    const s = selects(container);
    expect(s.length).toBe(2);
    expect([...s[0].options].map(o => o.textContent)).toEqual(["اختر...", "أحمر", "أزرق", "أخضر"]);
    expect(s[0].value).toBe("");
    expect(s[0].getAttribute("aria-label")).toBe("AB-1 — التصنيف");
    expect(s[1].getAttribute("aria-label")).toBe("بلا رمز — التصنيف");         // falls back to the first non-empty plain cell
    expect(container.querySelector("[role=status]")).toBeNull();
    expect(screen.queryByRole("button", { name: "امسح الإجابات" })).toBeNull();  // nothing to clear yet
    expect(screen.getByText(/تمرين ذاتي:/)).toBeTruthy();
  });

  it("verdicts are immediate, icon + word, announced, described from the select, and retryable in place", () => {
    const { container } = draw();
    const [s0] = selects(container);
    fireEvent.change(s0, { target: { value: "أحمر" } });
    const wrong = statusIn(s0)!;
    expect(wrong.textContent).toBe("✕ غير صحيح — حاول مرة أخرى");
    expect(wrong.querySelector("svg")).toBeTruthy();
    expect(wrong.classList.contains("is-wrong")).toBe(true);
    expect(s0.getAttribute("aria-describedby")).toBe(wrong.id);
    expect(s0.className).toContain("is-wrong");
    expect(s0.disabled).toBe(false);
    fireEvent.change(s0, { target: { value: "أزرق" } });
    const right = statusIn(s0)!;
    expect(right.textContent).toBe("✓ صحيح");
    expect(right.classList.contains("is-right")).toBe(true);
    expect(s0.className).toContain("is-right");
    fireEvent.change(s0, { target: { value: "" } });                              // back to the placeholder → no verdict
    expect(statusIn(s0)).toBeNull();
    expect(s0.hasAttribute("aria-describedby")).toBe(false);
  });

  it("each cell is independent; reset clears every choice and verdict", () => {
    const { container } = draw();
    const [s0, s1] = selects(container);
    fireEvent.change(s0, { target: { value: "أزرق" } });
    fireEvent.change(s1, { target: { value: "أزرق" } });
    expect(statusIn(s0)!.textContent).toBe("✓ صحيح");
    expect(statusIn(s1)!.textContent).toBe("✕ غير صحيح — حاول مرة أخرى");
    fireEvent.click(screen.getByRole("button", { name: "امسح الإجابات" }));
    expect(s0.value).toBe(""); expect(s1.value).toBe("");
    expect(container.querySelector("[role=status]")).toBeNull();
  });

  it("the expected choice never reaches the DOM as an attribute; nothing is stored or sent", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { container } = draw();
    expect(container.innerHTML).not.toMatch(/key=|data-key|data-answer|data-expected|correct/);
    fireEvent.change(selects(container)[0], { target: { value: "أزرق" } });
    expect(container.innerHTML).not.toMatch(/key=|data-key|data-answer|data-expected|correct/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
});
