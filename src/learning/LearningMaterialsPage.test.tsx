// @vitest-environment happy-dom
// Learning Materials (المواد التعليمية). Behavioural coverage of the library ⇄ course-overview ⇄ reader local
// state, the first course card and its metadata, the eight high-level content sections — now a live index that opens
// the Reader at each section's first canonical page — and the request discipline (catalog/overview navigation is
// fully local; the Reader is code-split and issues no network request for content).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import LearningMaterialsPage from "./LearningMaterialsPage";
import { LEARNING_COURSES } from "./catalog";

// Stub the code-split Reader wrapper so the overview → reader wiring (which pageId is forwarded, and the exit path)
// is observable without mounting the whole reader/content layer. It surfaces the forwarded `initialPageId` and the
// `exitLabel`, and calls `onExit` from a button so "back to the overview" stays testable.
vi.mock("./training/LearningReaderWithTraining", () => ({
  default: (props: { courseId: string; initialPageId?: string; exitLabel: string; onExit: () => void }) => (
    <div data-testid="reader" data-course={props.courseId} data-initial={props.initialPageId ?? "«beginning»"}>
      <button type="button" onClick={props.onExit}>{props.exitLabel}</button>
    </div>
  ),
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const course = LEARNING_COURSES[0];
// The authoritative section → first-canonical-page mapping (proven in content/navigation.batches.test.ts). intro
// carries no dedicated page, so it opens the book's beginning via the Reader's controlled fallback (initial = «beginning»).
const EXPECTED_TARGETS: Record<string, string> = {
  intro: "«beginning»",
  b1: "791381-m01-l00-p01",
  b2: "791381-m09-l00-p01",
  b3: "791381-m13-l01-p01",
  b4: "791381-m03-l01-p03",
  b5: "791381-m20-l01-p01",
  b6: "791381-m25-l01-p01",
  summary: "791381-m28-l01-p01",
};
const openOverview = () => fireEvent.click(screen.getByRole("button", { name: "فتح الكتاب" }));

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

  it("opening the book shows a course overview whose eight sections are a live index (no قريبًا, no stale release note); back restores the library — all with zero requests", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<LearningMaterialsPage />);
    openOverview();
    // overview identity
    expect(screen.getByRole("heading", { level: 2, name: course.productTitle })).toBeTruthy();  // "كتاب 791381 — شبكات الاتصال"
    expect(screen.queryByRole("button", { name: "فتح الكتاب" })).toBeNull();     // not the library anymore
    // the completed book's sections carry NO "قريبًا" and NOT the stale gradual-release description
    const batchList = screen.getByRole("list", { name: "أقسام محتوى الكتاب" });
    expect(within(batchList).queryByText("قريبًا")).toBeNull();
    expect(screen.queryByText("ستُتاح هذه الأقسام تفاعليًا في القارئ تدريجيًا.")).toBeNull();
    expect(screen.getByText("اختر قسمًا للانتقال مباشرة إلى محتواه في القارئ التفاعلي.")).toBeTruthy();
    // exactly eight sections, each an interactive control with a meaningful accessible name "فتح قسم <label>"
    const controls = within(batchList).getAllByRole("button");
    expect(controls.length).toBe(8);
    expect(controls.map(b => b.getAttribute("aria-label"))).toEqual(course.overviewBatches.map(b => "فتح قسم " + b.label));
    // each row still shows its number, title and the "فتح القسم" affordance
    course.overviewBatches.forEach((b, i) => {
      const row = within(batchList).getByRole("button", { name: "فتح قسم " + b.label });
      expect(row.textContent).toContain(String(i + 1));
      expect(row.textContent).toContain(b.label);
      expect(row.textContent).toContain("فتح القسم");
    });
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

describe("Learning Materials — Course-Overview section navigation", () => {
  const batchList = () => screen.getByRole("list", { name: "أقسام محتوى الكتاب" });

  it("every section row is a real, keyboard-activatable <button type=button> (not a fake link or clickable div)", () => {
    render(<LearningMaterialsPage />);
    openOverview();
    const controls = within(batchList()).getAllByRole("button");
    expect(controls.length).toBe(8);
    for (const c of controls) {
      expect(c.tagName).toBe("BUTTON");
      expect(c.getAttribute("type")).toBe("button");
      expect(c.querySelector('a[href="#"]')).toBeNull();   // no fake anchor
    }
  });

  it("clicking each section opens the Reader at that section's first canonical page (intro → the book's beginning)", async () => {
    for (const b of course.overviewBatches) {
      render(<LearningMaterialsPage />);
      openOverview();
      fireEvent.click(within(batchList()).getByRole("button", { name: "فتح قسم " + b.label }));
      const reader = await screen.findByTestId("reader");
      expect(reader.getAttribute("data-course")).toBe("791381");
      expect(reader.getAttribute("data-initial")).toBe(EXPECTED_TARGETS[b.id]);
      cleanup();
    }
  });

  it("«بدء القراءة» opens the Reader from the canonical beginning — never a section shortcut", async () => {
    render(<LearningMaterialsPage />);
    openOverview();
    fireEvent.click(screen.getByRole("button", { name: "بدء القراءة" }));
    const reader = await screen.findByTestId("reader");
    expect(reader.getAttribute("data-initial")).toBe("«beginning»");   // no initialPageId forwarded
  });

  it("opening a section then «العودة إلى نظرة الكتاب» returns to the overview, and «بدء القراءة» then starts clean (no stale initial page)", async () => {
    render(<LearningMaterialsPage />);
    openOverview();
    // open a deep section (summary → m28)
    fireEvent.click(within(batchList()).getByRole("button", { name: "فتح قسم التلخيص" }));
    let reader = await screen.findByTestId("reader");
    expect(reader.getAttribute("data-initial")).toBe("791381-m28-l01-p01");
    // back to the overview
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى نظرة الكتاب" }));
    expect(screen.getByRole("heading", { level: 2, name: course.productTitle })).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("reader")).toBeNull());
    // pressing "بدء القراءة" now must NOT inherit the previous section's page
    fireEvent.click(screen.getByRole("button", { name: "بدء القراءة" }));
    reader = await screen.findByTestId("reader");
    expect(reader.getAttribute("data-initial")).toBe("«beginning»");
  });

  it("section navigation issues no network request (the Reader is code-split, content is a local import)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<LearningMaterialsPage />);
    openOverview();
    fireEvent.click(within(batchList()).getByRole("button", { name: "فتح قسم برمجة السويتش و VLAN" }));
    await screen.findByTestId("reader");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("Learning Materials — Phase 1 catalog", () => {
  it("exposes exactly the owner-provided 791381 identity and eight overview sections", () => {
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
      "المقدمة",
      "الأساسيات · الأعداد · IP",
      "الأجهزة والرسائل",
      "النماذج والبروتوكولات والأمان",
      "برمجة السويتش و VLAN",
      "الأمان · Wi-Fi · IPv6 · DHCP",
      "ACL · التوجيه · WAN",
      "التلخيص",
    ]);
    expect(course.overviewBatches.map(b => b.id)).toEqual(["intro", "b1", "b2", "b3", "b4", "b5", "b6", "summary"]);
  });
});
