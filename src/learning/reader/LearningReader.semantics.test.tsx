// @vitest-environment happy-dom
// Learning Reader — landmark SEMANTICS of the content column. Standalone (default, e.g. the student's full-screen
// Reader) the column is the page's <main>; `embedded` (a host that already owns <main>, i.e. the teacher app shell)
// renders the SAME column as a <div> — same class, ref, tabIndex and children — in normal AND presentation mode,
// through page navigation, so behavior (focus/scroll owner, presentation layout) is unchanged.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import LearningReader from "./LearningReader";
import { makeImmediateApi } from "./readerFixtures";

afterEach(() => { cleanup(); vi.restoreAllMocks(); document.body.style.overflow = ""; });

const column = () => document.querySelector(".learning-reader-main") as HTMLElement;
const root = () => document.querySelector(".learning-reader") as HTMLElement;

async function walk(embedded: boolean | undefined, check: (step: string) => void) {
  render(<LearningReader courseId="791381" onExit={vi.fn()} api={makeImmediateApi()} {...(embedded === undefined ? {} : { embedded })} />);
  await screen.findByRole("heading", { level: 2, name: "صفحة غنية" });
  check("normal");
  fireEvent.click(screen.getByRole("button", { name: "التالي" }));
  await waitFor(() => expect(document.activeElement?.classList.contains("learning-reader-page-title")).toBe(true));
  expect(column().contains(document.activeElement)).toBe(true);          // the content column still owns focus/scroll
  check("normal → next page");
  fireEvent.click(screen.getByRole("button", { name: "وضع العرض" }));
  await waitFor(() => expect(root().classList.contains("is-presentation")).toBe(true));
  check("presentation");
  fireEvent.click(screen.getByRole("button", { name: "السابق" }));
  await screen.findByRole("heading", { level: 2, name: "صفحة غنية" });
  check("presentation → previous page");
  fireEvent.click(screen.getByRole("button", { name: "خروج من وضع العرض" }));
  await waitFor(() => expect(root().classList.contains("is-presentation")).toBe(false));
  check("presentation exited");
}

describe("LearningReader — content-column semantics", () => {
  it("default (standalone, the student's full-screen Reader): the column is <main class=learning-reader-main> in every state", async () => {
    await walk(undefined, step => {
      expect(column().tagName, step).toBe("MAIN");
      expect(document.querySelectorAll("main").length, step).toBe(1);
      expect(column().getAttribute("tabindex"), step).toBe("-1");
    });
  });

  it("embedded: the SAME column renders as <div class=learning-reader-main> in every state — no <main>, no substitute role", async () => {
    await walk(true, step => {
      expect(column().tagName, step).toBe("DIV");
      expect(column().className, step).toBe("learning-reader-main");
      expect(column().getAttribute("tabindex"), step).toBe("-1");
      expect(column().getAttribute("role"), step).toBeNull();
      expect(document.querySelector("main"), step).toBeNull();
      expect(document.querySelector("[role=main]"), step).toBeNull();
    });
  });

  it("embedded={false} is exactly the default", async () => {
    await walk(false, step => expect(column().tagName, step).toBe("MAIN"));
  });

  it("loading and error states render no content column and no <main> in either mode (unchanged)", async () => {
    const never = makeImmediateApi({ loadManifest: () => new Promise<never>(() => {}) });
    for (const embedded of [false, true]) {
      render(<LearningReader courseId="791381" onExit={vi.fn()} api={never} embedded={embedded} />);
      expect(screen.getByRole("status").textContent).toContain("جارٍ تحميل فهرس الكتاب");
      expect(document.querySelector("main")).toBeNull();
      cleanup();
    }
  });
});
