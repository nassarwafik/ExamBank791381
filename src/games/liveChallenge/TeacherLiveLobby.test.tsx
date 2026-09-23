// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, within, fireEvent, waitFor, act } from "@testing-library/react";
import TeacherLiveLobby from "./TeacherLiveLobby";
import type { TeacherLiveSessionClient, TeacherLobby, StudentOption } from "./liveSessionClient";
import type { Question } from "../../StudentQuestionCard";

// The recovery effect reads sessionStorage on mount and create() writes it, so clear it between tests.
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); try { sessionStorage.clear(); } catch { /* ignore */ } });

type PartLike = { studentId: string; displayName: string; joined: boolean; ready: boolean; answered?: boolean; joinedAt?: string | null; readyAt?: string | null };
const lobby = (over: Partial<Omit<TeacherLobby, "participants">> & { participants?: PartLike[] } = {}): TeacherLobby => {
  const { participants, ...rest } = over;
  const parts = participants || [
    { studentId: "s1", displayName: "أحمد", joined: false, ready: false },
    { studentId: "s2", displayName: "حلا", joined: false, ready: false },
  ];
  return {
    sessionId: "K7MX4P", joinCode: "K7MX4P", challengeId: "c1", challengeTitle: "تحدّي الشبكات", classId: "cl1", status: "lobby",
    counts: { total: 2, joined: 0, ready: 0 },
    roundVersion: 0, questionCount: 2, playing: 0,
    participants: parts.map(p => ({ answered: false, joinedAt: null, readyAt: null, ...p })),
    startedAt: null, createdAt: "", updatedAt: "", finishedAt: null, closedAt: null, ...rest,
  };
};
const Q1: Question = { examQuestionId: "q1", presentationType: "multipleChoice", text: "عاصمة الأردن؟", marks: 1, options: [{ text: "عمّان" }, { text: "إربد" }] };
const Q2: Question = { examQuestionId: "q2", presentationType: "multipleChoice", text: "أكبر كوكب؟", marks: 1, options: [{ text: "المشتري" }, { text: "الأرض" }] };
const active = (roundVersion: number, q: Question, over: Partial<TeacherLobby> = {}): TeacherLobby =>
  lobby({ status: "active", roundVersion, playing: 1, counts: { total: 2, joined: 1, ready: 1 },
    round: { roundVersion, questionNumber: roundVersion, questionCount: 2, questionStartedAt: null, question: q, answered: 0, playing: 1 }, ...over });

function fakeClient(over: Partial<TeacherLiveSessionClient> = {}): TeacherLiveSessionClient {
  return {
    listClasses: async () => [{ classId: "cl1", name: "الصف الأول" }],
    listStudents: async () => [
      { userId: "s1", displayName: "أحمد", active: true, archived: false },
      { userId: "s2", displayName: "حلا", active: true, archived: false },
      { userId: "s3", displayName: "مؤرشف", active: true, archived: true },   // must be filtered out of the picker
    ],
    create: async input => ({ ok: true, session: lobby({ counts: { total: input.studentIds.length, joined: 0, ready: 0 } }) }),
    get: async () => lobby(),
    start: async () => ({ ok: true, status: 200, session: active(1, Q1) }),
    next: async () => ({ ok: true, status: 200, session: active(2, Q2) }),
    finish: async () => ({ ok: true, status: 200, session: lobby({ status: "finished", finishedAt: "z" }) }),
    close: async () => ({ ok: true, session: lobby({ status: "closed", closedAt: "z" }) }),
    ...over,
  };
}

const renderLobby = (client: TeacherLiveSessionClient) =>
  render(<TeacherLiveLobby token="t" challengeId="c1" challengeTitle="تحدّي الشبكات" onBack={vi.fn()} client={client} />);

async function selectClassAndStudents(client: TeacherLiveSessionClient) {
  renderLobby(client);
  await screen.findByRole("option", { name: "الصف الأول" });
  fireEvent.change(screen.getByLabelText("الصف"), { target: { value: "cl1" } });
  await screen.findByText("أحمد");
}

