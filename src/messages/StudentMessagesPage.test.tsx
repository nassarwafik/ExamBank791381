// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, act, within, waitFor } from "@testing-library/react";
import StudentMessagesPage from "./StudentMessagesPage";
import { MessagesHttpError, type MessageView, type StudentMessagesClient, type StudentMessagesData } from "./messagesClient";

// Phase 5C — the student's dedicated messages view (injected client; deterministic deferreds).

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}
let seq = 0;
const msg = (body: string, senderRole: "teacher" | "student", senderDisplayName: string, kind: "direct" | "announcement" = "direct"): MessageView =>
  ({ messageId: String(1700000000000 + ++seq) + "-bbbbbbbbbbbbbbbb", kind, senderRole, senderDisplayName, body, createdAt: new Date(1700000000000 + seq * 1000).toISOString() });
const data = (over: Partial<StudentMessagesData> = {}): StudentMessagesData => ({
  direct: [msg("كيف حالك؟", "teacher", "أ. أحمد"), msg("بخير شكرًا", "student", "سارة")],
  announcements: [msg("اختبار يوم الأحد", "teacher", "أ. أحمد", "announcement")],
  classroom: { classId: "c1", name: "الصف الحادي عشر", archived: false }, canSend: true, readOnlyReason: "", ...over
});
const makeClient = (over: Partial<StudentMessagesClient> = {}): StudentMessagesClient => ({
  load: vi.fn(async () => data()),
  sendDirect: vi.fn(async (body: string) => msg(body, "student", "سارة")),
  ...over
});
const conv = () => screen.getByRole("list", { name: "المحادثة مع المعلم" });

describe("StudentMessagesPage", () => {
  it("renders the direct conversation with «المعلم» / «أنت» labels and read-only class announcements", async () => {
    render(<StudentMessagesPage token="t" onBack={() => {}} client={makeClient()} />);
    expect(screen.getByRole("heading", { level: 1, name: "الرسائل" })).toBeTruthy();
    await screen.findByText("كيف حالك؟");
    expect(within(conv()).getByText("المعلم — أ. أحمد")).toBeTruthy();
    expect(within(conv()).getByText("أنت")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "إعلانات الصف" }));
    expect(screen.getByRole("tab", { name: "إعلانات الصف" }).getAttribute("aria-selected")).toBe("true");
    expect(within(screen.getByRole("list", { name: "إعلانات الصف" })).getByText("اختبار يوم الأحد")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();                            // no reply inside announcements
  });

  it("reply: failure keeps the text and shows an error; success clears it and shows the server-confirmed reply", async () => {
    const client = makeClient({ sendDirect: vi.fn().mockRejectedValueOnce(new Error("تعذر إرسال الرسالة.")).mockImplementationOnce(async (body: string) => msg(body, "student", "سارة")) });
    render(<StudentMessagesPage token="t" onBack={() => {}} client={client} />);
    await screen.findByText("كيف حالك؟");
    const box = screen.getByRole("textbox", { name: "رسالتك إلى المعلم" }) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "لم أفهم السؤال الثالث" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "إرسال" })); });
    expect(screen.getByRole("alert").textContent).toContain("تعذر إرسال الرسالة.");
    expect(box.value).toBe("لم أفهم السؤال الثالث");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "إرسال" })); });
    await waitFor(() => expect(within(conv()).getByText("لم أفهم السؤال الثالث")).toBeTruthy());
    expect((screen.getByRole("textbox", { name: "رسالتك إلى المعلم" }) as HTMLTextAreaElement).value).toBe("");
    expect(client.sendDirect).toHaveBeenLastCalledWith("لم أفهم السؤال الثالث");  // body only — no recipient
  });

  it("an archived class: history readable, no composer, the read-only reason shown", async () => {
    const client = makeClient({ load: vi.fn(async () => data({ canSend: false, readOnlyReason: "هذا الصف مؤرشف. الرسائل السابقة متاحة للقراءة فقط.", classroom: { classId: "c1", name: "الصف", archived: true } })) });
    render(<StudentMessagesPage token="t" onBack={() => {}} client={client} />);
    await screen.findByText("كيف حالك؟");
    expect(screen.getByText("هذا الصف مؤرشف. الرسائل السابقة متاحة للقراءة فقط.")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("a 401 degrades locally (error line) and never calls onBack / logs out", async () => {
    const onBack = vi.fn();
    render(<StudentMessagesPage token="t" onBack={onBack} client={makeClient({ load: vi.fn(async () => { throw new MessagesHttpError("Unauthorized", 401); }) })} />);
    expect((await screen.findByRole("alert")).textContent).toContain("تعذر التحقق من الجلسة");
    expect(onBack).not.toHaveBeenCalled();
  });

  it("polls every 5s, and a poll that started BEFORE a reply cannot erase the reply; polling stops on unmount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const oldPoll = deferred<StudentMessagesData>();
    let calls = 0;
    const load = vi.fn(() => (++calls === 2 ? oldPoll.promise : Promise.resolve(data())));
    const view = render(<StudentMessagesPage token="t" onBack={() => {}} client={makeClient({ load })} />);
    await screen.findByText("كيف حالك؟");
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });          // poll #2 starts and hangs
    expect(calls).toBe(2);
    fireEvent.change(screen.getByRole("textbox", { name: "رسالتك إلى المعلم" }), { target: { value: "ردّي الجديد" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "إرسال" })); });
    await waitFor(() => expect(within(conv()).getByText("ردّي الجديد")).toBeTruthy());
    await act(async () => { oldPoll.resolve(data()); });                          // stale snapshot WITHOUT the reply
    expect(within(conv()).getByText("ردّي الجديد")).toBeTruthy();
    view.unmount();
    load.mockClear();
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    expect(load).not.toHaveBeenCalled();
  });
});
