// @vitest-environment happy-dom
// Tadris+ P8-A1 — the teacher's appearance in the browser: data-palette / data-density on <html> only while the TEACHER shell is
// open (removed when it closes: another role may use the device next), the device copy, the account's appearance (the theme too),
// and «المظهر» in the teacher's profile: a choice applies at once and is saved; a refusal puts the previous look back; a part the
// teacher may not change is disabled; «استعادة الافتراضي». TEST data only.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, act } from "@testing-library/react";
import AppearanceSettings from "./AppearanceSettings";
import { applyTeacherAppearance, clearTeacherAppearance, parseAppearance, startTeacherAppearance, readCachedAppearance, forgetCachedAppearance, resetKnownAppearance } from "./teacherAppearance";
import { teacherProfileApi } from "./teacherProfile";
import { getThemeChoice, setThemeChoice } from "../ui/themePreference";

const html = () => document.documentElement;
const json = (body: unknown, status = 200) => ({ ok: status < 300, status, json: async () => body }) as Response;
let server: { appearance: Record<string, string>; appearanceChoosable: Record<string, boolean> };
let posts: Record<string, unknown>[];
let refuse = false;
beforeEach(() => {
  posts = []; refuse = false;
  server = { appearance: { theme: "light", palette: "default", density: "comfortable" }, appearanceChoosable: { theme: true, palette: true, density: true } };
  forgetCachedAppearance(); clearTeacherAppearance(); setThemeChoice("light"); resetKnownAppearance();
  globalThis.fetch = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      const b = JSON.parse(String(init.body)); posts.push(b);
      if (refuse) return json({ ok: false, error: "هذا الخيار من المظهر غير مفعّل لحسابك." }, 403);
      server.appearance = { ...server.appearance, ...b.appearance };
      return json({ ok: true, appearance: server.appearance });
    }
    return json({ ok: true, profile: {}, ...server });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); clearTeacherAppearance(); setThemeChoice("light"); });

describe("P8-A1 — applying the appearance", () => {
  it("the defaults leave <html> clean; a palette / density sets the attributes; clear removes them", () => {
    applyTeacherAppearance({ palette: "default", density: "comfortable" });
    expect([html().getAttribute("data-palette"), html().getAttribute("data-density")]).toEqual([null, null]);
    applyTeacherAppearance({ palette: "ocean", density: "compact" });
    expect([html().getAttribute("data-palette"), html().getAttribute("data-density")]).toEqual(["ocean", "compact"]);
    clearTeacherAppearance();
    expect([html().getAttribute("data-palette"), html().getAttribute("data-density")]).toEqual([null, null]);
    expect(parseAppearance({ theme: "x", palette: "neon", density: "compact" })).toEqual({ theme: "light", palette: "default", density: "compact" });
  });

  it("the shell lifecycle: the account's look (and theme) from the app's own profile read, cached, cleared when the shell closes", async () => {
    server.appearance = { theme: "dark", palette: "forest", density: "compact" };
    const stop = startTeacherAppearance("tok");
    expect(globalThis.fetch).not.toHaveBeenCalled();                                   // the shell makes no request of its own
    await act(async () => { await teacherProfileApi.load("tok"); });
    await waitFor(() => expect(html().getAttribute("data-palette")).toBe("forest"));
    expect([html().getAttribute("data-density"), getThemeChoice()]).toEqual(["compact", "dark"]);
    expect(readCachedAppearance()).toEqual({ theme: "dark", palette: "forest", density: "compact" });
    stop();
    expect([html().getAttribute("data-palette"), html().getAttribute("data-density")]).toEqual([null, null]);
  });

  it("the top bar's light / dark switch is kept in step with the account (when the teacher may)", async () => {
    const stop = startTeacherAppearance("tok");
    await act(async () => { await teacherProfileApi.load("tok"); });
    await waitFor(() => expect(readCachedAppearance()).not.toBeNull());
    setThemeChoice("dark");
    await waitFor(() => expect(posts).toEqual([{ action: "setAppearance", appearance: { theme: "dark" } }]));
    stop();
  });
});

describe("P8-A1 — «المظهر» in the teacher's profile", () => {
  it("choosing a palette applies it at once and saves it; density likewise", async () => {
    render(<AppearanceSettings token="tok" />);
    fireEvent.click(await screen.findByRole("radio", { name: "محيط" }));
    expect(html().getAttribute("data-palette")).toBe("ocean");
    await screen.findByText("حُفظت لوحة الألوان.");
    fireEvent.click(screen.getByRole("radio", { name: "مدمجة" }));
    await screen.findByText("حُفظت الكثافة.");
    expect(posts.map(p => p.appearance)).toEqual([{ palette: "ocean" }, { density: "compact" }]);
    expect(html().getAttribute("data-density")).toBe("compact");
  });

  it("a refusal puts the previous look back and says why", async () => {
    refuse = true;
    render(<AppearanceSettings token="tok" />);
    fireEvent.click(await screen.findByRole("radio", { name: "رمل" }));
    expect((await screen.findByRole("alert")).textContent).toContain("غير مفعّل");
    expect(html().getAttribute("data-palette")).toBeNull();
    expect((screen.getByRole("radio", { name: "الافتراضية" }) as HTMLInputElement).checked).toBe(true);
  });

  it("a part the teacher may not change is disabled; none at all → a note and no restore", async () => {
    server.appearanceChoosable = { theme: true, palette: false, density: true };
    render(<AppearanceSettings token="tok" />);
    expect(((await screen.findByRole("radio", { name: "محيط" })) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("radio", { name: "مدمجة" }) as HTMLInputElement).disabled).toBe(false);
    cleanup();
    server.appearanceChoosable = { theme: false, palette: false, density: false };
    render(<AppearanceSettings token="tok" />);
    expect((await screen.findByRole("note")).textContent).toContain("غير مفعّل");
    expect((screen.getByRole("button", { name: "استعادة الافتراضي" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("«استعادة الافتراضي» returns every part the teacher may change to the default", async () => {
    server.appearance = { theme: "dark", palette: "sand", density: "compact" };
    setThemeChoice("dark");
    render(<AppearanceSettings token="tok" />);
    fireEvent.click(await screen.findByRole("button", { name: "استعادة الافتراضي" }));
    await screen.findByText("عاد المظهر إلى الافتراضي.");
    expect(posts[0]).toEqual({ action: "setAppearance", appearance: { theme: "light", palette: "default", density: "comfortable" } });
    expect([html().getAttribute("data-palette"), getThemeChoice()]).toEqual([null, "light"]);
  });
});
