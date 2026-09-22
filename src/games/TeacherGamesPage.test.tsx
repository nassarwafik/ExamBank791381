// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, within, fireEvent, waitFor } from "@testing-library/react";
import TeacherGamesPage from "./TeacherGamesPage";
import TeacherAppShell from "../shell/TeacherAppShell";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("TeacherGamesPage", () => {
  it("renders the teacher games shell listing both approved games (h2 — the shell owns the h1)", () => {
    render(<TeacherGamesPage token="t" />);
    const region = screen.getByRole("region", { name: "الألعاب المتاحة" });
    expect(within(region).getByRole("heading", { level: 2, name: "الألعاب المتاحة" })).toBeTruthy();
    expect(within(region).getByRole("heading", { name: "تحدّي أنظمة العد" })).toBeTruthy();
    expect(within(region).getByRole("heading", { name: "التحدّي المباشر" })).toBeTruthy();
    expect(within(region).getAllByRole("article").length).toBe(2);
  });

  it("Number Conversion offers a teacher preview («معاينة اللعبة», enabled); Live Challenge keeps its authoring entry («إنشاء تحدٍّ», enabled)", () => {
    render(<TeacherGamesPage token="t" />);
    const nc = screen.getByRole("article", { name: "تحدّي أنظمة العد" });
    const preview = within(nc).getByRole("button", { name: "معاينة اللعبة" }) as HTMLButtonElement;
    expect(preview.disabled).toBe(false);
    expect(within(nc).getAllByRole("button").length).toBe(1);                       // one action on the card
    const lc = screen.getByRole("article", { name: "التحدّي المباشر" });
    const author = within(lc).getByRole("button", { name: "إنشاء تحدٍّ" }) as HTMLButtonElement;
    expect(author.disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "متاح للطلاب" })).toBeNull();
    expect(screen.queryByRole("button", { name: "قريبًا — في المرحلة القادمة" })).toBeNull();
  });

  it("«معاينة اللعبة» opens the SAME Number Conversion game as a teacher preview (nested full-view) and Back returns to Games", async () => {
    const calls: [string, RequestInit & { headers: Record<string, string> }][] = [];
    const task = { taskId: "t1", direction: "dec2bin", sourceBase: 10, targetBase: 2, sourceDisplay: "45", bitWidth: 8 };
    const active = { attemptId: "a", path: "dec-bin", level: "guided", total: 10, index: 0, taskNumber: 1, currentTask: task, attemptsOnCurrent: 0, resolved: 0, correct: 0, streak: 0, bestStreak: 0, startedAt: new Date().toISOString(), done: false };
    globalThis.fetch = vi.fn(async (u: string, i: RequestInit & { headers: Record<string, string> }) => {
      calls.push([u, i]);
      return { ok: true, status: 200, json: async () => ({ ok: true, active, best: null, continuation: "C1" }) };
    }) as unknown as typeof fetch;
    render(<TeacherGamesPage token="builder-tok" />);
    fireEvent.click(screen.getByRole("button", { name: "معاينة اللعبة" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "تحدّي أنظمة العد" })).toBeTruthy());   // embedded: the shell owns the h1
    expect(screen.queryByRole("region", { name: "الألعاب المتاحة" })).toBeNull();     // swapped away from the games list
    expect(screen.getByText("معاينة المعلم — لا يتم حفظ النتائج")).toBeTruthy();
    expect(calls.length).toBe(0);                                                      // no stored state to load: nothing persisted
    fireEvent.click(screen.getByRole("button", { name: "ابدأ التحدّي" }));
    await screen.findByText("المهمة 1 / 10");
    expect(calls.map(c => c[0])).toEqual(["/api/game-number-conversion-preview/start"]);
    expect(calls[0][1].headers["x-builder-token"]).toBe("builder-tok");               // the teacher's own builder token
    expect(calls[0][1].headers).not.toHaveProperty("x-student-token");
    expect(screen.getAllByRole("button", { name: /الخانة بقيمة/ }).length).toBe(8);   // the shared board
    fireEvent.click(screen.getByRole("button", { name: /العودة إلى الألعاب/ }));
    expect(await screen.findByRole("region", { name: "الألعاب المتاحة" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "إنشاء تحدٍّ" })).toBeTruthy();
  });

  it("«إنشاء تحدٍّ» opens the Live Challenge Generator (nested full-view)", async () => {
    // the generator lists saved challenges on mount → stub fetch to return an empty list
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, challenges: [] }) })) as unknown as typeof fetch;
    render(<TeacherGamesPage token="t" />);
    fireEvent.click(screen.getByRole("button", { name: "إنشاء تحدٍّ" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "مولّد التحدّي المباشر" })).toBeTruthy());   // embedded: the shell owns the h1
    expect(screen.queryByRole("region", { name: "الألعاب المتاحة" })).toBeNull();   // swapped away from the games list
    expect(screen.queryByText("معاينة المعلم — لا يتم حفظ النتائج")).toBeNull();     // authoring, not the game preview
    fireEvent.click(screen.getByRole("button", { name: /العودة إلى الألعاب/ }));
    expect(await screen.findByRole("region", { name: "الألعاب المتاحة" })).toBeTruthy();
  });

  it("carries the teacher-scoped modifier so it gets the desktop sidebar↔content inset", () => {
    render(<TeacherGamesPage token="t" />);
    const region = screen.getByRole("region", { name: "الألعاب المتاحة" });
    expect(region.classList.contains("eb-games-page")).toBe(true);
    expect(region.classList.contains("eb-games-page--teacher")).toBe(true);
  });
});

