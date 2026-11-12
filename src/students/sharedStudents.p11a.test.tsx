// @vitest-environment happy-dom
// Tadris+ P11-A — a student the owner added to this teacher's class from ANOTHER teacher's class, on the teacher's and the student's
// screens (test data only). The server is the authority (api/tests/shared-enrollment-p11a.test.js); here the screens only present it:
// the roster marks the student and offers «إزالة من صفي» instead of the account actions; the student dialog explains who manages the
// account; the messaging and live-game pickers do not offer the student; a student in two classes sees each task's class.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
// the row menu opens in a measured frame: its items are in the «إجراءات <name>» group once it is placed
const openMenu = async (row: HTMLElement, name: string) => { fireEvent.click(within(row).getByRole("button", { name: "إجراءات " + name })); return screen.findByRole("group", { name: "إجراءات " + name }); };
import RosterPane, { type RosterPaneProps } from "./RosterPane";
import StudentDialog from "./StudentDialog";
import StudentAssignmentCard from "../student/StudentAssignmentCard";
import MovedStudents from "../assignments/MovedStudents";
import { createTeacherMessagesClient } from "../messages/messagesClient";
import { createTeacherLiveSessionClient } from "../games/liveChallenge/liveSessionClient";
import type { Student } from "./types";
import type { Summary } from "../student/types";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const noop = () => {};
const student = (over: Partial<Student>): Student => ({ userId: "u1", code: "300000001", identityNumber: "300000001", firstName: "ليان", familyName: "سعيد", displayName: "ليان سعيد", classId: "cB", active: true, archived: false, createdAt: "", updatedAt: "", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 0, ...over });
const SHARED = student({ shared: true }), OWN = student({ userId: "u2", identityNumber: "300000002", code: "300000002", firstName: "كريم", familyName: "ناصر", displayName: "كريم ناصر" });
function mountRoster(extra: Partial<RosterPaneProps> = {}) {
  const props = {
    classroom: { classId: "cB", name: "علوم الحاسوب", grade: "12", schoolYear: "2026-2027", active: true, status: "active", studentCount: 2 }, classActive: true,
    students: [SHARED, OWN], visibleStudents: [SHARED, OWN], stats: { total: 2, active: 2, disabled: 0, archived: 0, neverLogged: 2 },
    loading: false, busy: false, searchText: "", onSearch: noop, statusFilter: "all", onStatusFilter: noop, sortKey: "firstName", sortAsc: true, onSort: noop,
    selectedIds: [], onToggleSelected: noop, onToggleSelectVisible: noop, onClearSelection: noop, onAddStudent: noop, onImport: noop, onRefresh: noop, onExportCsv: noop,
    onOpenProfile: noop, onOpenHistory: noop, onEdit: noop, onCopyIdentity: noop, onToggleActive: noop, onArchive: noop, onDelete: noop,
    bulk: { targetClasses: [], targetClassId: "", onTargetChange: noop, onAction: noop }, credentialBox: null, onCopyCredentialBox: noop, onHideCredentialBox: noop,
    credentialBatch: null, onToggleBatch: noop, onDownloadBatch: noop, onDiscardBatch: noop, onCopyCredential: noop, bulkErrors: [],
    statusLabel: () => "فعّال", fmtDate: (v: string) => v, splitName: () => ({ firstName: "", familyName: "" }), ...extra
  } as unknown as RosterPaneProps;
  render(<RosterPane {...props} />);
  const rows = Array.from(document.querySelectorAll(".eb-roster-table tbody tr")) as HTMLElement[];
  return { sharedRow: rows[0], ownRow: rows[1] };
}

describe("P11-A the teacher's roster: a student shared from another teacher", () => {
  it("is marked «من معلم آخر», cannot be selected for bulk actions, and offers only «إزالة من صفي» besides copying the identity number", async () => {
    const onUnenroll = vi.fn(), onEdit = vi.fn();
    const { sharedRow, ownRow } = mountRoster({ onUnenroll, onEdit });
    expect(sharedRow.querySelector("td.eb-col-status")?.textContent).toContain("من معلم آخر");
    expect(ownRow.querySelector("td.eb-col-status")?.textContent).not.toContain("من معلم آخر");
    expect((within(sharedRow).getByRole("checkbox", { name: "تحديد ليان سعيد" }) as HTMLInputElement).disabled).toBe(true);
    expect((within(ownRow).getByRole("checkbox", { name: "تحديد كريم ناصر" }) as HTMLInputElement).disabled).toBe(false);
    const menu = await openMenu(sharedRow, "ليان سعيد");
    expect(within(menu).queryByText("تعديل")).toBeNull();
    expect(within(menu).queryByText("تعطيل الحساب")).toBeNull();
    expect(within(menu).queryByText(/أرشفة/)).toBeNull();
    expect(within(menu).queryByText("حذف نهائي")).toBeNull();
    fireEvent.click(within(menu).getByText("إزالة من صفي"));
    expect(onUnenroll).toHaveBeenCalledWith(SHARED);
    expect(onEdit).not.toHaveBeenCalled();
  });
  it("the teacher's own student keeps every account action, and no «إزالة من صفي»", async () => {
    const { ownRow } = mountRoster({ onUnenroll: vi.fn() });
    const menu = await openMenu(ownRow, "كريم ناصر");
    expect(within(menu).getByText("تعديل")).toBeTruthy();
    expect(within(menu).getByText("حذف نهائي")).toBeTruthy();
    expect(within(menu).queryByText("إزالة من صفي")).toBeNull();
  });
});

