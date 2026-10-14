// @vitest-environment happy-dom
// Phase 21E L1-A review fix — the library count pill and the Arabic count phrase it renders.
//   • The pill's accessible text is its visible text: the earlier `aria-label` (prohibited on a paragraph by ARIA 1.2)
//     announced «1 كتب متاحة» while the screen showed «1 كتاب متاح».
//   • The count phrase agrees with the number in Arabic (1 singular · 2 dual · 3–10 plural · 11–99 singular accusative).
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import LearningMaterialsPage from "./LearningMaterialsPage";
import { LEARNING_COURSES } from "./catalog";
import { arabicCount, AVAILABLE_BOOKS } from "./arabicCount";

afterEach(() => { cleanup(); });

describe("21E L1-A review — library count pill", () => {
  it("announces exactly what it shows (no overriding aria-label) and agrees with the catalog count", () => {
    const { container } = render(<LearningMaterialsPage />);
    const pill = container.querySelector(".eb-lm-library-count")!;
    expect(pill.hasAttribute("aria-label")).toBe(false);
    const available = LEARNING_COURSES.filter(c => c.status === "available").length;
    expect(pill.textContent).toBe(arabicCount(available, AVAILABLE_BOOKS));
  });

  it("uses the Arabic number-agreement form for every count category", () => {
    expect(arabicCount(0, AVAILABLE_BOOKS)).toBe("لا توجد كتب متاحة");
    expect(arabicCount(1, AVAILABLE_BOOKS)).toBe("كتاب واحد متاح");
    expect(arabicCount(2, AVAILABLE_BOOKS)).toBe("كتابان متاحان");
    expect(arabicCount(3, AVAILABLE_BOOKS)).toBe("3 كتب متاحة");
    expect(arabicCount(10, AVAILABLE_BOOKS)).toBe("10 كتب متاحة");
    expect(arabicCount(11, AVAILABLE_BOOKS)).toBe("11 كتابًا متاحًا");
    expect(arabicCount(99, AVAILABLE_BOOKS)).toBe("99 كتابًا متاحًا");
    expect(arabicCount(100, AVAILABLE_BOOKS)).toBe("100 كتاب متاح");
  });
});
