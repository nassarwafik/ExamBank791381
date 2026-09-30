// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "./StructuredExamBuilder";
import { useStructuredExamHistory } from "./useStructuredExamHistory";
import { examSaveState } from "./examHistory";
import type { StructuredExam, BuilderQuestion } from "./examTypes";
import { GovernanceRequestError, type GovernanceService, type GovernanceStatus, type GovernanceManifestView, type ReviewWorkflowView, type DecisionRecord, type GovernanceActor } from "./examGovernance";

// Phase 14B — the Builder's governance panel in ASSIGNED mode with a fake App-owned service: actor-selection dialog before
// «إرسال للمراجعة», workflow card with display names / stage, assigned-actor decisions, required note, approver gating, the
// author's decision note, 409 refresh, identity configuration error. Fail-first on b9e45e8 (surface absent).
const mcq = (id: string, text: string): BuilderQuestion => ({ examQuestionId: id, presentationType: "multipleChoice", text, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } } as BuilderQuestion);
const makeExam = (): StructuredExam => ({ examId: "ex1", title: "امتحان", status: "draft", schemaVersion: 2, updatedAt: "2026-10-05T10:00:00.000Z",
  sections: [{ id: "s1", title: "الشبكات", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1", "ما هو الراوتر"), mcq("q2", "طبقات OSI")] }] } as StructuredExam);
const DIRECTORY: GovernanceActor[] = [
  { actorId: "teacher-author", displayName: "أ. سامر", capabilities: ["author"] },
  { actorId: "teacher-author-2", displayName: "أ. رنا", capabilities: ["author"] },
  { actorId: "teacher-reviewer", displayName: "أ. ليلى", capabilities: ["review"] },
  { actorId: "teacher-approver", displayName: "أ. هدى", capabilities: ["approve"] },
  { actorId: "teacher-publisher", displayName: "أ. مازن", capabilities: ["publish"] },
  { actorId: "teacher-multi", displayName: "أ. متعدد", capabilities: ["review", "approve", "publish"] }
];
const wf = (over: Partial<ReviewWorkflowView> = {}): ReviewWorkflowView => ({ cycleId: "cyc-1", revisionId: "rev-aaaa1111-latest", revisionNumber: 3, authorId: "teacher-author", reviewerId: "teacher-reviewer", approverId: "teacher-approver", publisherId: "teacher-publisher", submittedAt: "2026-10-05T09:40:00.000Z", submittedBy: "teacher-author", reviewStatus: "pending", ...over });
const manifest = (over: Partial<GovernanceManifestView> = {}): GovernanceManifestView => ({ examId: "ex1", lifecycleState: "draft", stateVersion: 2, latestRevisionId: "rev-aaaa1111-latest", latestRevisionNumber: 3, createdAt: "2026-10-05T09:00:00.000Z", updatedAt: "2026-10-05T09:30:00.000Z",
  lastTransition: { type: "revision-created", at: "2026-10-05T09:30:00.000Z", by: "teacher-author" }, ...over });
const inReview = (over: Partial<ReviewWorkflowView> = {}) => manifest({ lifecycleState: "in-review", stateVersion: 3, reviewRevisionId: "rev-aaaa1111-latest", reviewRevisionNumber: 3, reviewWorkflow: wf(over) });
const status = (m: GovernanceManifestView | null, actorId: string, capabilities: GovernanceStatus["capabilities"], extra: Partial<GovernanceStatus> = {}): GovernanceStatus => ({ governed: !!m, manifest: m, capabilities, capabilitySource: "configured", workflowMode: "assigned", actorId, ...extra });
type Fake = { svc: GovernanceService; calls: { method: string; args: unknown[] }[]; set: (s: GovernanceStatus) => void };
function fakeService(initial: GovernanceStatus, opts: { decisions?: DecisionRecord[]; onDecide?: (action: string, args: Record<string, unknown>) => Promise<GovernanceStatus>; onTransition?: (action: string, args: Record<string, unknown>) => Promise<GovernanceStatus> } = {}): Fake {
  let current = initial;
  const calls: Fake["calls"] = [];
  const svc: GovernanceService = {
    status: vi.fn(async () => { calls.push({ method: "status", args: [] }); return current; }),
    enable: vi.fn(async () => current),
    createRevision: vi.fn(async () => current),
    transition: vi.fn(async (examId, action, args) => { calls.push({ method: "transition", args: [examId, action, args] }); if (opts.onTransition) { current = await opts.onTransition(action, args as unknown as Record<string, unknown>); } return current; }),
    listRevisions: vi.fn(async () => ({ items: [], nextCursor: null })),
    loadRevision: vi.fn(async (_e, revisionId) => ({ revisionId, revisionNumber: 3, createdAt: "", createdBy: "teacher-author", contentHash: "c".repeat(64), exam: makeExam() })),
    listEvents: vi.fn(async () => ({ items: [], nextCursor: null })),
    directory: vi.fn(async () => { calls.push({ method: "directory", args: [] }); return { mode: "assigned" as const, actors: DIRECTORY }; }),
    decide: vi.fn(async (examId, action, args) => { calls.push({ method: "decide", args: [examId, action, args] }); if (opts.onDecide) { current = await opts.onDecide(action, args as unknown as Record<string, unknown>); } return current; }),
    listDecisions: vi.fn(async () => ({ items: opts.decisions ?? [], nextCursor: null })),
    loadDecision: vi.fn(async (_e, decisionId) => { const d = (opts.decisions ?? []).find(x => x.decisionId === decisionId); if (!d) throw new Error("missing"); return d; })
  };
  return { svc, calls, set: s => { current = s; } };
}
function Host({ svc }: { svc: GovernanceService }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(makeExam(), "saved"); } }, [hist]);
  const [saving] = useState(false);
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={saving} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo}
    saveState={examSaveState(hist.history, saving)} backupStorage={null} onRecover={hist.recover} autosaveDelayMs={5} governance={svc} />;
}
const tick = (ms = 5) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const openPanel = async () => { fireEvent.click(screen.getByRole("button", { name: /إدارة النشر والإصدارات/ })); const d = await screen.findByRole("dialog", { name: "إدارة النشر والإصدارات" }); await tick(30); return d; };
const btn = (scope: HTMLElement, name: string | RegExp) => within(scope).getByRole("button", { name });

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("14B — assignment dialog before submission (author, Assigned mode)", () => {
  it("submit opens the readiness panel, then the actor-selection dialog fed by the SERVER directory; invalid combinations are disabled; confirm sends ids only", async () => {
    const { svc, calls } = fakeService(status(manifest(), "teacher-author", ["author"]));
    render(<Host svc={svc} />);
    const d = await openPanel();
    expect(calls.some(c => c.method === "directory")).toBe(true);
    fireEvent.click(btn(d, "إرسال للمراجعة"));
    const readiness = await screen.findByRole("button", { name: /متابعة إرسال للمراجعة/ });
    fireEvent.click(readiness);
    const dlg = await screen.findByRole("dialog", { name: "تعيين دورة المراجعة" });
    const reviewer = within(dlg).getByLabelText(/المراجع/) as HTMLSelectElement;
    const approver = within(dlg).getByLabelText(/المعتمد/) as HTMLSelectElement;
    const publisher = within(dlg).getByLabelText(/الناشر/) as HTMLSelectElement;
    // only capability holders are offered; the author is never selectable; names, never raw ids, are shown
    expect(Array.from(reviewer.options).map(o => o.textContent)).toEqual(["— اختر —", "أ. ليلى", "أ. متعدد"]);
    expect(Array.from(approver.options).map(o => o.value)).toEqual(["", "teacher-approver", "teacher-multi"]);
    expect(within(dlg).queryByText(/teacher-reviewer/)).toBeNull();
    const confirm = within(dlg).getByTestId("assign-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(reviewer, { target: { value: "teacher-multi" } });
    // the same person cannot take a second stage: disabled in the other selects
    expect((Array.from(approver.options).find(o => o.value === "teacher-multi") as HTMLOptionElement).disabled).toBe(true);
    fireEvent.change(approver, { target: { value: "teacher-approver" } });
    fireEvent.change(publisher, { target: { value: "teacher-publisher" } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await tick(20);
    const t = calls.find(c => c.method === "transition")!;
    expect(t.args[1]).toBe("submit-review");
    expect(t.args[2]).toMatchObject({ expectedStateVersion: 2, revisionId: "rev-aaaa1111-latest", assignments: { reviewerId: "teacher-multi", approverId: "teacher-approver", publisherId: "teacher-publisher" } });
    expect(JSON.stringify(t.args[2])).not.toMatch(/displayName|أ\./);           // ids only — never names or roles
  });
});

describe("14B — workflow card and assigned-actor decisions", () => {
  it("reviewer stage: participants shown by display name with the current stage; the assigned reviewer gets إتمام المراجعة / طلب تعديلات; no approve, no generic return-to-draft", async () => {
    const { svc } = fakeService(status(inReview(), "teacher-reviewer", ["review"]));
    render(<Host svc={svc} />);
    const d = await openPanel();
    const card = within(d).getByTestId("gov-workflow");
    expect(within(card).getByTestId("gov-participant-authorId").textContent).toContain("أ. سامر");
    expect(within(card).getByTestId("gov-participant-reviewerId").textContent).toContain("أ. ليلى");
    expect(within(card).getByTestId("gov-participant-approverId").textContent).toContain("أ. هدى");
    expect(within(card).getByTestId("gov-participant-publisherId").textContent).toContain("أ. مازن");
    expect(within(card).getByTestId("gov-participant-reviewerId").getAttribute("aria-current")).toBe("step");
    expect(within(card).getByTestId("gov-responsible").textContent).toBe("أ. ليلى");
    expect(within(card).getByTestId("gov-review-status").textContent).toContain("قيد الانتظار");
    expect(card.textContent).not.toMatch(/teacher-reviewer|teacher-author/);
    const actions = within(d).getByRole("group", { name: "إجراءات النشر" });
    expect(within(actions).getByRole("button", { name: "إتمام المراجعة" })).toBeTruthy();
    expect(within(actions).getByRole("button", { name: "طلب تعديلات" })).toBeTruthy();
    expect(within(actions).queryByRole("button", { name: "اعتماد" })).toBeNull();
    expect(within(actions).queryByRole("button", { name: "إرجاع إلى المسودة" })).toBeNull();
  });
  it("request changes REQUIRES a note (confirm disabled while empty / whitespace); complete review sends the decision with expectedStateVersion + fresh requestId", async () => {
    const { svc, calls } = fakeService(status(inReview(), "teacher-reviewer", ["review"]));
    render(<Host svc={svc} />);
    const d = await openPanel();
    fireEvent.click(btn(d, "طلب تعديلات"));
    const dlg = await screen.findByRole("dialog", { name: "طلب تعديلات" });
    const confirm = within(dlg).getByTestId("decision-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dlg).getByLabelText(/الملاحظة \(مطلوبة\)/), { target: { value: "   " } });
    expect(confirm.disabled).toBe(true);
    fireEvent.click(within(dlg).getByRole("button", { name: "إلغاء" }));
    await tick();
    fireEvent.click(btn(d, "إتمام المراجعة"));
    const dlg2 = await screen.findByRole("dialog", { name: "إتمام المراجعة" });
    fireEvent.change(within(dlg2).getByLabelText(/ملاحظة \(اختيارية\)/), { target: { value: "لا ملاحظات" } });
    fireEvent.click(within(dlg2).getByTestId("decision-confirm"));
    await tick(20);
    const c = calls.find(x => x.method === "decide")!;
    expect(c.args[1]).toBe("complete-review");
    expect(c.args[2]).toMatchObject({ expectedStateVersion: 3, note: "لا ملاحظات" });
    expect(String((c.args[2] as { requestId: string }).requestId)).toMatch(/^gov-/);
    expect(calls.filter(x => x.method === "decide")).toHaveLength(1);
  });
  it("approver: nothing before the review is completed; after completion اعتماد + رفض الاعتماد; an unassigned approve-holder sees nothing", async () => {
    const pending = fakeService(status(inReview(), "teacher-approver", ["approve"]));
    render(<Host svc={pending.svc} />);
    let d = await openPanel();
    let actions = within(d).getByRole("group", { name: "إجراءات النشر" });
    expect(within(actions).queryByRole("button", { name: "اعتماد" })).toBeNull();
    expect(within(actions).queryByRole("button", { name: /رفض الاعتماد/ })).toBeNull();
    cleanup();
    const done = fakeService(status(inReview({ reviewStatus: "completed", reviewedAt: "2026-10-05T10:00:00.000Z", reviewedBy: "teacher-reviewer" }), "teacher-approver", ["approve"]));
    render(<Host svc={done.svc} />);
    d = await openPanel();
    actions = within(d).getByRole("group", { name: "إجراءات النشر" });
    expect(within(actions).getByRole("button", { name: "اعتماد" })).toBeTruthy();
    expect(within(actions).getByRole("button", { name: "رفض الاعتماد وإعادة للمسودة" })).toBeTruthy();
    expect(within(d).getByTestId("gov-responsible").textContent).toBe("أ. هدى");
    cleanup();
    const outsider = fakeService(status(inReview({ reviewStatus: "completed", reviewedAt: "x", reviewedBy: "teacher-reviewer" }), "teacher-multi", ["review", "approve", "publish"]));
    render(<Host svc={outsider.svc} />);
    d = await openPanel();
    actions = within(d).getByRole("group", { name: "إجراءات النشر" });
    expect(within(actions).queryByRole("button", { name: "اعتماد" })).toBeNull();
    expect(within(actions).queryByRole("button", { name: /نشر/ })).toBeNull();
  });
  it("the author sees WHY the exam came back: the latest decision note is shown prominently in draft, and the decision history lists stage / decision / actor / time / note", async () => {
    const decisions: DecisionRecord[] = [
      { decisionId: "dec-2", examId: "ex1", cycleId: "cyc-1", revisionId: "rev-aaaa1111-latest", revisionNumber: 3, stage: "review", decision: "changes-requested", actorId: "teacher-reviewer", occurredAt: "2026-10-05T11:00:00.000Z", note: "أعد صياغة السؤال الثاني <b>bold</b>", sequence: 5 },
      { decisionId: "dec-1", examId: "ex1", cycleId: "cyc-0", revisionId: "rev-old", revisionNumber: 2, stage: "approval", decision: "approval-rejected", actorId: "teacher-approver", occurredAt: "2026-10-04T11:00:00.000Z", note: "الأوزان", sequence: 3 }
    ];
    const { svc } = fakeService(status(manifest({ lastDecision: { decisionId: "dec-2", stage: "review", decision: "changes-requested", actorId: "teacher-reviewer", at: "2026-10-05T11:00:00.000Z", cycleId: "cyc-1", revisionId: "rev-aaaa1111-latest", revisionNumber: 3, hasNote: true } }), "teacher-author", ["author"]), { decisions });
    render(<Host svc={svc} />);
    const d = await openPanel();
    const last = within(d).getByTestId("gov-last-decision");
    expect(last.textContent).toContain("طُلبت تعديلات"); expect(last.textContent).toContain("أ. ليلى");
    expect(within(last).getByTestId("gov-last-decision-note").textContent).toBe("أعد صياغة السؤال الثاني <b>bold</b>");   // plain text, never HTML
    expect(last.querySelector("b")).toBeNull();
    const hist = within(d).getByTestId("gov-decisions");
    expect(within(hist).getAllByRole("listitem")).toHaveLength(2);
    expect(hist.textContent).toContain("رُفض الاعتماد"); expect(hist.textContent).toContain("أ. هدى"); expect(hist.textContent).toContain("الأوزان");
  });
  it("a 409 on a decision shows the conflict message, adopts the authoritative manifest and refreshes — never retries", async () => {
    const { svc, calls } = fakeService(status(inReview(), "teacher-reviewer", ["review"]), { onDecide: async () => { throw new GovernanceRequestError(409, "STALE_STATE", "stale", { manifest: inReview({ reviewStatus: "completed", reviewedAt: "x", reviewedBy: "teacher-reviewer" }) }); } });
    render(<Host svc={svc} />);
    const d = await openPanel();
    const statusCalls = calls.filter(c => c.method === "status").length;
    fireEvent.click(btn(d, "إتمام المراجعة"));
    const dlg = await screen.findByRole("dialog", { name: "إتمام المراجعة" });
    fireEvent.click(within(dlg).getByTestId("decision-confirm"));
    await tick(30);
    expect(within(d).getByRole("alert").textContent).toContain("تغيرت حالة الامتحان في الخادم");
    expect(calls.filter(c => c.method === "decide")).toHaveLength(1);
    expect(calls.filter(c => c.method === "status").length).toBeGreaterThan(statusCalls);
  });
  it("an identity configuration error is announced and the panel offers no mutation buttons beyond refresh", async () => {
    const { svc } = fakeService(status(manifest(), "teacher-author", [], { identityConfigurationError: "GOVERNANCE_IDENTITY_CONFIG_INVALID" }));
    render(<Host svc={svc} />);
    const d = await openPanel();
    expect(within(d).getByTestId("gov-identity-error").textContent).toContain("GOVERNANCE_IDENTITY_CONFIG_INVALID");
    const actions = within(d).getByRole("group", { name: "إجراءات النشر" });
    expect(within(actions).getAllByRole("button").map(b => b.textContent)).toEqual(["↻ تحديث الحالة"]);
  });
});
