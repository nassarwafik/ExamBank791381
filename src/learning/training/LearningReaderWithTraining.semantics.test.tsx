// @vitest-environment happy-dom
// LearningReaderWithTraining forwards the SEMANTICS-only `embedded` flag verbatim to the ONE LearningReader: absent
// (the student host) → the content column stays the page's <main>; embedded (the teacher host) → a <div>.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import LearningReaderWithTraining from "./LearningReaderWithTraining";
import { makeImmediateApi } from "../reader/readerFixtures";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const column = () => document.querySelector(".learning-reader-main") as HTMLElement;
const mount = (extra: { embedded?: boolean } = {}) => render(
  <LearningReaderWithTraining courseId="791381" api={makeImmediateApi()} onExit={vi.fn()} exitLabel="رجوع" client={null} actor="teacher" {...extra} />,
);

describe("LearningReaderWithTraining — `embedded` plumbing", () => {
  it("not passed (the student host): the Reader's content column is <main> (default unchanged)", async () => {
    mount();
    await screen.findByRole("heading", { level: 2, name: "صفحة غنية" });
    expect(column().tagName).toBe("MAIN");
  });
  it("embedded: forwarded to the Reader — the content column is a <div>, and no <main> is rendered", async () => {
    mount({ embedded: true });
    await screen.findByRole("heading", { level: 2, name: "صفحة غنية" });
    expect(column().tagName).toBe("DIV");
    expect(document.querySelector("main")).toBeNull();
  });
});
