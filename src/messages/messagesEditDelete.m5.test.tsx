// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, within, waitFor } from "@testing-library/react";
import TeacherMessagesPage from "./TeacherMessagesPage";
import StudentMessagesPage from "./StudentMessagesPage";
import { MessagesHttpError, canDeleteMessage, canEditMessage, replaceMessage, type MessageView, type StudentMessagesClient, type TeacherMessagesClient, type ThreadState } from "./messagesClient";
import type { Classroom, Student } from "../students/types";

// Messages M.5 — editing and deleting from the thread. The buttons follow the SERVER's hints only (editableUntil /
// canDelete / deletableUntil); the stored version the server answers replaces the message on screen; a deleted message
// is a placeholder without text; a refused change shows the server's error on the message.

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const FUTURE = new Date(Date.now() + 10 * 60_000).toISOString();
const PAST = new Date(Date.now() - 60_000).toISOString();
const id = (p: number) => String(9000000000000 + p) + "-aaaaaaaaaaaaaaaa";
const msg = (p: number, senderRole: "teacher" | "student", extra: Partial<MessageView> = {}, kind: "direct" | "announcement" = "direct"): MessageView =>
  ({ messageId: id(p), kind, senderRole, senderDisplayName: senderRole === "teacher" ? "أ. أحمد" : "سارة", body: "رسالة " + p, createdAt: new Date(1800000000000 + p * 1000).toISOString(), ...extra });
const cls = (classId: string, name: string): Classroom => ({ classId, name, grade: "11", schoolYear: "2026", active: true, studentCount: 2, createdAt: "" });
const stu = (userId: string, displayName: string): Student => ({ userId, displayName, code: "", identityNumber: "", firstName: "", familyName: "", classId: "c1", active: true, archived: false, createdAt: "", updatedAt: "", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 0 });
const thread = (messages: MessageView[]): ThreadState => ({ messages, canSend: true, readOnlyReason: "" });

function teacherClient(messages: MessageView[], over: Partial<TeacherMessagesClient> = {}): TeacherMessagesClient {
  let current = messages;
  return {
    listClasses: vi.fn(async () => [cls("c1", "الحادي عشر")]),
    listStudents: vi.fn(async () => [stu("s1", "سارة")]),
    getDirect: vi.fn(async () => thread(current)),
    getAnnouncements: vi.fn(async () => thread([msg(9, "teacher", { canDelete: true, editableUntil: FUTURE }, "announcement")])),
    sendDirect: vi.fn(async (_s: string, body: string) => ({ ...msg(99, "teacher"), body })),
    sendAnnouncement: vi.fn(async (_c: string, body: string) => ({ ...msg(99, "teacher", {}, "announcement"), body })),
    getClassUnread: vi.fn(async () => ({ totalUnread: 0, capped: false, byStudent: {} })),
    markDirectRead: vi.fn(async () => ({ unread: 0, capped: false })),
    editMessage: vi.fn(async (_t, messageId: string, body: string) => {
      const next = { ...current.find(m => m.messageId === messageId)!, body, editedAt: new Date().toISOString() };
      current = replaceMessage(current, next);
      return next;
    }),
    deleteMessage: vi.fn(async (_t, messageId: string) => {
      const m = current.find(x => x.messageId === messageId)!;
      const next: MessageView = { ...m, body: "", deleted: true, deletedBy: "teacher", canDelete: undefined, editableUntil: undefined };
      current = replaceMessage(current, next);
      return next;
    }),
    ...over
  };
}
async function openSara() {
  fireEvent.change(await screen.findByRole("combobox", { name: "الصف" }), { target: { value: "c1" } });
  fireEvent.click(within(await screen.findByRole("list", { name: "طلاب الصف" })).getByRole("button", { name: /سارة/ }));
}
const item = (text: string) => screen.getByText(text).closest("li") as HTMLElement;

describe("M.5 — permissions come from the server's hints", () => {
  it("canEditMessage / canDeleteMessage: deadlines, the moderation flag, deleted messages", () => {
    const now = Date.now();
    expect(canEditMessage(msg(1, "teacher", { editableUntil: FUTURE }), now)).toBe(true);
    expect(canEditMessage(msg(1, "teacher", { editableUntil: PAST }), now)).toBe(false);
    expect(canEditMessage(msg(1, "teacher"), now)).toBe(false);
    expect(canDeleteMessage(msg(1, "student", { canDelete: true }), now)).toBe(true);                       // no deadline (teacher)
    expect(canDeleteMessage(msg(1, "student", { canDelete: true, deletableUntil: PAST }), now)).toBe(false);
    expect(canDeleteMessage(msg(1, "student", { canDelete: true, deleted: true }), now)).toBe(false);
  });
});

