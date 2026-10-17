// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, act, within, waitFor } from "@testing-library/react";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import TeacherMessagesPage from "./TeacherMessagesPage";
import StudentMessagesPage from "./StudentMessagesPage";
import { MessageComposer, MessageThread } from "./MessageParts";
import { MessagesHttpError, type MessageView, type StudentMessagesClient, type TeacherMessagesClient, type ThreadState } from "./messagesClient";
import { GROUP_GAP_MS, avatarTone, dayLabel, foldSearch, initialsOf, layoutThread, localDayKey, rosterView } from "./threadLayout";
import type { Classroom, Student } from "../students/types";

// Messages M.2 — presentation and comfort on the messaging pages: day separators + grouping, the announcements feed,
// Ctrl+Enter, per-thread drafts, roster search / unread filter / unread-first order, quiet «نشط», the class start
// state and the session-expired text. Selection, polling, acknowledgement and send rules are pinned by the 5C–5E suites.

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const NOW = new Date(2026, 9, 17, 12, 0, 0).getTime();          // local noon, 17 Oct 2026
const at = (daysAgo: number, h: number, m = 0) => new Date(2026, 9, 17 - daysAgo, h, m, 0).toISOString();
let seq = 0;
const msg = (body: string, senderRole: "teacher" | "student", createdAt: string, name = senderRole === "teacher" ? "أ. أحمد" : "سارة"): MessageView =>
  ({ messageId: String(9000000000000 + ++seq) + "-aaaaaaaaaaaaaaaa", kind: "direct", senderRole, senderDisplayName: name, body, createdAt });
const cls = (classId: string, name: string, over: Partial<Classroom> = {}): Classroom => ({ classId, name, grade: "11", schoolYear: "2026", active: true, studentCount: 3, createdAt: "", ...over });
const stu = (userId: string, displayName: string, over: Partial<Student> = {}): Student => ({ userId, displayName, code: "", identityNumber: "", firstName: "", familyName: "", classId: "c1", active: true, archived: false, createdAt: "", updatedAt: "", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 0, ...over });
const thread = (messages: MessageView[], canSend = true, readOnlyReason = ""): ThreadState => ({ messages, canSend, readOnlyReason });

function makeClient(over: Partial<TeacherMessagesClient> = {}): TeacherMessagesClient {
  return {
    listClasses: vi.fn(async () => [cls("c1", "الحادي عشر"), cls("c2", "العاشر"), cls("c3", "صف قديم", { status: "archived", active: false })]),
    listStudents: vi.fn(async () => [stu("s1", "سارة"), stu("s2", "خالد", { active: false }), stu("s3", "ليلى", { archived: true }), stu("s4", "أحمد علي")]),
    getDirect: vi.fn(async () => thread([msg("مرحبا", "teacher", at(0, 9))])),
    getAnnouncements: vi.fn(async () => thread([{ ...msg("اختبار الأحد", "teacher", at(0, 8)), kind: "announcement" as const }])),
    sendDirect: vi.fn(async (_s: string, body: string) => msg(body, "teacher", at(0, 11))),
    sendAnnouncement: vi.fn(async (_c: string, body: string) => ({ ...msg(body, "teacher", at(0, 11)), kind: "announcement" as const })),
    getClassUnread: vi.fn(async () => ({ totalUnread: 0, capped: false, byStudent: {} })),
    markDirectRead: vi.fn(async () => ({ unread: 0, capped: false })),
    ...over
  };
}
async function openClass(classId = "c1") {
  fireEvent.change(await screen.findByRole("combobox", { name: "الصف" }), { target: { value: classId } });
  return screen.findByRole("list", { name: "طلاب الصف" });
}
const names = (roster: HTMLElement) => within(roster).getAllByRole("button").map(b => b.querySelector(".eb-msg-roster-name")?.textContent);
const box = () => screen.getByRole("textbox", { name: "رسالة إلى الطالب" }) as HTMLTextAreaElement;

