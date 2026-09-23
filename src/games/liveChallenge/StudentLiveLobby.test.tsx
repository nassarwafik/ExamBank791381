// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import StudentLiveLobby from "./StudentLiveLobby";
import type { StudentLiveSessionClient, StudentLobby, StudentLiveSessionResult } from "./liveSessionClient";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const slobby = (over: Partial<StudentLobby> = {}): StudentLobby => ({
  sessionId: "K7MX4P", joinCode: "K7MX4P", challengeTitle: "تحدّي الشبكات", status: "lobby",
  you: { joined: true, ready: false }, counts: { total: 2, joined: 1, ready: 0 },
  participants: [{ displayName: "أحمد", joined: true, ready: false }, { displayName: "حلا", joined: false, ready: false }],
  updatedAt: "", closedAt: null, ...over,
});
const ok = (session: StudentLobby): StudentLiveSessionResult => ({ ok: true, status: 200, session });
function fakeClient(over: Partial<StudentLiveSessionClient> = {}): StudentLiveSessionClient {
  return { join: async () => ok(slobby()), get: async () => ok(slobby()), ready: async (_c, ready) => ok(slobby({ you: { joined: true, ready } })), ...over };
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
    const ready = vi.fn(async (_c: string, r: boolean) => ok(slobby({ you: { joined: true, ready: r } })));
    await joinRoom(fakeClient({ ready }));
    fireEvent.click(screen.getByRole("button", { name: "أنا جاهز" }));
    await screen.findByRole("button", { name: /جاهز ✓/ });
    expect(ready).toHaveBeenLastCalledWith("K7MX4P", true);
    fireEvent.click(screen.getByRole("button", { name: /جاهز ✓/ }));
    await waitFor(() => expect(ready).toHaveBeenLastCalledWith("K7MX4P", false));
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
    await new Promise(r => setTimeout(r, 80));                                // gate is status==="lobby" → no further gets
    expect(get.mock.calls.length).toBe(after);
  });
});