describe("TeacherLiveLobby — create-room setup", () => {
  it("loads classes; selecting a class loads only ACTIVE, non-archived students", async () => {
    await selectClassAndStudents(fakeClient());
    expect(screen.getByText("أحمد")).toBeTruthy();
    expect(screen.getByText("حلا")).toBeTruthy();
    expect(screen.queryByText("مؤرشف")).toBeNull();            // archived filtered out
  });

  it("create is disabled with no students, enabled after selection; select-all / clear-all update the count", async () => {
    await selectClassAndStudents(fakeClient());
    const createBtn = screen.getByRole("button", { name: "إنشاء الغرفة" }) as HTMLButtonElement;
    expect(createBtn.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "اختيار الكل" }));
    expect(screen.getByText("2 / 2")).toBeTruthy();
    expect(createBtn.disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "إلغاء تحديد الكل" }));
    expect(screen.getByText("0 / 2")).toBeTruthy();
    expect((screen.getByRole("button", { name: "إنشاء الغرفة" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("creating a room shows the lobby with the room code and joined/ready counts", async () => {
    await selectClassAndStudents(fakeClient());
    fireEvent.click(screen.getByRole("button", { name: "اختيار الكل" }));
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الغرفة" }));
    expect(await screen.findByText("K7MX4P")).toBeTruthy();
    expect(screen.getByText("رمز الدخول")).toBeTruthy();
    expect(screen.getAllByText(/0 \/ 2/).length).toBeGreaterThanOrEqual(1);   // joined + ready counts both read 0 / 2
  });

  it("a create error is announced and the teacher stays on setup", async () => {
    await selectClassAndStudents(fakeClient({ create: async () => ({ ok: false, error: "أحد الطلاب المختارين غير صالح لهذه الغرفة." }) }));
    fireEvent.click(screen.getByRole("button", { name: "اختيار الكل" }));
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الغرفة" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("غير صالح");
    expect(screen.getByRole("button", { name: "إنشاء الغرفة" })).toBeTruthy();   // still on setup
  });
});

describe("TeacherLiveLobby — lobby polling & close", () => {
  it("joined/ready counts and participant states update from the poll", async () => {
    // create returns a fresh (nobody joined) lobby; the very first poll returns a joined+ready student → the UI updates.
    const client = fakeClient({
      create: async () => ({ ok: true, session: lobby() }),
      get: async () => lobby({ counts: { total: 2, joined: 1, ready: 1 }, participants: [
        { studentId: "s1", displayName: "أحمد", joined: true, ready: true, joinedAt: "a", readyAt: "a" },
        { studentId: "s2", displayName: "حلا", joined: false, ready: false, joinedAt: null, readyAt: null }] }),
    });
    await selectClassAndStudents(client);
    fireEvent.click(screen.getByRole("button", { name: "اختيار الكل" }));
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الغرفة" }));
    const list = await screen.findByRole("list", { name: "المشاركون" });
    await waitFor(() => expect(within(list).getByText("أحمد").closest("li")!.getAttribute("data-state")).toBe("ready"));
    expect(screen.getAllByText(/1 \/ 2/).length).toBeGreaterThanOrEqual(1);   // joined 1/2 (ready also 1/2)
  });

  it("close asks for confirmation, then shows the closed state and stops polling", async () => {
    const get = vi.fn(async () => lobby());
    const client = fakeClient({ get });
    await selectClassAndStudents(client);
    fireEvent.click(screen.getByRole("button", { name: "اختيار الكل" }));
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الغرفة" }));
    await screen.findByText("K7MX4P");
    fireEvent.click(screen.getByRole("button", { name: "إغلاق الغرفة" }));
    fireEvent.click(screen.getByRole("button", { name: "تأكيد الإغلاق" }));
    expect(await screen.findByText("تم إغلاق هذه الغرفة.")).toBeTruthy();
    const afterClose = get.mock.calls.length;
    await new Promise(r => setTimeout(r, 60));                 // polling is gated on status==="lobby"; no further gets
    expect(get.mock.calls.length).toBe(afterClose);
  });

  it("close pauses polling immediately so an in-flight poll can't update the room mid-close (Fix 2)", async () => {
    // The first poll GET is held pending. The teacher closes (close() also held). `closing` must pause polling the
    // instant close begins, so the in-flight GET — resolving with a CHANGED open roster — is dropped and never shown.
    // Removing the `&& !closing` gate makes the stale roster (2 / 2) appear and fails this test.
    let releaseGet: (v: TeacherLobby) => void = () => {};
    const staleGet = new Promise<TeacherLobby>(res => { releaseGet = res; });
    let getCalls = 0;
    const get = vi.fn(() => { getCalls += 1; return getCalls === 1 ? staleGet : Promise.resolve(lobby()); });
    let releaseClose: (v: { ok: boolean; session: TeacherLobby }) => void = () => {};
    const closeP = new Promise<{ ok: boolean; session: TeacherLobby }>(res => { releaseClose = res; });
    const close = vi.fn(() => closeP);
    const client = fakeClient({ create: async () => ({ ok: true, session: lobby() }), get, close });
    await selectClassAndStudents(client);
    fireEvent.click(screen.getByRole("button", { name: "اختيار الكل" }));
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الغرفة" }));
    await screen.findByText("K7MX4P");
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));        // first poll GET in flight (held pending)

    fireEvent.click(screen.getByRole("button", { name: "إغلاق الغرفة" }));
    fireEvent.click(screen.getByRole("button", { name: "تأكيد الإغلاق" }));  // closing=true → polling paused NOW
    releaseGet(lobby({ counts: { total: 2, joined: 2, ready: 2 } }));  // the stale poll resolves with a CHANGED roster
    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryAllByText(/2 \/ 2/).length).toBe(0);           // ignored — polling was paused by close

    releaseClose({ ok: true, session: lobby({ status: "closed", closedAt: "z" }) });
    expect(await screen.findByText("تم إغلاق هذه الغرفة.")).toBeTruthy();
  });

  it("a late class-A roster does not replace the newer class-B selection (Fix 4)", async () => {
    // Pick class A (roster held pending), switch to class B (roster resolves), then A resolves LATE. The stale A roster
    // must be dropped by the request-generation guard. Removing that guard makes "طالب أ" replace "طالبة ب" and fails.
    let releaseA: (v: StudentOption[]) => void = () => {};
    const aList = new Promise<StudentOption[]>(res => { releaseA = res; });
    const listStudents = vi.fn((id: string) =>
      id === "clA" ? aList : Promise.resolve([{ userId: "b1", displayName: "طالبة ب", active: true, archived: false }]));
    const client = fakeClient({
      listClasses: async () => [{ classId: "clA", name: "صف أ" }, { classId: "clB", name: "صف ب" }],
      listStudents,
    });
    renderLobby(client);
    await screen.findByRole("option", { name: "صف أ" });
    fireEvent.change(screen.getByLabelText("الصف"), { target: { value: "clA" } });   // A pending
    await waitFor(() => expect(listStudents).toHaveBeenCalledWith("clA"));
    fireEvent.change(screen.getByLabelText("الصف"), { target: { value: "clB" } });   // switch to B
    await screen.findByText("طالبة ب");                                              // B roster shown

    releaseA([{ userId: "a1", displayName: "طالب أ", active: true, archived: false }]);  // A resolves LATE
    await new Promise(r => setTimeout(r, 20));
    expect(screen.getByText("طالبة ب")).toBeTruthy();               // newer B roster remains
    expect(screen.queryByText("طالب أ")).toBeNull();                // stale A roster dropped
  });

  it("stops polling on unmount (no update-after-unmount)", async () => {
    vi.useFakeTimers();
    const get = vi.fn(async () => lobby());
    const client = fakeClient({ get, listClasses: async () => [{ classId: "cl1", name: "الصف الأول" }] });
    const r = render(<TeacherLiveLobby token="t" challengeId="c1" challengeTitle="x" onBack={vi.fn()} client={client} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.change(screen.getByLabelText("الصف"), { target: { value: "cl1" } });
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole("button", { name: "اختيار الكل" }));
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الغرفة" }));
    await act(async () => { await Promise.resolve(); });
    const before = get.mock.calls.length;
    r.unmount();
    await act(async () => { vi.advanceTimersByTime(6000); });
    expect(get.mock.calls.length).toBe(before);                // no polls after unmount
  });
});