describe("threadLayout (pure)", () => {
  it("day labels: today, yesterday, a long date; the local calendar day decides", () => {
    expect(dayLabel(at(0, 0, 5), NOW)).toBe("اليوم");
    expect(dayLabel(at(1, 23, 59), NOW)).toBe("أمس");
    expect(dayLabel(at(3, 10), NOW)).not.toMatch(/^(اليوم|أمس)$/);
    expect(dayLabel(at(3, 10), NOW).length).toBeGreaterThan(3);
    expect(dayLabel("not a date", NOW)).toBe("");
    expect(localDayKey(at(0, 0, 5))).toBe("2026-10-17");
  });

  it("groups consecutive messages of one sender within the gap on the same day; any change starts a new group", () => {
    const a = msg("1", "student", at(1, 10));
    const b = msg("2", "student", at(1, 10, 3));                       // same sender, 3 min → continued
    const c = msg("3", "teacher", at(1, 10, 4));                       // other sender → new group
    const d = msg("4", "teacher", new Date(Date.parse(at(1, 10, 4)) + GROUP_GAP_MS + 1000).toISOString());   // > gap
    const e = msg("5", "teacher", at(0, 9));                           // new day → separator + new group
    const rows = layoutThread([a, b, c, d, e], NOW);
    expect(rows.map(r => r.continued)).toEqual([false, true, false, false, false]);
    expect(rows.map(r => r.day)).toEqual(["أمس", "", "", "", "اليوم"]);
    const renamed = layoutThread([msg("x", "student", at(0, 9), "سارة"), msg("y", "student", at(0, 9, 1), "ليلى")], NOW);
    expect(renamed[1].continued).toBe(false);                          // same role, different person → never merged
  });

  it("initials skip honorifics; tones are stable; search folds Arabic variants and digits", () => {
    expect(initialsOf("أ. أحمد")).toBe("أ");
    expect(initialsOf("سارة محمود خالد")).toBe("سم");
    expect(initialsOf("  ")).toBe("؟");
    expect(avatarTone("s1")).toBe(avatarTone("s1"));
    expect(avatarTone("s1")).toBeGreaterThanOrEqual(0);
    expect(avatarTone("s1")).toBeLessThan(5);
    expect(foldSearch("أَحْمَد")).toBe("احمد");
    expect(foldSearch("إيمان")).toBe(foldSearch("ايمان"));
    expect(foldSearch("فاطمة")).toBe(foldSearch("فاطمه"));
    expect(foldSearch("منى")).toBe(foldSearch("مني"));
    expect(foldSearch("صف ١١")).toBe("صف 11");
  });

  it("rosterView: unread first (more first), others in server order; search and the unread filter only narrow", () => {
    const list = [stu("a", "أمل"), stu("b", "بشرى"), stu("c", "جنى"), stu("d", "دانة")];
    const unread = { c: { unread: 1, capped: false }, d: { unread: 5, capped: false } };
    expect(rosterView(list, unread, "", "all").map(s => s.userId)).toEqual(["d", "c", "a", "b"]);
    expect(rosterView(list, unread, "", "unread").map(s => s.userId)).toEqual(["d", "c"]);
    expect(rosterView(list, unread, "امل", "all").map(s => s.userId)).toEqual(["a"]);
    expect(rosterView(list, { a: { unread: 0, capped: true } }, "", "all")[0].userId).toBe("a");   // capped = 99+
    expect(list.map(s => s.userId)).toEqual(["a", "b", "c", "d"]);                                   // input untouched
  });
});