describe("P11-A the student dialog of a shared student", () => {
  const profile = (shared: boolean) => ({
    student: student({ shared }), classroom: { classId: "cB", name: "علوم الحاسوب", grade: "12", schoolYear: "2026-2027" },
    stats: { assigned: 0, completed: 0, pending: 0, average: null, lastLoginAt: "" }, assignments: [], submittedAssignmentsCount: 0, submittedAssignments: []
  });
  const mount = (shared: boolean) => render(<StudentDialog profile={profile(shared) as never} section="summary" busy={false} error="" suspended={false} passwordReveal={null} deadlineFor={null} deadlineValue="" fmtDate={(v: string) => v}
    onClose={noop} onResetPassword={noop} onCopyPassword={noop} onReview={noop} onAllowRetry={noop} onDeadlineValue={noop} onOpenDeadline={noop} onCloseDeadline={noop} onSaveDeadline={noop} onClearDeadline={noop} />);
  it("says who manages the account and offers no new password", () => {
    mount(true);
    expect(screen.getByRole("note").textContent).toContain("يديره معلمه الأول أو المالك");
    expect(screen.queryByRole("button", { name: /كلمة مرور جديدة/ })).toBeNull();
  });
  it("the teacher's own student keeps «كلمة مرور جديدة»", () => {
    mount(false);
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.getByRole("button", { name: /كلمة مرور جديدة/ })).toBeTruthy();
  });
});

describe("P11-A surfaces that do not serve shared students yet do not offer them", () => {
  const stub = () => vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, students: [SHARED, OWN] }) }) as unknown as Response));
  // Tadris+ P11-B — the messaging picker now offers the shared student too: they have a separate conversation with this teacher
  // (src/messages/sharedConversations.p11b.test.tsx). Before P11-B the picker listed the teacher's own students only (["u2"]).
  it("the teacher's messaging picker lists the shared student as well (P11-B)", async () => {
    stub();
    expect((await createTeacherMessagesClient("tok").listStudents("cB")).map(s => s.userId)).toEqual(["u1", "u2"]);
  });
  it("the live-game lobby lists the teacher's own students only", async () => {
    stub();
    expect((await createTeacherLiveSessionClient("tok").listStudents("cB")).map((s: { userId: string }) => s.userId)).toEqual(["u2"]);
  });
});

describe("P11-A the student's task card", () => {
  const item = { assignmentId: "b1", title: "واجب", instructions: "", openAt: "", dueAt: "", questionCount: 1, totalMarks: 10, availability: "open", attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, latestScore: null, latestPercentage: null, createdAt: "", classId: "cB", className: "علوم الحاسوب" } as Summary;
  it("names the class when the student is in more than one class, and only then", () => {
    const { rerender } = render(<StudentAssignmentCard item={item} busy={false} onOpen={noop} now={Date.now()} showClass />);
    expect(screen.getByTestId("card-class").textContent).toBe("الصف: علوم الحاسوب");
    rerender(<StudentAssignmentCard item={item} busy={false} onOpen={noop} now={Date.now()} />);
    expect(screen.queryByTestId("card-class")).toBeNull();
  });
});

describe("P11-A the gradebook archive of a student who left the class", () => {
  const row = (leftClass: boolean) => ({ studentId: "u1", studentName: "ليان سعيد", studentCode: "300000001", movedOut: true as const, ...(leftClass ? { leftClass: true } : {}), movedAt: "2026-11-02T08:00:00.000Z", latestResult: null, attemptsUsed: 0 });
  it("says «غادر الصف» for a student removed from a shared class, and «منقول» for a transferred one", () => {
    const { rerender } = render(<MovedStudents rows={[row(true)]} fmt={v => v} />);
    expect(screen.getByRole("region", { name: /طلاب غادروا هذا الصف/ }).textContent).toContain("غادر الصف");
    rerender(<MovedStudents rows={[row(false)]} fmt={v => v} />);
    expect(screen.getByRole("region", { name: /طلاب منقولون إلى معلم آخر/ }).textContent).toContain("منقول");
  });
});
