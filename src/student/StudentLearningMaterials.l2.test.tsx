// @vitest-environment happy-dom
// Phase L.2 — a student's released units are links: each opens the Reader at that unit, after the same open-time
// re-validation as «فتح المادة» (a unit hidden since the panel loaded never opens). The Reader honours the unit.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import StudentLearningMaterials, { type StudentLearningCourse } from "./StudentLearningMaterials";
import LearningReader from "../learning/reader/LearningReader";
import { makeImmediateApi } from "../learning/reader/readerFixtures";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const COURSE: StudentLearningCourse = { courseId: "791381", title: "شبكات الاتصال", modules: [
  { moduleId: "791381-m01", title: "أساسيات الشبكات", order: 1 },
  { moduleId: "791381-m02", title: "الأعداد والموازين", order: 2 },
] };
function serve(...answers: StudentLearningCourse[][]) {
  const queue = [...answers];
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    const materials = queue.length > 1 ? queue.shift()! : queue[0];
    return { status: 200, ok: true, json: async () => ({ ok: true, materials }) } as Response;
  });
}

describe("L.2 — the student's units are links", () => {
  it("a unit opens the Reader at that unit after re-validating the release", async () => {
    const fetchSpy = serve([COURSE]);
    const onOpen = vi.fn();
    render(<StudentLearningMaterials token="t" onOpen={onOpen} />);
    const unit = await screen.findByRole("button", { name: "الأعداد والموازين" });
    fireEvent.click(unit);
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(COURSE, "791381-m02"));
    expect(fetchSpy).toHaveBeenCalledTimes(2);                                         // the panel read + the open-time read
    fireEvent.click(screen.getByRole("button", { name: "فتح المادة" }));
    await waitFor(() => expect(onOpen).toHaveBeenLastCalledWith(COURSE, undefined));   // the whole book: where the student left off
  });

  it("a unit hidden since the panel loaded does not open and says so", async () => {
    serve([COURSE], [{ ...COURSE, modules: [COURSE.modules[0]] }]);
    const onOpen = vi.fn();
    render(<StudentLearningMaterials token="t" onOpen={onOpen} />);
    fireEvent.click(await screen.findByRole("button", { name: "الأعداد والموازين" }));
    expect(await screen.findByText("لم تعد هذه الوحدة متاحة لصفك حاليًا.")).toBeTruthy();
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe("L.2 — the Reader opens at a unit", () => {
  it("initialModuleId opens that module's first page; a valid initialPageId still wins; an unknown module opens the beginning", async () => {
    render(<LearningReader courseId="791381" onExit={vi.fn()} api={makeImmediateApi()} initialModuleId="m2" />);
    expect(await screen.findByRole("heading", { level: 2, name: "صفحة ٥" })).toBeTruthy();
    cleanup();
    render(<LearningReader courseId="791381" onExit={vi.fn()} api={makeImmediateApi()} initialModuleId="m2" initialPageId="p3" />);
    expect(await screen.findByRole("heading", { level: 2, name: "صفحة ٣" })).toBeTruthy();
    cleanup();
    render(<LearningReader courseId="791381" onExit={vi.fn()} api={makeImmediateApi()} initialModuleId="m9" />);
    expect(await screen.findByRole("heading", { level: 2, name: "صفحة غنية" })).toBeTruthy();
  });
});