describe("MessageThread presentation", () => {
  const props = { labelFor: (m: MessageView) => (m.senderRole === "teacher" ? "أنت" : m.senderDisplayName), isMine: (m: MessageView) => m.senderRole === "teacher", emptyText: "-", ariaLabel: "المحادثة", nowMs: NOW };

  it("draws a day separator per day, keeps every sender label for assistive tech, and the clock time with the full stamp", () => {
    render(<MessageThread {...props} messages={[msg("أ", "student", at(1, 10)), msg("ب", "student", at(1, 10, 1)), msg("ج", "teacher", at(0, 9))]} />);
    const items = within(screen.getByRole("list", { name: "المحادثة" })).getAllByRole("listitem");
    expect(items).toHaveLength(3);                                                   // separators live inside the rows
    expect(items[0].querySelector(".eb-msg-day")?.textContent).toBe("أمس");
    expect(items[1].querySelector(".eb-msg-day")).toBeNull();
    expect(items[2].querySelector(".eb-msg-day")?.textContent).toBe("اليوم");
    expect(items[1].className).toContain("is-continued");
    expect(within(items[1]).getByText("سارة").closest(".eb-visually-hidden")).toBeTruthy();   // hidden, not removed
    expect(within(items[0]).getByText("سارة").closest(".eb-visually-hidden")).toBeNull();
    const time = items[2].querySelector("time") as HTMLTimeElement;
    expect(time.dateTime).toBe(at(0, 9));
    expect(time.title.length).toBeGreaterThan(0);
    expect(items[2].querySelector(".eb-msg-bubble .eb-msg-body")?.textContent).toBe("ج");
  });

  it("the feed variant marks the list (announcement cards); the default stays a chat", () => {
    const view = render(<MessageThread {...props} messages={[msg("إعلان", "teacher", at(0, 9))]} variant="feed" />);
    expect(screen.getByRole("list", { name: "المحادثة" }).className).toContain("is-feed");
    view.rerender(<MessageThread {...props} messages={[msg("إعلان", "teacher", at(0, 9))]} />);
    expect(screen.getByRole("list", { name: "المحادثة" }).className).not.toContain("is-feed");
  });
});

describe("MessageComposer — Ctrl/⌘+Enter", () => {
  function Probe({ sending = false, value = "نص" }: { sending?: boolean; value?: string }) {
    return <MessageComposer label="رسالة" buttonLabel="إرسال" value={value} onChange={() => {}} onSend={onSend} sending={sending} error="" />;
  }
  let onSend = vi.fn();
  it("Ctrl+Enter and ⌘+Enter send; plain Enter, an IME composition, an empty text or a send in flight never do", () => {
    onSend = vi.fn();
    const view = render(<Probe />);
    const ta = screen.getByRole("textbox", { name: "رسالة" });
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(ta, { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(ta, { key: "Enter", metaKey: true });
    expect(onSend).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(ta, { key: "Enter", ctrlKey: true, isComposing: true });
    expect(onSend).toHaveBeenCalledTimes(2);
    view.rerender(<Probe value="   " />);
    fireEvent.keyDown(ta, { key: "Enter", ctrlKey: true });
    view.rerender(<Probe sending />);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "رسالة" }), { key: "Enter", ctrlKey: true });
    expect(onSend).toHaveBeenCalledTimes(2);
    expect(ta.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(ta.getAttribute("aria-describedby") as string)?.textContent).toContain("Ctrl + Enter");
  });
});

describe("teacher page — drafts per thread", () => {
  it("a draft survives switching to another student, the announcements tab and another class; a sent message's draft is dropped", async () => {
    const client = makeClient();
    render(<TeacherMessagesPage token="t" client={client} />);
    const roster = await openClass();
    fireEvent.click(within(roster).getByRole("button", { name: /سارة/ }));
    await screen.findByText("مرحبا");
    fireEvent.change(box(), { target: { value: "مسودة سارة" } });
    fireEvent.click(within(roster).getByRole("button", { name: /أحمد علي/ }));
    await waitFor(() => expect(box().value).toBe(""));                               // another thread → its own draft
    fireEvent.change(box(), { target: { value: "مسودة أحمد" } });
    fireEvent.click(screen.getByRole("tab", { name: "إعلانات الصف" }));
    const ann = await screen.findByRole("textbox", { name: "إعلان جديد للصف" }) as HTMLTextAreaElement;
    expect(ann.value).toBe("");
    fireEvent.change(ann, { target: { value: "مسودة إعلان" } });
    fireEvent.click(screen.getByRole("tab", { name: "محادثات الطلاب" }));
    await waitFor(() => expect(box().value).toBe("مسودة أحمد"));
    fireEvent.click(within(screen.getByRole("list", { name: "طلاب الصف" })).getByRole("button", { name: /سارة/ }));
    await waitFor(() => expect(box().value).toBe("مسودة سارة"));
    // send Sara's draft: it is published and dropped, so coming back starts empty
    fireEvent.click(screen.getByRole("button", { name: "إرسال" }));
    await waitFor(() => expect(within(screen.getByRole("list", { name: "المحادثة" })).getByText("مسودة سارة")).toBeTruthy());
    fireEvent.click(within(screen.getByRole("list", { name: "طلاب الصف" })).getByRole("button", { name: /أحمد علي/ }));
    await waitFor(() => expect(box().value).toBe("مسودة أحمد"));
    fireEvent.click(within(screen.getByRole("list", { name: "طلاب الصف" })).getByRole("button", { name: /سارة/ }));
    await waitFor(() => expect(box().value).toBe(""));
    fireEvent.click(screen.getByRole("tab", { name: "إعلانات الصف" }));
    expect((await screen.findByRole("textbox", { name: "إعلان جديد للصف" }) as HTMLTextAreaElement).value).toBe("مسودة إعلان");
  });
});

