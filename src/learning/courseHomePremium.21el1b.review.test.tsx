// @vitest-environment happy-dom
// Phase 21E L1-B review fix — the course-home section details as a teacher and a screen reader meet them.
//   • The lesson count agrees with its number in Arabic: 12/14/15/18 take the singular accusative («12 درسًا»), 3–10 the
//     plural («9 دروس») — the earlier «12 دروس» was ungrammatical on four of the seven populated sections.
//   • Each section button keeps its short accessible name («فتح قسم …») and is DESCRIBED by its details, so a screen
//     reader hears the lesson count and reading-page range the screen shows (an aria-label alone hid them).
//   • The empty introductory section shows no details and no description (never a fabricated 0–0 range); since L.0 it is a
//     static «قريبًا» row, not a button.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import LearningMaterialsPage from "./LearningMaterialsPage";

vi.mock("./training/LearningReaderWithTraining", () => ({ default: () => <div data-testid="reader" /> }));

afterEach(() => { cleanup(); });

const EXPECTED: [string, string | null][] = [
  ["المقدمة", null],
  ["الأساسيات · الأعداد · IP", "12 درسًا · الصفحات 1–40"],
  ["الأجهزة والرسائل", "15 درسًا · الصفحات 41–68"],
  ["النماذج والبروتوكولات والأمان", "18 درسًا · الصفحات 69–110"],
  ["برمجة السويتش و VLAN", "9 دروس · الصفحات 111–145"],
  ["الأمان · Wi-Fi · IPv6 · DHCP", "14 درسًا · الصفحات 146–186"],
  ["ACL · التوجيه · WAN", "7 دروس · الصفحات 187–215"],
  ["التلخيص", "8 دروس · الصفحات 216–248"],
];

describe("21E L1-B review — section details", () => {
  it("shows grammatical lesson counts and exposes each section's details as the button's description", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<LearningMaterialsPage />);
    fireEvent.click(screen.getByRole("button", { name: "فتح الكتاب" }));
    await waitFor(() => expect(document.querySelectorAll(".eb-lm-batch-details")).toHaveLength(7));
    for (const [label, details] of EXPECTED) {
      if (details === null) {
        const row = screen.getByText(label).closest("li")!;
        expect(row.querySelector("button")).toBeNull();
        expect(row.querySelector(".eb-lm-batch-details")).toBeNull();
        continue;
      }
      const button = screen.getByRole("button", { name: "فتح قسم " + label });
      const shown = button.querySelector(".eb-lm-batch-details")?.textContent ?? null;
      expect(shown).toBe(details);
      const describedBy = button.getAttribute("aria-describedby");
      const description = describedBy ? describedBy.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? "").join(" ") : null;
      expect(description).toBe(details);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
