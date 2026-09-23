// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import StudentLiveLobby from "./StudentLiveLobby";
import type { StudentLiveSessionClient, StudentLobby, StudentLiveSessionResult } from "./liveSessionClient";
import type { Question } from "../../StudentQuestionCard";

// The reconnect effect reads sessionStorage on mount, so clear it between tests to keep each render isolated.
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); try { sessionStorage.clear(); } catch { /* ignore */ } });

const slobby = (over: Partial<Omit<StudentLobby, "you">> & { you?: Partial<StudentLobby["you"]> } = {}): StudentLobby => {
  const { you, ...rest } = over;
  return {
    sessionId: "K7MX4P", joinCode: "K7MX4P", challengeTitle: "تحدّي الشبكات", status: "lobby",
    you: { joined: true, ready: false, answered: false, ...(you || {}) }, counts: { total: 2, joined: 1, ready: 0 },
    participants: [{ displayName: "أحمد", joined: true, ready: false }, { displayName: "حلا", joined: false, ready: false }],
    updatedAt: "", closedAt: null, ...rest,
  };
};
const ok = (session: StudentLobby): StudentLiveSessionResult => ({ ok: true, status: 200, session });
function fakeClient(over: Partial<StudentLiveSessionClient> = {}): StudentLiveSessionClient {
  return {
    join: async () => ok(slobby()), get: async () => ok(slobby()),
    ready: async (_c, ready) => ok(slobby({ you: { joined: true, ready, answered: false } })),
    answer: async () => ok(slobby()),
    ...over,
  };
}
const renderLobby = (client: StudentLiveSessionClient) => render(<StudentLiveLobby token="stu" onBack={vi.fn()} client={client} />);

