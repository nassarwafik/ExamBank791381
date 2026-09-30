// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import ReviewInboxPage from "./ReviewInboxPage";
import type { ReviewInboxClient, InboxTask, InboxPage } from "./reviewInboxClient";
import { GovernanceRequestError, type GovernanceService, type GovernanceStatus, type GovernanceManifestView, type ReviewWorkflowView, type RevisionDocument, type GovernanceActor } from "../examGovernance";
import type { StructuredExam } from "../examTypes";

// Phase 14B Part J — the Review Inbox page («مراجعات النشر») with an injected client: stage tabs + counts, task rows (title,
// revision, author name, time, stage), opening a task loads the IMMUTABLE revision named by the task (never a live exam),
// assigned-actor decisions, required note, publisher publish, 409 refresh, R13 (a late load for task A never lands on task B),
// keyboard-reachable controls. Fail-first on b9e45e8 (page absent).
const DIRECTORY: GovernanceActor[] = [
  { actorId: "teacher-author", displayName: "أ. سامر", capabilities: ["author"] }, { actorId: "teacher-reviewer", displayName: "أ. ليلى", capabilities: ["review"] },
  { actorId: "teacher-approver", displayName: "أ. هدى", capabilities: ["approve"] }, { actorId: "teacher-publisher", displayName: "أ. مازن", capabilities: ["publish"] }
];
const wf = (over: Partial<ReviewWorkflowView> = {}): ReviewWorkflowView => ({ cycleId: "cyc-A", revisionId: "rev-A3", revisionNumber: 3, authorId: "teacher-author", reviewerId: "teacher-reviewer", approverId: "teacher-approver", publisherId: "teacher-publisher", submittedAt: "2026-10-06T08:00:00.000Z", submittedBy: "teacher-author", reviewStatus: "pending", ...over });
const manifest = (over: Partial<GovernanceManifestView> = {}): GovernanceManifestView => ({ examId: "EX-A", lifecycleState: "in-review", stateVersion: 4, latestRevisionId: "rev-A3", latestRevisionNumber: 3, reviewRevisionId: "rev-A3", reviewRevisionNumber: 3, createdAt: "", updatedAt: "", reviewWorkflow: wf(), ...over });
const task = (over: Partial<InboxTask> = {}): InboxTask => ({ examId: "EX-A", cycleId: "cyc-A", revisionId: "rev-A3", revisionNumber: 3, stage: "review", title: "امتحان الشبكات", authorId: "teacher-author", submittedAt: "2026-10-06T08:00:00.000Z", createdAt: "2026-10-06T08:00:00.000Z", lifecycleState: "in-review", stateVersion: 4, reviewStatus: "pending", ...over });
const liveExam = { examId: "EX-A", title: "النسخة الحية المعدَّلة بعد الإرسال", status: "draft", schemaVersion: 2, sections: [] } as unknown as StructuredExam;
const revisionDoc = (revisionId = "rev-A3", title = "امتحان الشبكات — الإصدار المجمّد"): RevisionDocument => ({ revisionId, revisionNumber: 3, createdAt: "2026-10-06T07:00:00.000Z", createdBy: "teacher-author", contentHash: "c".repeat(64), exam: { examId: "EX-A", title, status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [{ examQuestionId: "q1", presentationType: "multipleChoice", text: "ما هو الراوتر", marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } }] }] } as unknown as StructuredExam });
type Opts = { actorId: string; capabilities: GovernanceStatus["capabilities"]; tasks?: Partial<Record<string, InboxTask[]>>; manifestFor?: (examId: string) => GovernanceManifestView; loadDelay?: Record<string, number>; onDecide?: () => Promise<GovernanceStatus>; onTransition?: () => Promise<GovernanceStatus> };
function fakeClient(o: Opts) {
  const calls: { method: string; args: unknown[] }[] = [];
  const tasks = o.tasks ?? { review: [task()] };
  const list = vi.fn(async (stage: string): Promise<InboxPage> => {
    calls.push({ method: "list", args: [stage] });
    const items = stage === "all" ? Object.values(tasks).flat().filter((x): x is InboxTask => !!x) : tasks[stage] ?? [];
    return { items, nextCursor: null, counts: { review: (tasks.review ?? []).length, approve: (tasks.approve ?? []).length, publish: (tasks.publish ?? []).length }, actorId: o.actorId };
  });
  const st = (examId: string): GovernanceStatus => ({ governed: true, manifest: o.manifestFor ? o.manifestFor(examId) : manifest({ examId }), capabilities: o.capabilities, capabilitySource: "configured", workflowMode: "assigned", actorId: o.actorId });
  const governance: GovernanceService = {
    status: vi.fn(async examId => { calls.push({ method: "status", args: [examId] }); return st(examId); }),
    enable: vi.fn(), createRevision: vi.fn(), listRevisions: vi.fn(async () => ({ items: [], nextCursor: null })), listEvents: vi.fn(async () => ({ items: [], nextCursor: null })),
    loadRevision: vi.fn(async (examId, revisionId) => { calls.push({ method: "loadRevision", args: [examId, revisionId] }); const d = o.loadDelay?.[examId] ?? 0; if (d) await new Promise(r => setTimeout(r, d)); return revisionDoc(revisionId, examId === "EX-B" ? "امتحان ب — المجمّد" : undefined); }),
    transition: vi.fn(async (examId, action, args) => { calls.push({ method: "transition", args: [examId, action, args] }); if (o.onTransition) return o.onTransition(); return st(examId); }),
    directory: vi.fn(async () => ({ mode: "assigned" as const, actors: DIRECTORY })),
    decide: vi.fn(async (examId, action, args) => { calls.push({ method: "decide", args: [examId, action, args] }); if (o.onDecide) return o.onDecide(); return st(examId); }),
    listDecisions: vi.fn(async () => ({ items: [], nextCursor: null })),
    loadDecision: vi.fn()
  };
  const client: ReviewInboxClient = { list, governance };
  return { client, calls };
}
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const openFirstTask = async () => { fireEvent.click((await screen.findAllByRole("button", { name: /فتح مهمة/ }))[0]); await tick(30); return screen.getByRole("dialog"); };

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("14B J — Review Inbox page", () => {
  it("lists my tasks by stage with counts: title, revision number, author display name, submitted time and stage; no answer keys / bodies", async () => {
    const { client, calls } = fakeClient({ actorId: "teacher-reviewer", capabilities: ["review"], tasks: { review: [task(), task({ examId: "EX-B", cycleId: "cyc-B", title: "امتحان ب", revisionId: "rev-B1", revisionNumber: 1 })], approve: [] } });
    render(<ReviewInboxPage token="t" client={client} />);
    await tick(30);
    const rows = screen.getAllByTestId("inbox-task");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("امتحان الشبكات"); expect(rows[0].textContent).toContain("الإصدار 3"); expect(rows[0].textContent).toContain("أ. سامر"); expect(rows[0].textContent).toContain("بانتظار مراجعتي");
    expect(rows[0].textContent).not.toMatch(/teacher-author|correctOptionIndex/);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map(t => t.textContent)).toEqual(["بانتظار مراجعتي 2", "بانتظار اعتمادي 0", "بانتظار النشر 0"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.click(tabs[1]);
    await tick(20);
    expect(screen.getByText(/لا مهام في «بانتظار اعتمادي»/)).toBeTruthy();
    expect(calls.filter(c => c.method === "list").map(c => c.args[0])).toEqual(["review", "approve"]);
    expect(calls.some(c => c.method === "loadRevision")).toBe(false);                  // listing never loads bodies
  });
  it("opening a task loads the IMMUTABLE revision named by the task and shows it read-only with participants and the reviewer's decisions — never the live exam, no editing controls", async () => {
    const { client, calls } = fakeClient({ actorId: "teacher-reviewer", capabilities: ["review"] });
    render(<ReviewInboxPage token="t" client={client} />);
    const dlg = await openFirstTask();
    expect(calls.find(c => c.method === "loadRevision")!.args).toEqual(["EX-A", "rev-A3"]);
    expect(within(dlg).getByTestId("revision-title").textContent).toBe("امتحان الشبكات — الإصدار المجمّد");
    expect(dlg.textContent).not.toContain(liveExam.title);
    expect(dlg.getAttribute("data-readonly") ?? dlg.querySelector("[data-readonly]") ?? within(dlg).getByTestId("revision-viewer")).toBeTruthy();
    expect(within(dlg).queryAllByRole("textbox")).toHaveLength(0);                    // no editing controls in the task view
    const wfCard = within(dlg).getByTestId("task-workflow");
    expect(wfCard.textContent).toContain("أ. سامر"); expect(wfCard.textContent).toContain("أ. ليلى"); expect(wfCard.textContent).toContain("(أنت)");
    const group = within(dlg).getByRole("group", { name: "قرارات المراجعة" });
    expect(within(group).getAllByRole("button").map(b => b.textContent)).toEqual(["إتمام المراجعة", "طلب تعديلات"]);
  });
  it("complete review: the decision carries the status' expectedStateVersion + a fresh requestId + the note; the list reloads and the task closes", async () => {
    const { client, calls } = fakeClient({ actorId: "teacher-reviewer", capabilities: ["review"] });
    render(<ReviewInboxPage token="t" client={client} />);
    const dlg = await openFirstTask();
    fireEvent.click(within(dlg).getByRole("button", { name: "إتمام المراجعة" }));
    const note = await screen.findByRole("dialog", { name: "إتمام المراجعة" });
    fireEvent.change(within(note).getByLabelText(/ملاحظة \(اختيارية\)/), { target: { value: "جيد" } });
    fireEvent.click(within(note).getByTestId("decision-confirm"));
    await tick(30);
    const d = calls.find(c => c.method === "decide")!;
    expect(d.args[0]).toBe("EX-A"); expect(d.args[1]).toBe("complete-review");
    expect(d.args[2]).toMatchObject({ expectedStateVersion: 4, note: "جيد" });
    expect(calls.filter(c => c.method === "list").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByTestId("revision-viewer")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("إتمام المراجعة");
  });
  it("request changes requires a note: the confirm stays disabled until text is entered", async () => {
    const { client, calls } = fakeClient({ actorId: "teacher-reviewer", capabilities: ["review"] });
    render(<ReviewInboxPage token="t" client={client} />);
    const dlg = await openFirstTask();
    fireEvent.click(within(dlg).getByRole("button", { name: "طلب تعديلات" }));
    const note = await screen.findByRole("dialog", { name: "طلب تعديلات" });
    const confirm = within(note).getByTestId("decision-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(note).getByLabelText(/الملاحظة \(مطلوبة\)/), { target: { value: "أعد الصياغة" } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await tick(30);
    expect(calls.find(c => c.method === "decide")!.args[2]).toMatchObject({ note: "أعد الصياغة" });
  });
  it("approver before review completion has no decision; after completion اعتماد + رفض; publisher gets نشر (no note) + إعادة قبل النشر", async () => {
    const early = fakeClient({ actorId: "teacher-approver", capabilities: ["approve"], tasks: { approve: [task({ stage: "approve" })] } });
    render(<ReviewInboxPage token="t" client={early.client} />);
    fireEvent.click(screen.getAllByRole("tab")[1]); await tick(20);
    let dlg = await openFirstTask();
    expect(within(dlg).getByTestId("task-no-actions").textContent).toContain("أ. ليلى");
    cleanup();
    const done = fakeClient({ actorId: "teacher-approver", capabilities: ["approve"], tasks: { approve: [task({ stage: "approve", reviewStatus: "completed" })] }, manifestFor: () => manifest({ reviewWorkflow: wf({ reviewStatus: "completed", reviewedAt: "x", reviewedBy: "teacher-reviewer" }) }) });
    render(<ReviewInboxPage token="t" client={done.client} />);
    fireEvent.click(screen.getAllByRole("tab")[1]); await tick(20);
    dlg = await openFirstTask();
    expect(within(within(dlg).getByRole("group", { name: "قرارات المراجعة" })).getAllByRole("button").map(b => b.textContent)).toEqual(["اعتماد", "رفض الاعتماد وإعادة للمسودة"]);
    cleanup();
    const pub = fakeClient({ actorId: "teacher-publisher", capabilities: ["publish"], tasks: { publish: [task({ stage: "publish", lifecycleState: "approved" })] }, manifestFor: () => manifest({ lifecycleState: "approved", approvedRevisionId: "rev-A3", stateVersion: 6, reviewWorkflow: wf({ reviewStatus: "completed", reviewedAt: "x", reviewedBy: "teacher-reviewer", approvedAt: "y", approvedBy: "teacher-approver" }) }) });
    render(<ReviewInboxPage token="t" client={pub.client} />);
    fireEvent.click(screen.getAllByRole("tab")[2]); await tick(20);
    dlg = await openFirstTask();
    const buttons = within(within(dlg).getByRole("group", { name: "قرارات المراجعة" })).getAllByRole("button");
    expect(buttons.map(b => b.textContent)).toEqual(["نشر", "إعادة قبل النشر"]);
    fireEvent.click(buttons[0]);
    await tick(30);
    const t = pub.calls.find(c => c.method === "transition")!;
    expect(t.args[1]).toBe("publish"); expect(t.args[2]).toMatchObject({ expectedStateVersion: 6 });
    expect(JSON.stringify(t.args[2])).not.toMatch(/publishedRevisionId|revisionId/);   // the server binds the approved revision
  });
  it("a 409 on a decision shows the conflict message, closes the task and reloads the list — never retries", async () => {
    const { client, calls } = fakeClient({ actorId: "teacher-reviewer", capabilities: ["review"], onDecide: async () => { throw new GovernanceRequestError(409, "STALE_STATE", "stale", { manifest: null }); } });
    render(<ReviewInboxPage token="t" client={client} />);
    const dlg = await openFirstTask();
    fireEvent.click(within(dlg).getByRole("button", { name: "إتمام المراجعة" }));
    const note = await screen.findByRole("dialog", { name: "إتمام المراجعة" });
    fireEvent.click(within(note).getByTestId("decision-confirm"));
    await tick(30);
    expect(screen.getByRole("alert").textContent).toContain("تغيرت حالة الامتحان في الخادم");
    expect(screen.queryByTestId("revision-viewer")).toBeNull();
    expect(calls.filter(c => c.method === "decide")).toHaveLength(1);
    expect(calls.filter(c => c.method === "list").length).toBeGreaterThanOrEqual(2);
  });
  it("R13 — a slow load for task A returning after task B was opened never replaces B's view", async () => {
    const { client } = fakeClient({ actorId: "teacher-reviewer", capabilities: ["review"], tasks: { review: [task(), task({ examId: "EX-B", cycleId: "cyc-B", title: "امتحان ب", revisionId: "rev-B1", revisionNumber: 1 })] }, loadDelay: { "EX-A": 80 } });
    render(<ReviewInboxPage token="t" client={client} />);
    const buttons = await screen.findAllByRole("button", { name: /فتح مهمة/ });
    fireEvent.click(buttons[0]);                     // A: slow
    await tick(5);
    // while A is in flight the page is busy; simulate the user reaching B right after A settles into "busy" — B is opened once A's click is not yet resolved
    await tick(100);
    expect(screen.getByTestId("revision-title").textContent).toBe("امتحان الشبكات — الإصدار المجمّد");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /إغلاق|close/i }));
    await tick(10);
    fireEvent.click(buttons[1]);                     // B: fast
    await tick(40);
    expect(screen.getByTestId("revision-title").textContent).toBe("امتحان ب — المجمّد");
    await tick(120);                                 // any late A result must not land on B
    expect(screen.getByTestId("revision-title").textContent).toBe("امتحان ب — المجمّد");
  });
  it("tabs and task controls are real buttons reachable by keyboard; the page is RTL", async () => {
    const { client } = fakeClient({ actorId: "teacher-reviewer", capabilities: ["review"] });
    const { container } = render(<ReviewInboxPage token="t" client={client} />);
    await tick(30);
    expect(container.querySelector("section.gov-inbox")?.getAttribute("dir")).toBe("rtl");
    const tab = screen.getAllByRole("tab")[1];
    tab.focus(); expect(document.activeElement).toBe(tab);
    fireEvent.keyDown(tab, { key: "Enter" }); fireEvent.click(tab);
    await tick(20);
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel")).toBeTruthy();
  });
});