describe("M.5 — teacher", () => {
  it("MODERATION: deletes a student's message after an explicit confirmation; the text is replaced by a placeholder", async () => {
    const client = teacherClient([msg(1, "student", { body: "كلام غير لائق", canDelete: true }), msg(2, "teacher", { editableUntil: FUTURE, canDelete: true })]);
    render(<TeacherMessagesPage token="t" client={client} />);
    await openSara();
    await screen.findByText("كلام غير لائق");
    fireEvent.click(within(item("كلام غير لائق")).getByRole("button", { name: "حذف الرسالة" }));
    expect(screen.getByRole("group", { name: "تأكيد حذف الرسالة" }).textContent).toContain("سيرى الطالب أن المعلم حذفها");
    expect(client.deleteMessage).not.toHaveBeenCalled();                       // nothing happens before the confirmation
    fireEvent.click(within(screen.getByRole("group", { name: "تأكيد حذف الرسالة" })).getByRole("button", { name: "حذف" }));
    await screen.findByText("حذف المعلم هذه الرسالة.");
    expect(client.deleteMessage).toHaveBeenCalledWith({ studentId: "s1" }, id(1));
    expect(screen.queryByText("كلام غير لائق")).toBeNull();
    expect(screen.getByText("حذف المعلم هذه الرسالة.").closest("li")!.className).toContain("is-deleted");
  });

  it("«إلغاء» closes the confirmation without deleting anything", async () => {
    const client = teacherClient([msg(1, "student", { canDelete: true })]);
    render(<TeacherMessagesPage token="t" client={client} />);
    await openSara();
    await screen.findByText("رسالة 1");
    fireEvent.click(screen.getByRole("button", { name: "حذف الرسالة" }));
    fireEvent.click(within(screen.getByRole("group", { name: "تأكيد حذف الرسالة" })).getByRole("button", { name: "إلغاء" }));
    expect(screen.queryByRole("group", { name: "تأكيد حذف الرسالة" })).toBeNull();
    expect(client.deleteMessage).not.toHaveBeenCalled();
  });

  it("edits their own message inline: prefilled, saved through the server, then marked «مُعدّلة»", async () => {
    const client = teacherClient([msg(1, "student"), msg(2, "teacher", { body: "الاختبار الأحد", editableUntil: FUTURE, canDelete: true })]);
    render(<TeacherMessagesPage token="t" client={client} />);
    await openSara();
    await screen.findByText("الاختبار الأحد");
    expect(within(item("رسالة 1")).queryByRole("button")).toBeNull();          // no hint → no action on the student's message
    fireEvent.click(within(item("الاختبار الأحد")).getByRole("button", { name: "تعديل الرسالة" }));
    const box = screen.getByRole("textbox", { name: "تعديل الرسالة" }) as HTMLTextAreaElement;
    expect(box.value).toBe("الاختبار الأحد");
    fireEvent.change(box, { target: { value: "الاختبار الاثنين" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ التغييرات" }));
    await screen.findByText("الاختبار الاثنين");
    expect(client.editMessage).toHaveBeenCalledWith({ studentId: "s1" }, id(2), "الاختبار الاثنين");
    expect(within(item("الاختبار الاثنين")).getByText("مُعدّلة")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "تعديل الرسالة" })).toBeNull();
  });

  it("Escape cancels an edit; an expired window shows no «تعديل» button", async () => {
    const client = teacherClient([msg(1, "teacher", { editableUntil: FUTURE }), msg(2, "teacher", { body: "قديمة", editableUntil: PAST })]);
    render(<TeacherMessagesPage token="t" client={client} />);
    await openSara();
    await screen.findByText("رسالة 1");
    expect(within(item("قديمة")).queryByRole("button", { name: "تعديل الرسالة" })).toBeNull();
    fireEvent.click(within(item("رسالة 1")).getByRole("button", { name: "تعديل الرسالة" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "تعديل الرسالة" }), { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: "تعديل الرسالة" })).toBeNull();
    expect(client.editMessage).not.toHaveBeenCalled();
  });

  it("a refused edit keeps the editor open and shows the server's error on the message", async () => {
    const client = teacherClient([msg(1, "teacher", { editableUntil: FUTURE })], {
      editMessage: vi.fn(async () => { throw new MessagesHttpError("انتهت مهلة تعديل الرسالة (15 دقيقة من إرسالها).", 403); })
    });
    render(<TeacherMessagesPage token="t" client={client} />);
    await openSara();
    await screen.findByText("رسالة 1");
    fireEvent.click(screen.getByRole("button", { name: "تعديل الرسالة" }));
    fireEvent.change(screen.getByRole("textbox", { name: "تعديل الرسالة" }), { target: { value: "نص جديد" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ التغييرات" }));
    expect((await screen.findByRole("alert")).textContent).toContain("انتهت مهلة تعديل الرسالة");
    expect(screen.getByRole("textbox", { name: "تعديل الرسالة" })).toBeTruthy();
  });

  it("announcements: the delete targets the class and asks about removing it from the class", async () => {
    const client = teacherClient([]);
    render(<TeacherMessagesPage token="t" client={client} />);
    fireEvent.change(await screen.findByRole("combobox", { name: "الصف" }), { target: { value: "c1" } });
    fireEvent.click(await screen.findByRole("tab", { name: /الإعلانات|إعلانات الصف/ }));
    await screen.findByText("رسالة 9");
    fireEvent.click(screen.getByRole("button", { name: "حذف الرسالة" }));
    expect(screen.getByRole("group", { name: "تأكيد حذف الرسالة" }).textContent).toContain("حذف هذا الإعلان نهائيًا من الصف");
    fireEvent.click(within(screen.getByRole("group", { name: "تأكيد حذف الرسالة" })).getByRole("button", { name: "حذف" }));
    await waitFor(() => expect(client.deleteMessage).toHaveBeenCalledWith({ classId: "c1" }, id(9)));
  });

  it("a client without edit / delete support offers no message actions", async () => {
    const client = teacherClient([msg(1, "student", { canDelete: true })], { editMessage: undefined, deleteMessage: undefined });
    render(<TeacherMessagesPage token="t" client={client} />);
    await openSara();
    await screen.findByText("رسالة 1");
    expect(within(item("رسالة 1")).queryByRole("button")).toBeNull();
  });
});

function studentClient(direct: MessageView[], over: Partial<StudentMessagesClient> = {}): StudentMessagesClient {
  let current = direct;
  return {
    load: vi.fn(async () => ({ direct: current, announcements: [], classroom: { classId: "c1", name: "الحادي عشر", archived: false }, canSend: true, readOnlyReason: "" })),
    sendDirect: vi.fn(async (body: string) => ({ ...msg(99, "student"), body })),
    getUnread: vi.fn(async () => ({ directUnread: { unread: 0, capped: false }, announcementUnread: { unread: 0, capped: false }, totalUnread: 0, totalCapped: false })),
    markRead: vi.fn(async () => ({ directUnread: { unread: 0, capped: false }, announcementUnread: { unread: 0, capped: false }, totalUnread: 0, totalCapped: false })),
    editMessage: vi.fn(async (messageId: string, body: string) => {
      const next = { ...current.find(m => m.messageId === messageId)!, body, editedAt: new Date().toISOString() };
      current = replaceMessage(current, next);
      return next;
    }),
    deleteMessage: vi.fn(async (messageId: string) => {
      const next: MessageView = { ...current.find(m => m.messageId === messageId)!, body: "", deleted: true, deletedBy: "student", canDelete: undefined, editableUntil: undefined, deletableUntil: undefined };
      current = replaceMessage(current, next);
      return next;
    }),
    ...over
  };
}

describe("M.5 — student", () => {
  it("edits and deletes their own fresh reply; never a teacher's message", async () => {
    const own = { editableUntil: FUTURE, canDelete: true, deletableUntil: FUTURE };
    const client = studentClient([msg(1, "teacher"), msg(2, "student", { body: "ردي", ...own }), msg(3, "student", { body: "أرسلتها خطأ", ...own })]);
    render(<StudentMessagesPage token="t" onBack={() => {}} client={client} />);
    await screen.findByText("ردي");
    expect(within(item("رسالة 1")).queryByRole("button")).toBeNull();
    fireEvent.click(within(item("ردي")).getByRole("button", { name: "تعديل الرسالة" }));
    fireEvent.change(screen.getByRole("textbox", { name: "تعديل الرسالة" }), { target: { value: "ردي المصحح" } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "تعديل الرسالة" }), { key: "Enter", ctrlKey: true });
    await screen.findByText("ردي المصحح");
    expect(client.editMessage).toHaveBeenCalledWith(id(2), "ردي المصحح");
    fireEvent.click(within(item("أرسلتها خطأ")).getByRole("button", { name: "حذف الرسالة" }));
    fireEvent.click(within(screen.getByRole("group", { name: "تأكيد حذف الرسالة" })).getByRole("button", { name: "حذف" }));
    await screen.findByText("تم حذف هذه الرسالة.");
    expect(client.deleteMessage).toHaveBeenCalledWith(id(3));
    expect(screen.queryByText("أرسلتها خطأ")).toBeNull();
  });

  it("a reply the teacher deleted reads «حذف المعلم هذه الرسالة.», without its text or any action", async () => {
    const client = studentClient([msg(1, "student", { body: "", deleted: true, deletedBy: "teacher" })]);
    render(<StudentMessagesPage token="t" onBack={() => {}} client={client} />);
    const placeholder = await screen.findByText("حذف المعلم هذه الرسالة.");
    expect(within(placeholder.closest("li") as HTMLElement).queryByRole("button")).toBeNull();
  });
});