describe("TeacherLiveLobby — live round controls (Phase 4B)", () => {
  // A consistent fake server: create → lobby(joined 1); start/next/finish advance a mutable server state so polls
  // reconcile to the same state instead of reverting.
  function liveClient(over: Partial<TeacherLiveSessionClient> = {}) {
    let server: TeacherLobby = lobby({ counts: { total: 2, joined: 1, ready: 1 }, playing: 1 });
    return fakeClient({
      create: async () => ({ ok: true, session: server }),
      get: async () => server,
      start: async () => { server = active(1, Q1); return { ok: true, status: 200, session: server }; },
      next: async () => { server = active(2, Q2); return { ok: true, status: 200, session: server }; },
      finish: async () => { server = lobby({ status: "finished", finishedAt: "z" }); return { ok: true, status: 200, session: server }; },
      ...over,
    });
  }
  async function createAndStart(client: TeacherLiveSessionClient) {
    await selectClassAndStudents(client);
    fireEvent.click(screen.getByRole("button", { name: "اختيار الكل" }));
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الغرفة" }));
    await screen.findByRole("button", { name: "ابدأ التحدّي" });
  }
  it("start is disabled until at least one student has joined", async () => {
    const client = fakeClient({ create: async () => ({ ok: true, session: lobby({ counts: { total: 2, joined: 0, ready: 0 } }) }), get: async () => lobby({ counts: { total: 2, joined: 0, ready: 0 } }) });
    await selectClassAndStudents(client);
    fireEvent.click(screen.getByRole("button", { name: "اختيار الكل" }));
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الغرفة" }));
    expect((await screen.findByRole("button", { name: "ابدأ التحدّي" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("start → question + أجاب X / Y; next advances to the last question; finish ends the challenge", async () => {
    await createAndStart(liveClient());
    fireEvent.click(screen.getByRole("button", { name: "ابدأ التحدّي" }));
    expect(await screen.findByText("عاصمة الأردن؟")).toBeTruthy();
    expect(screen.getByText(/أجاب/)).toBeTruthy();
    expect(screen.getByText(/0 من 1/)).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "السؤال التالي" }));
    expect(await screen.findByText("أكبر كوكب؟")).toBeTruthy();
    const finishBtn = await screen.findByRole("button", { name: "إنهاء التحدّي" });
    fireEvent.click(finishBtn);
    expect(await screen.findByText(/انتهى التحدّي/)).toBeTruthy();
  });
  it("a stale in-flight poll cannot revert the round after next (Fix 2)", async () => {
    let releaseGet: (v: TeacherLobby) => void = () => {};
    const staleGet = new Promise<TeacherLobby>(res => { releaseGet = res; });
    let server: TeacherLobby = active(1, Q1);
    let n = 0;
    const client = fakeClient({
      create: async () => ({ ok: true, session: lobby({ counts: { total: 2, joined: 1, ready: 1 } }) }),
      start: async () => { server = active(1, Q1); return { ok: true, status: 200, session: server }; },
      get: () => { n += 1; return n === 1 ? staleGet : Promise.resolve(server); },
      next: async () => { server = active(2, Q2); return { ok: true, status: 200, session: server }; },
    });
    await createAndStart(client);
    fireEvent.click(screen.getByRole("button", { name: "ابدأ التحدّي" }));
    await screen.findByText("عاصمة الأردن؟");
    await waitFor(() => expect(n).toBeGreaterThanOrEqual(1));       // first active poll held pending
    fireEvent.click(await screen.findByRole("button", { name: "السؤال التالي" }));  // busy → polling paused; next → round 2
    await screen.findByText("أكبر كوكب؟");
    releaseGet(active(1, Q1));                                      // OLD poll resolves with round 1
    await new Promise(r => setTimeout(r, 20));
    expect(screen.getByText("أكبر كوكب؟")).toBeTruthy();           // still round 2 — stale poll ignored
    expect(screen.queryByText("عاصمة الأردن؟")).toBeNull();
  });
  it("recovery: a remembered active room is offered and resumes into the live round", async () => {
    try { sessionStorage.setItem("eb-lc-teacher-room", "K7MX4P"); } catch { /* ignore */ }
    const client = fakeClient({ get: async () => active(1, Q1) });
    renderLobby(client);
    fireEvent.click(await screen.findByRole("button", { name: "استئناف الجلسة" }));
    expect(await screen.findByText("عاصمة الأردن؟")).toBeTruthy();   // resumed straight into the active round
  });
  it("recovery: a stale/unknown remembered room clears the pointer (no resume offered)", async () => {
    try { sessionStorage.setItem("eb-lc-teacher-room", "K7MX4P"); } catch { /* ignore */ }
    const get = vi.fn(async () => null);
    renderLobby(fakeClient({ get }));
    await waitFor(() => expect(get).toHaveBeenCalledWith("K7MX4P"));
    expect(screen.queryByRole("button", { name: "استئناف الجلسة" })).toBeNull();
    expect(sessionStorage.getItem("eb-lc-teacher-room")).toBeNull();
  });
});

describe("TeacherLiveLobby — recovery lifecycle (review fix)", () => {
  async function createRoom(client: TeacherLiveSessionClient) {
    await selectClassAndStudents(client);
    fireEvent.click(screen.getByRole("button", { name: "اختيار الكل" }));
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الغرفة" }));
    await screen.findByText("K7MX4P");
  }
  it("normal navigation away (رجوع) KEEPS the reconnect hint", async () => {
    await createRoom(fakeClient());
    expect(sessionStorage.getItem("eb-lc-teacher-room")).toBe("K7MX4P");
    fireEvent.click(screen.getByRole("button", { name: "رجوع إلى الألعاب" }));
    expect(sessionStorage.getItem("eb-lc-teacher-room")).toBe("K7MX4P");   // hint retained
  });
  it("a FAILED close keeps the reconnect hint", async () => {
    await createRoom(fakeClient({ close: async () => ({ ok: false }) }));
    fireEvent.click(screen.getByRole("button", { name: "إغلاق الغرفة" }));
    fireEvent.click(screen.getByRole("button", { name: "تأكيد الإغلاق" }));
    expect(await screen.findByText("تعذّر إغلاق الغرفة.")).toBeTruthy();
    expect(sessionStorage.getItem("eb-lc-teacher-room")).toBe("K7MX4P");   // retained — close did not succeed
  });
  it("a SUCCESSFUL close clears the reconnect hint", async () => {
    await createRoom(fakeClient());   // default close → { ok:true, session: closed }
    fireEvent.click(screen.getByRole("button", { name: "إغلاق الغرفة" }));
    fireEvent.click(screen.getByRole("button", { name: "تأكيد الإغلاق" }));
    expect(await screen.findByText("تم إغلاق هذه الغرفة.")).toBeTruthy();
    expect(sessionStorage.getItem("eb-lc-teacher-room")).toBeNull();       // cleared on success
  });
  it("recovery: a remembered FINISHED room is still offered for resume in Phase 4B", async () => {
    try { sessionStorage.setItem("eb-lc-teacher-room", "K7MX4P"); } catch { /* ignore */ }
    const client = fakeClient({ get: async () => lobby({ status: "finished", finishedAt: "z" }) });
    renderLobby(client);
    expect(await screen.findByRole("button", { name: "استئناف الجلسة" })).toBeTruthy();
    expect(sessionStorage.getItem("eb-lc-teacher-room")).toBe("K7MX4P");
  });
  it("recovery: a remembered CLOSED room clears the hint (no resume)", async () => {
    try { sessionStorage.setItem("eb-lc-teacher-room", "K7MX4P"); } catch { /* ignore */ }
    const get = vi.fn(async () => lobby({ status: "closed", closedAt: "z" }));
    renderLobby(fakeClient({ get }));
    await waitFor(() => expect(get).toHaveBeenCalledWith("K7MX4P"));
    expect(screen.queryByRole("button", { name: "استئناف الجلسة" })).toBeNull();
    expect(sessionStorage.getItem("eb-lc-teacher-room")).toBeNull();
  });
});
