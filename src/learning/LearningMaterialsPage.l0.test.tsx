// @vitest-environment happy-dom
// Phase L.0 — the course overview tells the truth about its sections:
//   • a section with no pages yet (المقدمة) is shown as «قريبًا» once the manifest proves it empty — it is no longer a
//     control that silently opens the Reader at the SAME page as the next section;
//   • the manifest load is visible (a status line) and a failure is an alert with a working retry, never a silent,
//     detail-less list. The rows stay usable while loading and after a failure.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import LearningMaterialsPage from "./LearningMaterialsPage";
import { LEARNING_COURSES } from "./catalog";

const control = vi.hoisted(() => ({ failures: 0 }));
vi.mock("./content/registry", async importOriginal => {
  const real = await importOriginal<typeof import("./content/registry")>();
  return {
    ...real,
    loadCourseManifest: (courseId: string) => (control.failures-- > 0 ? Promise.reject(new Error("chunk failed")) : real.loadCourseManifest(courseId)),
  };
});
vi.mock("./training/LearningReaderWithTraining", () => ({
  default: (props: { initialPageId?: string }) => <div data-testid="reader" data-initial={props.initialPageId ?? "«beginning»"} />,
}));

afterEach(() => { cleanup(); control.failures = 0; });

const course = LEARNING_COURSES[0];
const openOverview = () => fireEvent.click(within(screen.getByRole("article", { name: "شبكات الاتصال" })).getByRole("button", { name: "فتح الكتاب" }));
const batchList = () => screen.getByRole("list", { name: "أقسام محتوى الكتاب" });
const detailsLoaded = () => waitFor(() => expect(screen.queryByText("جارٍ تحميل تفاصيل الأقسام…")).toBeNull());

describe("L.0 — an empty section is «قريبًا», not a link to another section's page", () => {
  it("after the manifest loads, المقدمة is a static row with «قريبًا» and the seven populated sections stay controls", async () => {
    render(<LearningMaterialsPage />);
    openOverview();
    await detailsLoaded();
    const intro = within(batchList()).getByText("المقدمة").closest("li")!;
    expect(within(intro).queryByRole("button")).toBeNull();
    expect(within(intro).getByText("قريبًا")).toBeTruthy();
    const controls = within(batchList()).getAllByRole("button");
    expect(controls.map(b => b.getAttribute("aria-label"))).toEqual(course.overviewBatches.filter(b => b.id !== "intro").map(b => "فتح قسم " + b.label));
    expect(within(batchList()).getAllByText("قريبًا")).toHaveLength(1);
    // the populated sections still open their own first page
    fireEvent.click(within(batchList()).getByRole("button", { name: "فتح قسم الأساسيات · الأعداد · IP" }));
    expect((await screen.findByTestId("reader")).getAttribute("data-initial")).toBe("791381-m01-l00-p01");
  });
});

describe("L.0 — the section details' load is visible and recoverable", () => {
  it("shows a loading status that disappears once the details arrive", async () => {
    render(<LearningMaterialsPage />);
    openOverview();
    expect(screen.getByRole("status").textContent).toBe("جارٍ تحميل تفاصيل الأقسام…");
    await detailsLoaded();
    expect(within(batchList()).getAllByText(/الصفحات \d+–\d+/)).toHaveLength(7);
  });

  it("a failed load is an alert with a retry; the rows stay usable; the retry recovers the details", async () => {
    control.failures = 1;
    render(<LearningMaterialsPage />);
    openOverview();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("تعذّر تحميل تفاصيل أقسام الكتاب");
    expect(within(batchList()).getAllByRole("button")).toHaveLength(8);          // nothing proven empty → all usable
    fireEvent.click(within(alert).getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    await detailsLoaded();
    expect(within(batchList()).getAllByText(/الصفحات \d+–\d+/)).toHaveLength(7);
    expect(within(batchList()).getAllByRole("button")).toHaveLength(7);
  });
});
