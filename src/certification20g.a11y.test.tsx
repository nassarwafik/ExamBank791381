// @vitest-environment happy-dom
// Phase 20G — AUTOMATED accessibility / RTL certification (§16) of the student-facing rendering of the five certification exams and of the
// stress kitchen-sink composite / compound, through the teacher's student PREVIEW (the same student renderers, answers stripped). After every lazy
// renderer has loaded, the DOM must satisfy machine-checkable rules: RTL document direction, every interactive control has an accessible name
// (aria-label, a resolvable aria-labelledby, an associated / wrapping <label>, a title, or button text), dialogs are modal and labelled, images
// carry alt text, no positive tabindex, code is laid out LTR. Visual / screen-reader judgement stays a bounded MANUAL checklist (design record).
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, act, fireEvent } from "@testing-library/react";
import ExamPreview from "./ExamPreview";
import { examA } from "../api/tests/certification-20g/exams/A-network.js";
import { examB } from "../api/tests/certification-20g/exams/B-physics.js";
import { examC } from "../api/tests/certification-20g/exams/C-computer-science.js";
import { examD } from "../api/tests/certification-20g/exams/D-mathematics.js";
import { examE } from "../api/tests/certification-20g/exams/E-showcase.js";
import { stressExam } from "../api/tests/certification-20g/exams/S-stress.js";

afterEach(cleanup);
type Exam = Parameters<typeof ExamPreview>[0]["exam"];
const EXAMS: Record<string, () => unknown> = { A: examA, B: examB, C: examC, D: examD, E: examE, S: () => stressExam({ sections: 1, perSection: 27 }).exam };

function accessibleName(el: Element): string {
  const aria = el.getAttribute("aria-label");
  if (aria && aria.trim()) return aria.trim();
  const by = el.getAttribute("aria-labelledby");
  if (by) { const t = by.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim() || "").join(" ").trim(); if (t) return t; }
  const id = el.getAttribute("id");
  if (id) { const l = document.querySelector('label[for="' + CSS.escape(id) + '"]'); if (l?.textContent?.trim()) return l.textContent.trim(); }
  const wrap = el.closest("label");
  if (wrap?.textContent?.trim()) return wrap.textContent.trim();
  const title = el.getAttribute("title");
  if (title && title.trim()) return title.trim();
  if (el.tagName === "BUTTON" || el.getAttribute("role") === "button" || el.getAttribute("role") === "tab") return (el.textContent || "").trim();
  return "";
}
async function settle(container: HTMLElement) {
  for (let i = 0; i < 80; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 25)); });
    if (!container.querySelector(".iex-loading, [aria-busy='true'], .lazy-loading")) break;
  }
}

describe("20G automated accessibility — student preview of every certification exam", () => {
  for (const [name, mk] of Object.entries(EXAMS)) {
    it(name + ": RTL, every interactive control named, no positive tabindex, images with alt, code LTR", async () => {
      const { container } = render(<ExamPreview exam={mk() as Exam} onClose={() => {}} />);
      await settle(container);
      // the cover first (also checked), then the student body
      const start = container.querySelector(".iex-cover-start") as HTMLButtonElement | null;
      if (start) { expect(accessibleName(start), name + " cover start").toBeTruthy(); fireEvent.click(start); await settle(container); }
      const controls = [...container.querySelectorAll("input:not([type=hidden]), select, textarea, button, [role=button], [role=radio], [role=checkbox], [role=tab], [role=slider], [role=textbox]")];
      expect(controls.length, name).toBeGreaterThan(5);
      expect(container.querySelector(".iex-loading"), name + ": every lazy renderer loaded").toBeNull();
      if (process.env.A11Y_OUT) (await import("node:fs")).appendFileSync(process.env.A11Y_OUT, name + " controls=" + controls.length + " questions=" + container.querySelectorAll(".iex-q, [data-question-id], .sq-card").length + "\n");
      const unnamed = controls.filter(el => !accessibleName(el)).map(el => el.outerHTML.slice(0, 160));
      expect(unnamed, name).toEqual([]);
      expect([...container.querySelectorAll("[tabindex]")].filter(el => Number(el.getAttribute("tabindex")) > 0).map(el => el.outerHTML.slice(0, 120)), name).toEqual([]);
      expect([...container.querySelectorAll("img")].filter(img => !img.hasAttribute("alt")).map(el => el.outerHTML.slice(0, 120)), name).toEqual([]);
      for (const dlg of container.querySelectorAll("[role=dialog]")) { expect(dlg.getAttribute("aria-modal"), name).toBe("true"); expect(accessibleName(dlg) || dlg.getAttribute("aria-labelledby"), name).toBeTruthy(); }
      const rtlRoot = container.querySelector("[dir=rtl]") || document.documentElement.closest("[dir=rtl]");
      expect(rtlRoot, name + ": an RTL root").toBeTruthy();
      for (const code of container.querySelectorAll("pre")) expect(code.closest("[dir=ltr]") || code.getAttribute("dir") === "ltr" || getComputedStyle(code).direction === "ltr", name + " " + code.outerHTML.slice(0, 80)).toBeTruthy();
    }, 30000);
  }
});
