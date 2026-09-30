// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "./StructuredExamBuilder";
import { useStructuredExamHistory } from "./useStructuredExamHistory";
import { examSaveState } from "./examHistory";
import type { StructuredExam, BuilderQuestion } from "./examTypes";
import { GOVERNANCE_CONFLICT_MESSAGE, GovernanceRequestError, type GovernanceService, type GovernanceStatus, type GovernanceManifestView, type RevisionMeta, type GovernanceEvent } from "./examGovernance";

// Phase 14A — G9: the lazy «إدارة النشر والإصدارات» surface inside the REAL StructuredExamBuilder with a fake App-owned
// governance service (the builder never receives a token). Fail-first on 6918ce1 (surface absent).

const mcq = (id: string, text: string): BuilderQuestion => ({ examQuestionId: id, presentationType: "multipleChoice", text, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } } as BuilderQuestion);
const makeExam = (): StructuredExam => ({ examId: "ex1", title: "امتحان", status: "draft", schemaVersion: 2, updatedAt: "2026-09-30T10:00:00.000Z",
  sections: [{ id: "s1", title: "الشبكات", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1", "ما هو الراوتر"), mcq("q2", "طبقات OSI")] }] } as StructuredExam);
const ALL = ["author", "review", "approve", "publish"] as const;
const manifest = (over: Partial<GovernanceManifestView> = {}): GovernanceManifestView => ({ examId: "ex1", lifecycleState: "draft", stateVersion: 2, latestRevisionId: "rev-aaaa1111-latest", latestRevisionNumber: 3, createdAt: "2026-09-30T09:00:00.000Z", updatedAt: "2026-09-30T09:30:00.000Z",
  lastTransition: { type: "revision-created", at: "2026-09-30T09:30:00.000Z", by: "teacher-1" }, ...over });
const revisions: RevisionMeta[] = [
  { revisionId: "rev-aaaa1111-latest", revisionNumber: 3, createdAt: "2026-09-30T09:30:00.000Z", createdBy: "teacher-1", contentHash: "c".repeat(64), title: "امتحان", questionCount: 2, totalMarks: 4, roles: ["latest"] },
  { revisionId: "rev-bbbb2222-pub", revisionNumber: 2, createdAt: "2026-09-29T09:30:00.000Z", createdBy: "teacher-1", contentHash: "d".repeat(64), title: "امتحان", questionCount: 2, totalMarks: 4, roles: ["published"] },
  { revisionId: "rev-cccc3333-old", revisionNumber: 1, createdAt: "2026-09-28T09:30:00.000Z", createdBy: "teacher-1", contentHash: "e".repeat(64), title: "امتحان", questionCount: 1, totalMarks: 2, roles: [] }
];
const events: GovernanceEvent[] = [
  { eventId: "ev3", examId: "ex1", type: "published", revisionId: "rev-bbbb2222-pub", fromState: "approved", toState: "published", actorId: "teacher-1", occurredAt: "2026-09-29T10:00:00.000Z", requestId: "p", sequence: 3 },
  { eventId: "ev1", examId: "ex1", type: "governance-enabled", revisionId: "rev-cccc3333-old", toState: "draft", actorId: "teacher-1", occurredAt: "2026-09-28T09:30:00.000Z", requestId: "e", sequence: 1 }
];
type FakeOpts = { status?: GovernanceStatus; onTransition?: (action: string, args: Record<string, unknown>) => Promise<GovernanceStatus> };
function fakeService(opts: FakeOpts = {}) {
  let current: GovernanceStatus = opts.status ?? { governed: true, manifest: manifest(), capabilities: [...ALL], capabilitySource: "default-single-teacher" };
  const calls: { method: string; args: unknown[] }[] = [];
  const svc: GovernanceService = {
    status: vi.fn(async () => { calls.push({ method: "status", args: [] }); return current; }),
    enable: vi.fn(async (examId, exam, requestId) => { calls.push({ method: "enable", args: [examId, exam, requestId] }); current = { governed: true, manifest: manifest({ stateVersion: 1, latestRevisionNumber: 1 }), capabilities: [...ALL], capabilitySource: "default-single-teacher" }; return current; }),
    createRevision: vi.fn(async (examId, exam, args) => { calls.push({ method: "createRevision", args: [examId, exam, args] }); return current; }),
    transition: vi.fn(async (examId, action, args) => { calls.push({ method: "transition", args: [examId, action, args] }); if (opts.onTransition) { current = await opts.onTransition(action, args); return current; } return current; }),
    listRevisions: vi.fn(async () => ({ items: revisions, nextCursor: null })),
    loadRevision: vi.fn(async (_examId, revisionId) => ({ revisionId, revisionNumber: 2, createdAt: "2026-09-29T09:30:00.000Z", createdBy: "teacher-1", contentHash: "d".repeat(64), exam: { ...makeExam(), title: "الإصدار المنشور" } })),
    listEvents: vi.fn(async () => ({ items: events, nextCursor: null }))
  };
  return { svc, calls, set: (s: GovernanceStatus) => { current = s; } };
}
function Host({ svc, initial }: { svc: GovernanceService; initial?: StructuredExam }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial ?? makeExam(), "saved"); } }, [hist, initial]);
  const [saving] = useState(false);
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={saving} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo}
    saveState={examSaveState(hist.history, saving)} backupStorage={null} onRecover={hist.recover} autosaveDelayMs={5} governance={svc} />;
}
const tick = (ms = 5) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const openPanel = async () => { fireEvent.click(screen.getByRole("button", { name: /إدارة النشر والإصدارات/ })); const d = await screen.findByRole("dialog", { name: "إدارة النشر والإصدارات" }); await tick(20); return d; };

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("14A G9 — governance surface", () => {
  it("without a governance service the builder has no governance button (legacy Builder unchanged)", () => {
    const hist = { open: () => {} };
    void hist;
    render(<StructuredExamBuilder exam={makeExam()} onChange={() => {}} onSave={() => {}} saving={false} backupStorage={null} autosaveDelayMs={5} />);
    expect(screen.queryByRole("button", { name: /إدارة النشر والإصدارات/ })).toBeNull();
  });
  it("shows lifecycle state, revision number / short id, published revision, last transition, capabilities, revision history and audit timeline — from the server status, not from exam.status", async () => {
    const { svc, calls } = fakeService({ status: { governed: true, manifest: manifest({ publishedRevisionId: "rev-bbbb2222-pub", publishedRevisionNumber: 2, publishedAt: "2026-09-29T10:00:00.000Z", publishedBy: "teacher-1" }), capabilities: [...ALL], capabilitySource: "default-single-teacher" } });
    render(<Host svc={svc} initial={{ ...makeExam(), status: "final" }} />);
    const d = await openPanel();
    expect(within(d).getByTestId("gov-state").textContent).toBe("مسودة");                     // exam.status "final" is NOT the authority
    expect(within(d).getByTestId("gov-revision").textContent).toContain("3");
    expect(within(d).getByTestId("gov-revision").textContent).toContain("rev-aaaa");
    expect(within(d).getByTestId("gov-published").textContent).toContain("2");
    expect(within(d).getByTestId("gov-published").textContent).toContain("rev-bbbb");
    expect(within(d).getByTestId("gov-last-transition").textContent).toMatch(/إنشاء إصدار/);
    expect(within(d).getByTestId("gov-capabilities").textContent).toMatch(/تأليف.*مراجعة.*اعتماد.*نشر/);
    const rows = within(d).getAllByRole("row").filter(r => r.getAttribute("data-revision-id"));
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toMatch(/3/); expect(rows[0].textContent).toMatch(/الأحدث/);
    expect(rows[1].textContent).toMatch(/منشور/); expect(rows[1].textContent).toContain("dddddddd");   // short content hash
    expect(within(d).getByRole("list", { name: "سجل الحوكمة" }).textContent).toMatch(/نشر.*teacher-1/);
    expect(calls.filter(c => c.method === "status")).toHaveLength(1);                        // one status read on open; no polling
    await tick(60);
    expect(calls.filter(c => c.method === "status")).toHaveLength(1);
  });
  it("draft with all capabilities: «إنشاء إصدار من النسخة الحالية» and «إرسال للمراجعة» (readiness shown first); approve / publish are not offered", async () => {
    const { svc, calls } = fakeService();
    render(<Host svc={svc} />);
    const d = await openPanel();
    expect(within(d).getByRole("button", { name: "إنشاء إصدار من النسخة الحالية" })).toBeTruthy();
    expect(within(d).getByRole("button", { name: "إرسال للمراجعة" })).toBeTruthy();
    expect(within(d).queryByRole("button", { name: "اعتماد" })).toBeNull();
    expect(within(d).queryByRole("button", { name: "نشر" })).toBeNull();
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء إصدار من النسخة الحالية" })); await tick(20);
    const cr = calls.find(c => c.method === "createRevision")!;
    expect(cr.args[0]).toBe("ex1"); expect((cr.args[1] as StructuredExam).examId).toBe("ex1");
    expect((cr.args[2] as { expectedStateVersion: number; requestId: string }).expectedStateVersion).toBe(2);
    expect(typeof (cr.args[2] as { requestId: string }).requestId).toBe("string");
    fireEvent.click(within(d).getByRole("button", { name: "إرسال للمراجعة" })); await tick(20);
    // the 13C-C readiness check is shown BEFORE the request; the request is sent from the readiness confirmation
    const readiness = await screen.findByRole("dialog", { name: "فحص الجاهزية للاعتماد" });
    fireEvent.click(within(readiness).getByRole("button", { name: "متابعة إرسال للمراجعة" })); await tick(20);
    const tr = calls.find(c => c.method === "transition")!;
    expect(tr.args[1]).toBe("submit-review");
    expect(tr.args[2]).toMatchObject({ expectedStateVersion: 2, revisionId: "rev-aaaa1111-latest" });
  });
  it("capabilities gate the offered actions: in-review with review-only → only «إرجاع إلى المسودة»; approve-only → «اعتماد»", async () => {
    const inReview = manifest({ lifecycleState: "in-review", reviewRevisionId: "rev-aaaa1111-latest" });
    const a = fakeService({ status: { governed: true, manifest: inReview, capabilities: ["review"], capabilitySource: "configured" } });
    render(<Host svc={a.svc} />);
    let d = await openPanel();
    expect(within(d).getByRole("button", { name: "إرجاع إلى المسودة" })).toBeTruthy();
    expect(within(d).queryByRole("button", { name: "اعتماد" })).toBeNull();
    cleanup();
    const b = fakeService({ status: { governed: true, manifest: inReview, capabilities: ["approve"], capabilitySource: "configured" } });
    render(<Host svc={b.svc} />);
    d = await openPanel();
    expect(within(d).getByRole("button", { name: "اعتماد" })).toBeTruthy();
    expect(within(d).queryByRole("button", { name: "إرجاع إلى المسودة" })).toBeNull();
    expect(within(d).getByTestId("gov-state").textContent).toBe("قيد المراجعة");
  });
  it("409 from the server: the conflict message is shown, the status is refreshed once, and the transition is NOT retried automatically", async () => {
    const newer = manifest({ lifecycleState: "in-review", stateVersion: 3, reviewRevisionId: "rev-aaaa1111-latest" });
    const f = fakeService({ status: { governed: true, manifest: manifest({ lifecycleState: "approved", approvedRevisionId: "rev-aaaa1111-latest" }), capabilities: [...ALL], capabilitySource: "default-single-teacher" } });
    (f.svc.transition as ReturnType<typeof vi.fn>).mockImplementation(async () => { f.set({ governed: true, manifest: newer, capabilities: [...ALL], capabilitySource: "default-single-teacher" }); throw new GovernanceRequestError(409, "STALE_STATE", "stale", { manifest: newer }); });
    render(<Host svc={f.svc} />);
    const d = await openPanel();
    fireEvent.click(within(d).getByRole("button", { name: "نشر" })); await tick(30);
    expect(within(d).getByRole("alert").textContent).toContain(GOVERNANCE_CONFLICT_MESSAGE);
    expect(within(d).getByTestId("gov-state").textContent).toBe("قيد المراجعة");
    expect(f.svc.transition).toHaveBeenCalledTimes(1);
    await tick(60);
    expect(f.svc.transition).toHaveBeenCalledTimes(1);
    expect(within(d).queryByRole("button", { name: "نشر" })).toBeNull();                    // actions follow the refreshed authoritative state
  });
  it("published: «إنشاء نسخة تحرير جديدة» sends return-to-draft; viewing the published revision is read-only (preview + metadata, no editing controls)", async () => {
    const pub = manifest({ lifecycleState: "published", latestRevisionId: "rev-bbbb2222-pub", latestRevisionNumber: 2, publishedRevisionId: "rev-bbbb2222-pub", publishedRevisionNumber: 2, publishedAt: "2026-09-29T10:00:00.000Z", publishedBy: "teacher-1" });
    const f = fakeService({ status: { governed: true, manifest: pub, capabilities: [...ALL], capabilitySource: "default-single-teacher" } });
    render(<Host svc={f.svc} />);
    const d = await openPanel();
    expect(within(d).getByTestId("gov-state").textContent).toBe("منشور");
    const rows = within(d).getAllByRole("row").filter(r => r.getAttribute("data-revision-id") === "rev-bbbb2222-pub");
    fireEvent.click(within(rows[0]).getByRole("button", { name: "عرض" })); await tick(30);
    const viewer = await screen.findByRole("dialog", { name: /الإصدار 2/ });
    expect(viewer.getAttribute("data-readonly")).toBe("true");
    expect(viewer.textContent).toContain("الإصدار المنشور");
    expect(viewer.textContent).toContain("dddddddd");
    expect(viewer.querySelectorAll("textarea, input:not([type=hidden])")).toHaveLength(0);
    expect(within(viewer).queryByRole("button", { name: /إضافة|حذف|بنك الأسئلة|مخطط الامتحان|سياسات الجودة/ })).toBeNull();
    fireEvent.click(within(viewer).getByRole("button", { name: "إغلاق" })); await tick();
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء نسخة تحرير جديدة" })); await tick(20);
    const tr = f.calls.find(c => c.method === "transition")!;
    expect(tr.args[1]).toBe("return-to-draft");
    expect(tr.args[2]).toMatchObject({ expectedStateVersion: 2 });
  });
  it("legacy (not governed) exam: opening the panel creates nothing; only an explicit «تفعيل إدارة النشر» enrolls the exam", async () => {
    const f = fakeService({ status: { governed: false, manifest: null, capabilities: [...ALL], capabilitySource: "default-single-teacher" } });
    render(<Host svc={f.svc} />);
    const d = await openPanel();
    expect(within(d).getByText(/غير مسجّل في إدارة النشر/)).toBeTruthy();
    expect(f.svc.enable).not.toHaveBeenCalled();
    fireEvent.click(within(d).getByRole("button", { name: "تفعيل إدارة النشر" })); await tick(20);
    expect(f.svc.enable).toHaveBeenCalledTimes(1);
    expect((f.svc.enable as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("ex1");
    expect(within(d).getByTestId("gov-state").textContent).toBe("مسودة");
  });
});
