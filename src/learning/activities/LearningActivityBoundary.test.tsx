// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import LearningActivityBoundary from "./LearningActivityBoundary";

afterEach(cleanup);

function Boom(): never { throw new Error("kaboom"); }

describe("Phase 3A — LearningActivityBoundary", () => {
  it("renders its children unchanged when nothing throws", () => {
    render(<LearningActivityBoundary fallback={<p>بديل</p>}><p>محتوى حي</p></LearningActivityBoundary>);
    expect(screen.getByText("محتوى حي")).toBeTruthy();
    expect(screen.queryByText("بديل")).toBeNull();
  });

  it("catches a render error, shows the fallback, and reports the message once — without crashing", () => {
    const onError = vi.fn();
    // React logs the caught error to console.error; silence it for a clean test run.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<LearningActivityBoundary fallback={<p>بديل آمن</p>} onError={onError}><Boom /></LearningActivityBoundary>);
    expect(screen.getByText("بديل آمن")).toBeTruthy();
    expect(onError).toHaveBeenCalledWith("kaboom");
    spy.mockRestore();
  });
});
