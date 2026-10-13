// @vitest-environment happy-dom
// Phase 21E.3 review fix 1 — a failing rich stem is never replaced SILENTLY, and what is announced is true (#13 #22). Fail-first on 92f4326:
// there the plain text replaced the stem with no notice and no retry, and the exam announcer said «تعذّر عرض هذا السؤال الآن» although
// the question was displayed and answerable.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QuestionRecoveryContext } from "./student/exam/questionRecovery";

vi.mock("./richContent/RichPrompt", () => ({ default: () => { throw new Error("rich stem internal detail"); }, RichText: () => null }));
import StudentQuestionCard from "./StudentQuestionCard";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("RF1 — a failing rich stem: plain text WITH a notice and a retry; the announcement says what really happened", () => {
  it("visible notice + retry, the answer area stays, and the announcer does not claim the question failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const announce = vi.fn();
    const q = { examQuestionId: "q1", presentationType: "open", text: "اشرح مفهوم الشبكة المحلية.", marks: 2, richContent: { v: 1, blocks: [{ type: "paragraph", runs: [{ text: "rich" }] }] } };
    render(<QuestionRecoveryContext.Provider value={{ scope: "exam", reloadAllowed: false, strict: false, announce }}>
      <StudentQuestionCard q={q as never} index={0} id="q1" answer={undefined} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} />
    </QuestionRecoveryContext.Provider>);
    await waitFor(() => expect(announce).toHaveBeenCalled());
    expect(screen.getByText("اشرح مفهوم الشبكة المحلية.")).toBeTruthy();
    expect(screen.getByTestId("question-recovery-compact").textContent).toContain("فيظهر نصه الأساسي");
    expect(screen.getByRole("button", { name: "إعادة تحميل التنسيق" })).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(announce).not.toHaveBeenCalledWith("تعذّر عرض هذا السؤال الآن");
    expect(announce).toHaveBeenCalledWith("يظهر نص السؤال بصيغة مبسّطة");
  });
});
