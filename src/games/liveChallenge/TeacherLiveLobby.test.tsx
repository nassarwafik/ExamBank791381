// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, within, fireEvent, waitFor, act } from "@testing-library/react";
import TeacherLiveLobby from "./TeacherLiveLobby";
import type { TeacherLiveSessionClient, TeacherLobby } from "./liveSessionClient";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

const lobby = (over: Partial<TeacherLobby> = {}): TeacherLobby => ({
  sessionId: "K7MX4P", joinCode: "K7MX4P", challengeId: "c1", challengeTitle: "تحدّي الشبكات", classId: "cl1", status: "lobby",
  counts: { total: 2, joined: 0, ready: 0 },
  participants: [
    { studentId: "s1", displayName: "أحمد", joined: false, ready: false, joinedAt: null, readyAt: null },
    { studentId: "s2", displayName: "حلا", joined: false, ready: false, joinedAt: null, readyAt: null },
  ],
  createdAt: "", updatedAt: "", closedAt: null, ...over,
});

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
