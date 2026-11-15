// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import TeacherHome from "./TeacherHome";
import TeacherAppShell from "../shell/TeacherAppShell";
import { activeNavId, pageTitleFor, type TeacherNavState } from "../shell/teacherNav";
import { navAllowed } from "../shell/teacherAccess";

// Teacher home — the welcome page after sign-in, opened by the top bar's «الرئيسية».
afterEach(cleanup);
const state = (over: Partial<TeacherNavState> = {}): TeacherNavState => ({ teacherView: "home", workspaceTab: "dashboard", projectCode: "", projectList: [], ...over });

describe("TeacherHome — the welcome page", () => {
  it("greets the teacher, names the platform and the school, and shows the illustration as decoration only", () => {
    const { container } = render(<TeacherHome displayName="نور" schoolName="مدرسة الأمل" onNavigate={() => {}} now={new Date(2026, 0, 1, 9)} />);
    expect(screen.getByText(/صباح الخير/).textContent).toContain("نور");
    expect(screen.getByRole("heading", { level: 2, name: /مرحبًا بك في/ })).toBeTruthy();
    expect(screen.getByText(/مدرسة الأمل/)).toBeTruthy();
    expect(container.querySelector(".eb-home-art")?.getAttribute("aria-hidden")).toBe("true");
  });
  it("the generic fallback «المعلم» is not used as a name in the greeting", () => {
    render(<TeacherHome displayName="المعلم" onNavigate={() => {}} now={new Date(2026, 0, 1, 19)} />);
    expect(screen.getByText("مساء الخير")).toBeTruthy();
  });
  it("an evening clock says «مساء الخير»", () => {
    render(<TeacherHome displayName="" onNavigate={() => {}} now={new Date(2026, 0, 1, 19)} />);
    expect(screen.getByText("مساء الخير")).toBeTruthy();
  });
  it("every card and call to action opens its destination", () => {
    const onNavigate = vi.fn();
    render(<TeacherHome displayName="م" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: /الذهاب إلى لوحة المتابعة/ }));
    fireEvent.click(screen.getByRole("button", { name: "إنشاء امتحان جديد" }));
    fireEvent.click(screen.getByRole("button", { name: /^التقارير/ }));
    expect(onNavigate.mock.calls.map(c => c[0])).toEqual(["dashboard", "builder", "reports"]);
  });
  it("offers only the destinations the teacher's access opens (presentation only — the server still decides)", () => {
    const access = { status: "ok" as const, enforced: true, capabilities: ["reports.widget.view"] };
    render(<TeacherHome displayName="م" access={access} onNavigate={() => {}} />);
    expect(screen.getByRole("button", { name: /^التقارير/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^باني الامتحان/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /الذهاب إلى لوحة المتابعة/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "إنشاء امتحان جديد" })).toBeNull();
  });
});

describe("the home destination in the shell", () => {
  it("is open to every resolved access, closed when the access is unavailable", () => {
    expect(navAllowed("home", null)).toBe(true);
    expect(navAllowed("home", { status: "ok", enforced: true, capabilities: [] })).toBe(true);
    expect(navAllowed("home", { status: "unavailable", enforced: true, capabilities: [] })).toBe(false);
  });
  it("the home view is the «الرئيسية» destination", () => {
    expect(activeNavId(state())).toBe("home");
    expect(pageTitleFor(state())).toBe("الرئيسية");
  });
  it("the top bar's «الرئيسية» opens the welcome page (not the dashboard) and is marked current there", () => {
    const onNavigate = vi.fn();
    const { unmount } = render(<TeacherAppShell nav={state()} projectReadyTotal={0} displayName="م" onNavigate={onNavigate} onLogout={() => {}}><p>x</p></TeacherAppShell>);
    const pill = document.querySelector(".eb-topbar-pill") as HTMLButtonElement;
    expect(pill.textContent).toBe("الرئيسية");
    expect(pill.getAttribute("aria-current")).toBe("page");
    fireEvent.click(pill);
    expect(onNavigate).toHaveBeenCalledWith("home");
    unmount();
    render(<TeacherAppShell nav={state({ teacherView: "builder" })} projectReadyTotal={0} displayName="م" onNavigate={() => {}} onLogout={() => {}}><p>x</p></TeacherAppShell>);
    expect((document.querySelector(".eb-topbar-pill") as HTMLButtonElement).getAttribute("aria-current")).toBeNull();
  });
});
