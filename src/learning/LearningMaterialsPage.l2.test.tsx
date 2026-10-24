// @vitest-environment happy-dom
// Phase L.2 — Learning Materials in the URL:
//   • the fragment grammar (#/learning, #/learning/<course>, #/learning/<course>/read[/<page>]) — malformed → no route;
//   • every view change is a history entry and Back / Forward (popstate) replay it; a Reader page turn REPLACES the entry;
//   • a link opens the same place (the book, the reader at a page); an unknown book normalises to the library;
//   • leaving the page removes the fragment.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import LearningMaterialsPage from "./LearningMaterialsPage";
import { formatLearningRoute, isLearningLocation, parseLearningRoute } from "./learningRoute";

vi.mock("./training/LearningReaderWithTraining", () => ({
  default: (props: { courseId: string; initialPageId?: string; exitLabel: string; onExit: () => void; onPageChange?: (id: string) => void }) => (
    <div data-testid="reader" data-course={props.courseId} data-initial={props.initialPageId ?? "«beginning»"}>
      <button type="button" onClick={props.onExit}>{props.exitLabel}</button>
      <button type="button" onClick={() => props.onPageChange?.("791381-m09-l00-p01")}>قلب الصفحة</button>
    </div>
  ),
}));

const reset = () => history.replaceState(null, "", location.pathname);
afterEach(() => { cleanup(); reset(); });
const go = (hash: string) => history.replaceState(null, "", location.pathname + hash);
const popTo = async (hash: string) => { await act(async () => { go(hash); window.dispatchEvent(new PopStateEvent("popstate")); }); };

describe("L.2 — the route grammar", () => {
  it("parses the four routes and formats them back", () => {
    const cases: [string, ReturnType<typeof parseLearningRoute>][] = [
      ["#/learning", { kind: "library" }],
      ["#/learning/", { kind: "library" }],
      ["#/learning/791381", { kind: "course", courseId: "791381" }],
      ["#/learning/791381/read", { kind: "reader", courseId: "791381" }],
      ["#/learning/791381/read/791381-m01-l00-p01", { kind: "reader", courseId: "791381", pageId: "791381-m01-l00-p01" }],
    ];
    for (const [hash, route] of cases) {
      expect(parseLearningRoute(hash)).toEqual(route);
      expect(parseLearningRoute(formatLearningRoute(route!))).toEqual(route);
    }
  });
  it("anything malformed is no route (never a crash)", () => {
    for (const hash of ["", "#", "#/learn", "#/learningx", "#/learning/791381/edit", "#/learning/791381/read/a/b", "#/learning/<script>", "#/learning/791381/read/%E0%A4%A", "#/learning/" + "x".repeat(81)]) {
      expect(parseLearningRoute(hash)).toBeNull();
    }
  });
  it("isLearningLocation reads the current URL", () => {
    go("#/learning/791381");
    expect(isLearningLocation()).toBe(true);
    go("#/somewhere");
    expect(isLearningLocation()).toBe(false);
  });
});

describe("L.2 — history and Back", () => {
  it("library → book → reader push entries; a page turn replaces; popstate walks back; leaving clears the fragment", async () => {
    const pushes = vi.spyOn(history, "pushState");
    const view = render(<LearningMaterialsPage />);
    expect(location.hash).toBe("#/learning");                                        // normalised on entry, no push
    expect(pushes).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("article", { name: "شبكات الاتصال" })).getByRole("button", { name: "فتح الكتاب" }));
    expect(location.hash).toBe("#/learning/791381");
    fireEvent.click(screen.getByRole("button", { name: "بدء القراءة" }));
    await screen.findByTestId("reader");
    expect(location.hash).toBe("#/learning/791381/read");
    expect(pushes).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "قلب الصفحة" }));
    expect(location.hash).toBe("#/learning/791381/read/791381-m09-l00-p01");
    expect(pushes).toHaveBeenCalledTimes(2);                                        // a page turn is not a history entry
    await popTo("#/learning/791381");                                               // Back
    expect(screen.queryByTestId("reader")).toBeNull();
    expect(screen.getByRole("button", { name: "بدء القراءة" })).toBeTruthy();
    await popTo("#/learning");                                                      // Back again
    expect(within(screen.getByRole("article", { name: "شبكات الاتصال" })).getByRole("button", { name: "فتح الكتاب" })).toBeTruthy();
    await popTo("#/learning/791381/read/791381-m09-l00-p01");                       // Forward to the reader page
    expect((await screen.findByTestId("reader")).getAttribute("data-initial")).toBe("791381-m09-l00-p01");
    view.unmount();
    expect(location.hash).toBe("");
  });
});

describe("L.2 — links open the same place", () => {
  it("a book link opens its overview; a page link opens the reader at that page", async () => {
    go("#/learning/791381");
    render(<LearningMaterialsPage />);
    expect(screen.getByRole("button", { name: "بدء القراءة" })).toBeTruthy();
    cleanup();
    go("#/learning/791381/read/791381-m13-l01-p01");
    render(<LearningMaterialsPage />);
    expect((await screen.findByTestId("reader")).getAttribute("data-initial")).toBe("791381-m13-l01-p01");
    expect(location.hash).toBe("#/learning/791381/read/791381-m13-l01-p01");
  });
  it("an unknown book or a malformed link opens the library and the URL says so", async () => {
    for (const hash of ["#/learning/999999", "#/learning/999999/read/x", "#/learning/791381/oops"]) {
      go(hash);
      render(<LearningMaterialsPage />);
      expect(within(screen.getByRole("article", { name: "شبكات الاتصال" })).getByRole("button", { name: "فتح الكتاب" })).toBeTruthy();
      await waitFor(() => expect(location.hash).toBe("#/learning"));
      cleanup();
    }
  });
});
