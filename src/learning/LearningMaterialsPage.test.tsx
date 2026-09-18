// @vitest-environment happy-dom
// Learning Materials (المواد التعليمية) — Phase 1. Behavioural coverage of the library ⇄ course-overview local
// state, the first course card and its metadata, the six high-level content batches, and the request discipline
// (Phase 1 is fully local — zero network requests during catalog / overview navigation).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import LearningMaterialsPage from "./LearningMaterialsPage";
import { LEARNING_COURSES } from "./catalog";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const course = LEARNING_COURSES[0];

describe("Learning Materials — Phase 1 library", () => {
  it("renders the library with the first course (791381) card and its metadata, from the catalog", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<LearningMaterialsPage />);
    // page heading + supporting text (shell owns the h1; the page starts at h2)
    expect(screen.getByRole("heading", { level: 2, name: "المواد التعليمية" })).toBeTruthy();
    expect(screen.getByText(/كتب ومواد تعليمية تفاعلية/)).toBeTruthy();
    // the real course card, driven by catalog metadata (no hardcoded course-specific JSX)
    const card = screen.getByRole("article", { name: course.title });
    expect(within(card).getByText("كتاب " + course.id)).toBeTruthy();          // "كتاب 791381"
    expect(within(card).getByRole("heading", { level: 3, name: course.title })).toBeTruthy();
    expect(within(card).getByText(course.subject)).toBeTruthy();
    expect(within(card).getByText(course.grades)).toBeTruthy();
    expect(within(card).getByText(course.author)).toBeTruthy();
    expect(within(card).getByText(course.year)).toBeTruthy();
    expect(within(card).getByRole("button", { name: "فتح الكتاب" })).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();                                    // no network on entry
  });

  it("opening the book shows a Phase-1 course overview with identity + six batches marked قريبًا; back restores the library — all with zero requests", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<LearningMaterialsPage />);
    fireEvent.click(screen.getByRole("button", { name: "فتح الكتاب" }));
    // overview identity
    expect(screen.getByRole("heading", { level: 2, name: course.productTitle })).toBeTruthy();  // "كتاب 791381 — شبكات الاتصال"
    expect(screen.queryByRole("button", { name: "فتح الكتاب" })).toBeNull();     // not the library anymore
    // six high-level content batches, each a non-interactive "قريبًا" (never a reader/lesson in Phase 1)
    const batchList = screen.getByRole("list", { name: "أقسام محتوى الكتاب" });
    const items = within(batchList).getAllByRole("listitem");
    expect(items.map(li => li.textContent)).toEqual(course.overviewBatches.map((b, i) => (i + 1) + b.label + "قريبًا"));
    expect(items.length).toBe(6);
    expect(within(batchList).getAllByText("قريبًا").length).toBe(6);
    // back to the library
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى المواد التعليمية" }));
    expect(screen.getByRole("heading", { level: 2, name: "المواد التعليمية" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "فتح الكتاب" })).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();                                    // fully local across open + back
  });

  it("the open-book CTA is a real <button> (keyboard-accessible), not a clickable div", () => {
    render(<LearningMaterialsPage />);
    const cta = screen.getByRole("button", { name: "فتح الكتاب" });
    expect(cta.tagName).toBe("BUTTON");
    expect(cta.getAttribute("type")).toBe("button");
  });
});

describe("Learning Materials — Phase 1 catalog", () => {
  it("exposes exactly the owner-provided 791381 identity and six overview batches", () => {
    expect(course).toMatchObject({
      id: "791381",
      title: "شبكات الاتصال",
      productTitle: "كتاب 791381 — شبكات الاتصال",
      subject: "أنظمة محوسبة",
      grades: "الصف العاشر / الحادي عشر",
      author: "الأستاذ وفيق نصار",
      year: "2026–2027",
      status: "available",
    });
    expect(course.overviewBatches.map(b => b.label)).toEqual([
      "الأساسيات · الأعداد · IP",
      "الأجهزة والرسائل",
      "النماذج والبروتوكولات والأمان",
      "برمجة السويتش و VLAN",
      "الأمان · Wi-Fi · IPv6 · DHCP",
      "ACL · التوجيه · WAN",
    ]);
  });
});