describe("TeacherGamesPage inside the REAL TeacherAppShell — one <main>, one <h1> (F1)", () => {
  // The shell owns the page's <main id="eb-main"> landmark and its <h1> (PageHeader); nested full-views must not add
  // a second <main> or a second <h1>. Rendered inside the actual shell, not a stand-in.
  const nav = { teacherView: "games", workspaceTab: "exam", projectCode: "", projectList: [] } as never;
  const landmarks = () => ({
    mains: Array.from(document.querySelectorAll("main")).map(m => m.id || m.className),
    h1: Array.from(document.querySelectorAll("h1")).map(h => h.textContent),
  });
  const renderInShell = () => render(
    <TeacherAppShell nav={nav} projectReadyTotal={0} displayName="المعلم" onNavigate={vi.fn()} onLogout={vi.fn()}>
      <TeacherGamesPage token="builder-tok" />
    </TeacherAppShell>,
  );
  const SHELL_H1 = ["الألعاب التعليمية"];   // the shell PageHeader title for the games destination

  it("the games list: the shell's single <main> and single <h1>", () => {
    renderInShell();
    expect(landmarks()).toEqual({ mains: ["eb-main"], h1: SHELL_H1 });
  });

  it("Number Conversion preview (home → play): still ONE <main> (the shell's) and ONE <h1>; the game title is an <h2>", async () => {
    const task = { taskId: "t1", direction: "dec2bin", sourceBase: 10, targetBase: 2, sourceDisplay: "45", bitWidth: 8 };
    const active = { attemptId: "a", path: "dec-bin", level: "guided", total: 10, index: 0, taskNumber: 1, currentTask: task, attemptsOnCurrent: 0, resolved: 0, correct: 0, streak: 0, bestStreak: 0, startedAt: new Date().toISOString(), done: false };
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, active, best: null, continuation: "C1" }) })) as unknown as typeof fetch;
    renderInShell();
    fireEvent.click(screen.getByRole("button", { name: "معاينة اللعبة" }));
    await screen.findByRole("heading", { level: 2, name: "تحدّي أنظمة العد" });
    expect(landmarks()).toEqual({ mains: ["eb-main"], h1: SHELL_H1 });
    expect(screen.getByText("معاينة المعلم — لا يتم حفظ النتائج")).toBeTruthy();       // the preview notice is intact
    fireEvent.click(screen.getByRole("button", { name: "ابدأ التحدّي" }));
    await screen.findByText("المهمة 1 / 10");
    expect(landmarks()).toEqual({ mains: ["eb-main"], h1: SHELL_H1 });
    expect(screen.getByRole("heading", { level: 2, name: "تحدّي أنظمة العد" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /العودة إلى الألعاب/ }));
    expect(await screen.findByRole("region", { name: "الألعاب المتاحة" })).toBeTruthy();
    expect(landmarks()).toEqual({ mains: ["eb-main"], h1: SHELL_H1 });
  });

  it("Live Challenge Generator (home → editor): still ONE <main> and ONE <h1>; the generator title is an <h2>", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, challenges: [] }) })) as unknown as typeof fetch;
    renderInShell();
    fireEvent.click(screen.getByRole("button", { name: "إنشاء تحدٍّ" }));
    await screen.findByRole("heading", { level: 2, name: "مولّد التحدّي المباشر" });
    expect(landmarks()).toEqual({ mains: ["eb-main"], h1: SHELL_H1 });
    fireEvent.click(await screen.findByRole("button", { name: "إنشاء تحدٍّ جديد" }));
    await screen.findByLabelText("عنوان التحدّي");
    expect(landmarks()).toEqual({ mains: ["eb-main"], h1: SHELL_H1 });
    expect(screen.getByRole("heading", { level: 2, name: "مولّد التحدّي المباشر" })).toBeTruthy();
  });
});