describe("teacher page — roster search, unread filter and order", () => {
  it("unread students first; search narrows (Arabic-folded); the unread filter shows only unread; selection is untouched", async () => {
    const client = makeClient({ getClassUnread: vi.fn(async () => ({ totalUnread: 3, capped: false, byStudent: { s3: { unread: 1, capped: false }, s4: { unread: 2, capped: false } } })) });
    render(<TeacherMessagesPage token="t" client={client} />);
    const roster = await openClass();
    await waitFor(() => expect(names(roster)).toEqual(["أحمد علي", "ليلى", "سارة", "خالد"]));
    fireEvent.click(within(roster).getByRole("button", { name: /سارة/ }));
    await screen.findByText("مرحبا");
    const search = screen.getByRole("searchbox", { name: "ابحث عن طالب" });
    fireEvent.change(search, { target: { value: "احمد" } });                          // typed without hamza
    expect(names(screen.getByRole("list", { name: "طلاب الصف" }))).toEqual(["أحمد علي"]);
    expect(screen.getByRole("heading", { name: "المحادثة مع سارة" })).toBeTruthy();   // still Sara's conversation
    fireEvent.change(search, { target: { value: "زينب" } });
    expect(screen.getByText("لا يوجد طالب بهذا الاسم.")).toBeTruthy();
    fireEvent.change(search, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /غير المقروءة/ }));
    expect(names(screen.getByRole("list", { name: "طلاب الصف" }))).toEqual(["أحمد علي", "ليلى"]);
    expect(screen.getByRole("button", { name: /غير المقروءة/ }).getAttribute("aria-pressed")).toBe("true");
    expect(client.getDirect).toHaveBeenCalledTimes(1);                                // filtering never loads a thread
    // a class switch resets the search and the filter (both set right before the switch)
    fireEvent.change(screen.getByRole("searchbox", { name: "ابحث عن طالب" }), { target: { value: "ليلى" } });
    expect(names(screen.getByRole("list", { name: "طلاب الصف" }))).toEqual(["ليلى"]);
    fireEvent.change(screen.getByRole("combobox", { name: "الصف" }), { target: { value: "c2" } });
    await screen.findByRole("list", { name: "طلاب الصف" });
    await waitFor(() => expect(screen.getByRole("button", { name: "الكل" }).getAttribute("aria-pressed")).toBe("true"));
    expect((screen.getByRole("searchbox", { name: "ابحث عن طالب" }) as HTMLInputElement).value).toBe("");
    expect(names(screen.getByRole("list", { name: "طلاب الصف" }))).toEqual(["أحمد علي", "ليلى", "سارة", "خالد"]);
  });

  it("«نشط» stays in the accessible name but is not drawn; disabled / archived are drawn; avatars are decorative", async () => {
    render(<TeacherMessagesPage token="t" client={makeClient()} />);
    const roster = await openClass();
    const sara = within(roster).getByRole("button", { name: /سارة\s*نشط/ });
    expect(within(sara).getByText("نشط").closest(".eb-visually-hidden")).toBeTruthy();
    const khalid = within(roster).getByRole("button", { name: /خالد\s*معطّل/ });
    expect(within(khalid).getByText("معطّل").closest(".eb-visually-hidden")).toBeNull();
    expect(sara.querySelector(".eb-msg-avatar")?.getAttribute("aria-hidden")).toBe("true");
    expect(sara.querySelector(".eb-msg-avatar")?.textContent).toBe("س");
  });
});