describe("StudentLiveLobby — join screen", () => {
  it("shows the RTL join screen with a room-code field and normalizes input (uppercase, drop invalid)", () => {
    renderLobby(fakeClient());
    expect(screen.getByRole("heading", { level: 1, name: "التحدّي المباشر" })).toBeTruthy();
    const input = screen.getByLabelText("رمز الغرفة") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "k7-mx4p" } });
    expect(input.value).toBe("K7MX4P");                          // uppercased, dash dropped, capped at 6
  });
  it("join is disabled until a full valid code is entered", () => {
    renderLobby(fakeClient());
    const btn = screen.getByRole("button", { name: "انضمام" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("رمز الغرفة"), { target: { value: "K7MX4P" } });
    expect((screen.getByRole("button", { name: "انضمام" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("an unassigned student (403) sees a clear message and stays on the join screen", async () => {
    renderLobby(fakeClient({ join: async () => ({ ok: false, status: 403 }) }));
    fireEvent.change(screen.getByLabelText("رمز الغرفة"), { target: { value: "K7MX4P" } });
    fireEvent.click(screen.getByRole("button", { name: "انضمام" }));
    expect(await screen.findByText("لست ضمن هذه الغرفة.")).toBeTruthy();
    expect(screen.getByLabelText("رمز الغرفة")).toBeTruthy();
  });
  it("a closed room (409) is reported on join", async () => {
    renderLobby(fakeClient({ join: async () => ({ ok: false, status: 409 }) }));
    fireEvent.change(screen.getByLabelText("رمز الغرفة"), { target: { value: "K7MX4P" } });
    fireEvent.click(screen.getByRole("button", { name: "انضمام" }));
    expect(await screen.findByText("تم إغلاق هذه الغرفة.")).toBeTruthy();
  });
});

describe("StudentLiveLobby — lobby & ready", () => {
  async function joinRoom(client: StudentLiveSessionClient) {
    renderLobby(client);
    fireEvent.change(screen.getByLabelText("رمز الغرفة"), { target: { value: "K7MX4P" } });
    fireEvent.click(screen.getByRole("button", { name: "انضمام" }));
    await screen.findByText("تم انضمامك — بانتظار بدء المعلم.");
  }
  it("a successful join enters the lobby and shows a ready toggle", async () => {
    await joinRoom(fakeClient());
    expect(screen.getByRole("button", { name: "أنا جاهز" })).toBeTruthy();
    expect(screen.getByText("أحمد")).toBeTruthy();
  });
  it("the ready toggle calls ready(true) then can be toggled back", async () => {
    // A realistic server: get() reflects the ready state ready() last set (polling resumes after each toggle when busy
    // clears, so a mock that always returned ready:false would clobber the just-set state — that is the Fix 2 behavior).
    let serverReady = false;
    const ready = vi.fn(async (_c: string, r: boolean) => { serverReady = r; return ok(slobby({ you: { joined: true, ready: r } })); });
    const get = vi.fn(async () => ok(slobby({ you: { joined: true, ready: serverReady } })));
    await joinRoom(fakeClient({ ready, get }));
    fireEvent.click(screen.getByRole("button", { name: "أنا جاهز" }));
    await screen.findByRole("button", { name: /جاهز ✓/ });
    expect(ready).toHaveBeenLastCalledWith("K7MX4P", true);
    fireEvent.click(screen.getByRole("button", { name: /جاهز ✓/ }));
    await waitFor(() => expect(ready).toHaveBeenLastCalledWith("K7MX4P", false));
  });
  it("a stale in-flight poll cannot overwrite a newer ready(true) (Fix 2)", async () => {
    // Student joins ready:false; the first lobby GET is HELD pending (it captured the pre-ready ready:false state). The
    // student clicks ready → ready(true) resolves first (UI ready). When the OLD GET finally resolves ready:false it MUST
    // be dropped (busy paused polling, so its effect was torn down). Removing `&& !busy` makes this test fail.
    let releaseStaleGet: (v: StudentLiveSessionResult) => void = () => {};
    const staleGet = new Promise<StudentLiveSessionResult>(res => { releaseStaleGet = res; });
    let getCalls = 0;
    const get = vi.fn(() => {
      getCalls += 1;
      return getCalls === 1 ? staleGet : Promise.resolve(ok(slobby({ you: { joined: true, ready: true } })));
    });
    const ready = vi.fn(async (_c: string, r: boolean) => ok(slobby({ you: { joined: true, ready: r } })));
    renderLobby(fakeClient({ join: async () => ok(slobby({ you: { joined: true, ready: false } })), get, ready }));
    fireEvent.change(screen.getByLabelText("رمز الغرفة"), { target: { value: "K7MX4P" } });
    fireEvent.click(screen.getByRole("button", { name: "انضمام" }));
    await screen.findByRole("button", { name: "أنا جاهز" });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));       // the first poll GET is in flight (held pending)

    fireEvent.click(screen.getByRole("button", { name: "أنا جاهز" }));  // busy=true → polling tears down; ready(true) runs
    await screen.findByRole("button", { name: /جاهز ✓/ });          // ready(true) resolved first → UI is ready
    expect(ready).toHaveBeenLastCalledWith("K7MX4P", true);

    releaseStaleGet(ok(slobby({ you: { joined: true, ready: false } })));  // the OLD poll finally resolves (stale ready:false)
    await new Promise(r => setTimeout(r, 20));
    expect(screen.getByRole("button", { name: /جاهز ✓/ })).toBeTruthy();   // UI MUST remain ready — stale poll ignored
    expect(screen.queryByRole("button", { name: "أنا جاهز" })).toBeNull();
  });

  it("when the teacher has closed the room, the poll surfaces the closed state (no ready toggle) and stops polling", async () => {
    // join succeeds (open), then the very first poll returns a CLOSED room → the UI flips to closed and the gate stops.
    const get = vi.fn(async () => ok(slobby({ status: "closed", closedAt: "z" })));
    renderLobby(fakeClient({ join: async () => ok(slobby()), get }));
    fireEvent.change(screen.getByLabelText("رمز الغرفة"), { target: { value: "K7MX4P" } });
    fireEvent.click(screen.getByRole("button", { name: "انضمام" }));
    expect(await screen.findByText("تم إغلاق هذه الغرفة.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "أنا جاهز" })).toBeNull();   // no ready toggle once closed
    const after = get.mock.calls.length;
    await new Promise(r => setTimeout(r, 80));                                // gate stops once not lobby/active → no further gets
    expect(get.mock.calls.length).toBe(after);
  });
});

// ── Phase 4B — live round: answer, lock, next round, finished, reconnect, race ──────────────────────────────────
const Q1: Question = { examQuestionId: "q1", presentationType: "multipleChoice", text: "عاصمة الأردن؟", marks: 1, options: [{ text: "عمّان" }, { text: "إربد" }] };
const Q2: Question = { examQuestionId: "q2", presentationType: "multipleChoice", text: "أكبر كوكب؟", marks: 1, options: [{ text: "المشتري" }, { text: "الأرض" }] };
type You = StudentLobby["you"];
const sActive = (roundVersion: number, q: Question, you: You = { joined: true, ready: true, answered: false }): StudentLobby =>
  slobby({ status: "active", you, round: { roundVersion, questionNumber: roundVersion, questionCount: 2, questionStartedAt: null, question: q } });
const answeredYou = (index: number): You => ({ joined: true, ready: true, answered: true, submission: { response: { kind: "choice", index }, submittedAt: "a" } });

describe("StudentLiveLobby — live round (Phase 4B)", () => {
  async function enterActive(client: StudentLiveSessionClient) {
    renderLobby(client);
    fireEvent.change(screen.getByLabelText("رمز الغرفة"), { target: { value: "K7MX4P" } });
    fireEvent.click(screen.getByRole("button", { name: "انضمام" }));
    await screen.findByText("عاصمة الأردن؟");                     // poll delivered the active round question
  }
  it("teacher starts → the current question appears → إرسال locks the answer and shows the waiting message", async () => {
    // Realistic server: once answered, get() reflects the locked state (an always-unanswered mock would let the next
    // poll clobber the lock — the same Fix 2 realism as the ready toggle).
    let server = sActive(1, Q1);
    const answer = vi.fn(async () => { server = sActive(1, Q1, answeredYou(0)); return ok(server); });
    const get = vi.fn(async () => ok(server));
    await enterActive(fakeClient({ join: async () => ok(slobby()), get, answer }));
    // submit disabled until an answer is chosen
    expect((screen.getByRole("button", { name: "إرسال الإجابة" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getAllByRole("radio")[0]);            // choose عمّان (index 0)
    expect((screen.getByRole("button", { name: "إرسال الإجابة" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "إرسال الإجابة" }));
    expect(await screen.findByText("تم تسجيل إجابتك — بانتظار السؤال التالي.")).toBeTruthy();
    expect(answer).toHaveBeenLastCalledWith("K7MX4P", 1, { kind: "choice", index: 0 });   // server-authoritative round + response
    expect(screen.queryByRole("button", { name: "إرسال الإجابة" })).toBeNull();            // locked
  });
  it("a new round from the poll replaces the question and clears the previous answer lock", async () => {
    // Real timers: the immediate poll shows round 1 (already answered → locked); when the teacher advances, the next
    // interval poll delivers round 2 and the draft resets (submit available again). The old question is gone.
    let server = sActive(1, Q1, answeredYou(0));
    const get = vi.fn(async () => ok(server));
    render(<StudentLiveLobby token="stu" onBack={vi.fn()} client={fakeClient({ join: async () => ok(slobby()), get })} />);
    fireEvent.change(screen.getByLabelText("رمز الغرفة"), { target: { value: "K7MX4P" } });
    fireEvent.click(screen.getByRole("button", { name: "انضمام" }));
    await screen.findByText("عاصمة الأردن؟");                    // round 1 (locked)
    expect(screen.getByText("تم تسجيل إجابتك — بانتظار السؤال التالي.")).toBeTruthy();
    server = sActive(2, Q2);                                     // teacher advanced to round 2
    await screen.findByText("أكبر كوكب؟", {}, { timeout: 2600 });   // delivered by the next interval poll
    expect(screen.queryByText("عاصمة الأردن؟")).toBeNull();      // old question gone
    expect(screen.getByRole("button", { name: "إرسال الإجابة" })).toBeTruthy();   // submit available again (draft reset)
  });
  it("the finished state is surfaced from the poll", async () => {
    const get = vi.fn(async () => ok(slobby({ status: "finished", closedAt: null })));
    renderLobby(fakeClient({ join: async () => ok(slobby()), get }));
    fireEvent.change(screen.getByLabelText("رمز الغرفة"), { target: { value: "K7MX4P" } });
    fireEvent.click(screen.getByRole("button", { name: "انضمام" }));
    expect(await screen.findByText("انتهى التحدّي — شكرًا لمشاركتك.")).toBeTruthy();
  });

  it("reconnect: a remembered room that is active-and-answered restores the locked submission from the server", async () => {
    try { sessionStorage.setItem("eb-lc-student-room", "K7MX4P"); } catch { /* ignore */ }
    const get = vi.fn(async () => ok(sActive(1, Q1, answeredYou(1))));
    renderLobby(fakeClient({ get }));
    expect(await screen.findByText("عاصمة الأردن؟")).toBeTruthy();     // restored active round without re-joining
    expect(screen.getByText("تم تسجيل إجابتك — بانتظار السؤال التالي.")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("K7MX4P");
  });
  it("reconnect: a stale/forbidden remembered room clears the pointer and stays on the join screen", async () => {
    try { sessionStorage.setItem("eb-lc-student-room", "K7MX4P"); } catch { /* ignore */ }
    const get = vi.fn(async () => ({ ok: false, status: 403 } as StudentLiveSessionResult));
    renderLobby(fakeClient({ get }));
    await waitFor(() => expect(get).toHaveBeenCalledWith("K7MX4P"));
    expect(screen.getByRole("button", { name: "انضمام" })).toBeTruthy();   // still the join screen
    expect(sessionStorage.getItem("eb-lc-student-room")).toBeNull();       // stale pointer cleared
  });

  it("a stale in-flight poll cannot re-open the answer after a submit (Fix 2 for answer)", async () => {
    // Join lands directly in the active round (unanswered); the FIRST poll GET is held pending. The student submits; the
    // answer(...) resolves first (locked). When the OLD GET finally resolves unanswered it MUST be dropped — the answer
    // stays locked. Removing the `!busy` poll gate makes this fail.
    let releaseStale: (v: StudentLiveSessionResult) => void = () => {};
    const staleGet = new Promise<StudentLiveSessionResult>(res => { releaseStale = res; });
    let n = 0;
    const get = vi.fn(() => { n += 1; return n === 1 ? staleGet : Promise.resolve(ok(sActive(1, Q1, answeredYou(0)))); });
    const answer = vi.fn(async () => ok(sActive(1, Q1, answeredYou(0))));
    renderLobby(fakeClient({ join: async () => ok(sActive(1, Q1)), get, answer }));
    fireEvent.change(screen.getByLabelText("رمز الغرفة"), { target: { value: "K7MX4P" } });
    fireEvent.click(screen.getByRole("button", { name: "انضمام" }));
    await screen.findByText("عاصمة الأردن؟");
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));      // first poll GET is in flight (held)
    fireEvent.click(screen.getAllByRole("radio")[0]);
    fireEvent.click(screen.getByRole("button", { name: "إرسال الإجابة" }));
    expect(await screen.findByText("تم تسجيل إجابتك — بانتظار السؤال التالي.")).toBeTruthy();   // answer resolved → locked
    releaseStale(ok(sActive(1, Q1)));                              // OLD poll resolves UNANSWERED
    await new Promise(r => setTimeout(r, 20));
    expect(screen.getByText("تم تسجيل إجابتك — بانتظار السؤال التالي.")).toBeTruthy();   // still locked — stale poll ignored
    expect(screen.queryByRole("button", { name: "إرسال الإجابة" })).toBeNull();
  });
});

describe("StudentLiveLobby — recovery lifecycle (review fix)", () => {
  it("normal navigation away KEEPS the reconnect hint (server revalidates on reopen)", async () => {
    renderLobby(fakeClient());
    fireEvent.change(screen.getByLabelText("رمز الغرفة"), { target: { value: "K7MX4P" } });
    fireEvent.click(screen.getByRole("button", { name: "انضمام" }));
    await screen.findByText("تم انضمامك — بانتظار بدء المعلم.");
    expect(sessionStorage.getItem("eb-lc-student-room")).toBe("K7MX4P");
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى الألعاب" }));   // رجوع
    expect(sessionStorage.getItem("eb-lc-student-room")).toBe("K7MX4P");           // hint retained
  });
  it("reconnect: a remembered room the server reports CLOSED clears the hint and stays on the join screen", async () => {
    try { sessionStorage.setItem("eb-lc-student-room", "K7MX4P"); } catch { /* ignore */ }
    const get = vi.fn(async () => ok(slobby({ status: "closed", closedAt: "z" })));
    renderLobby(fakeClient({ get }));
    await waitFor(() => expect(get).toHaveBeenCalledWith("K7MX4P"));
    expect(screen.getByRole("button", { name: "انضمام" })).toBeTruthy();           // never restored a closed room
    expect(sessionStorage.getItem("eb-lc-student-room")).toBeNull();               // hint cleared
  });
  it("reconnect: a remembered FINISHED room is still resumable in Phase 4B", async () => {
    try { sessionStorage.setItem("eb-lc-student-room", "K7MX4P"); } catch { /* ignore */ }
    const get = vi.fn(async () => ok(slobby({ status: "finished", closedAt: null })));
    renderLobby(fakeClient({ get }));
    expect(await screen.findByText("انتهى التحدّي — شكرًا لمشاركتك.")).toBeTruthy();
    expect(sessionStorage.getItem("eb-lc-student-room")).toBe("K7MX4P");           // finished stays resumable
  });
});
