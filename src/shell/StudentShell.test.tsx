// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import StudentShell from "./StudentShell";

afterEach(cleanup);

describe("UX-2 StudentShell", () => {
  it("renders the top bar with the existing hooks, the identity area, logout and the content container — and nothing else", () => {
    const onLogout = vi.fn();
    render(<StudentShell studentName="أحمد محمد" className="الحادي عشر" onLogout={onLogout}><p>محتوى</p></StudentShell>);
    expect(document.querySelector("main.student-portal")?.getAttribute("dir")).toBe("rtl");
    expect(document.querySelector("header.student-topbar")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("ExamBank 2.0");
    const identity = screen.getByLabelText("الطالب الحالي");
    expect(identity.textContent).toContain("أحمد محمد");
    expect(identity.textContent).toContain("الحادي عشر");
    fireEvent.click(screen.getByRole("button", { name: /تسجيل الخروج/ }));
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(document.querySelector("section.student-shell")?.textContent).toBe("محتوى");
    // no navigation / bottom bar in UX-2
    expect(screen.queryByRole("navigation")).toBeNull();
  });
  it("omits the identity area until a name is known", () => {
    render(<StudentShell studentName="" onLogout={() => {}}><p>x</p></StudentShell>);
    expect(screen.queryByLabelText("الطالب الحالي")).toBeNull();
  });
});