describe("teacher page — start state and session expiry", () => {
  it("before a class is chosen: a start card with the ACTIVE classes as quick picks (archived only in the selector)", async () => {
    const client = makeClient();
    render(<TeacherMessagesPage token="t" client={client} />);
    const picks = await screen.findByRole("group", { name: "صفوفك" });
    expect(within(picks).getAllByRole("button").map(b => b.textContent)).toEqual(["الحادي عشر", "العاشر"]);
    fireEvent.click(within(picks).getByRole("button", { name: "العاشر" }));
    await screen.findByRole("list", { name: "طلاب الصف" });
    expect(client.listStudents).toHaveBeenCalledWith("c2");
    expect((screen.getByRole("combobox", { name: "الصف" }) as HTMLSelectElement).value).toBe("c2");
    expect(screen.queryByRole("group", { name: "صفوفك" })).toBeNull();
  });

  it("no classes at all: an explanatory empty state instead of an empty selector only", async () => {
    render(<TeacherMessagesPage token="t" client={makeClient({ listClasses: vi.fn(async () => []) })} />);
    expect(await screen.findByText("لا توجد صفوف بعد.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "صفوفك" })).toBeNull();
  });

  it("a 401 shows the session-expired text, never the raw server error", async () => {
    const client = makeClient({ getDirect: vi.fn(async () => { throw new MessagesHttpError("Unauthorized", 401); }) });
    render(<TeacherMessagesPage token="t" client={client} />);
    fireEvent.click(within(await openClass()).getByRole("button", { name: /سارة/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("انتهت صلاحية الجلسة. سجّل الدخول من جديد ثم أعد المحاولة.");
    expect(screen.queryByText("Unauthorized")).toBeNull();
  });
});

describe("student page", () => {
  it("announcements render as a feed; Ctrl+Enter sends the reply once", async () => {
    const U = { directUnread: { unread: 0, capped: false }, announcementUnread: { unread: 0, capped: false }, totalUnread: 0, totalCapped: false };
    const client: StudentMessagesClient = {
      load: vi.fn(async () => ({ direct: [msg("مرحبا", "teacher", at(0, 9))], announcements: [{ ...msg("اختبار", "teacher", at(0, 8)), kind: "announcement" as const }], classroom: { classId: "c1", name: "ص", archived: false }, canSend: true, readOnlyReason: "" })),
      sendDirect: vi.fn(async (body: string) => msg(body, "student", at(0, 10))), getUnread: vi.fn(async () => U), markRead: vi.fn(async () => U)
    };
    render(<StudentMessagesPage token="t" onBack={() => {}} client={client} />);
    const ta = await screen.findByLabelText("رسالتك إلى المعلم");
    fireEvent.change(ta, { target: { value: "شكرًا" } });
    await act(async () => { fireEvent.keyDown(ta, { key: "Enter", ctrlKey: true }); });
    await waitFor(() => expect(client.sendDirect).toHaveBeenCalledTimes(1));
    expect(client.sendDirect).toHaveBeenCalledWith("شكرًا", expect.any(String));
    fireEvent.click(screen.getByRole("tab", { name: /إعلانات الصف/ }));
    expect((await screen.findByRole("list", { name: "إعلانات الصف" })).className).toContain("is-feed");
  });
});

describe("M.2 styles (CSS is stubbed under Vitest → source assertions)", () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");   // a variable: not an asset URL
  const css = read("./messages.css");
  it("the own bubble is a solid primary token gradient with surface-coloured text; the new section uses tokens and logical properties only", () => {
    expect(css).toContain(".eb-msg.is-mine .eb-msg-bubble{ background:linear-gradient(160deg, var(--eb-primary), var(--eb-primary-strong)); border-color:transparent; color:var(--eb-surface); }");
    const m2 = css.slice(css.indexOf("Messages M.2 — avatars"));
    expect(m2.length).toBeGreaterThan(200);
    expect(m2).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(m2).not.toMatch(/(?:margin|padding|border)-(?:left|right)\s*:|\b(?:left|right)\s*:/);
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
