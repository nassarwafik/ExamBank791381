// @vitest-environment happy-dom
// Tadris+ P10-B — the owner sign-in page's illustrated brand panel (owner request: an image like the teacher / student sign-in
// page, with the app icon, that says what the app and the owner's console are). Pins: the signed-out owner page renders the
// panel beside the unchanged form (same fields, same single server call); the panel carries the official app icon and the owner's
// text; the illustration is decorative (aria-hidden) and draws its colours from tokens only (no colour attribute but the mask's
// luminance white, no hex in the stylesheet block); no preserveAspectRatio (the bundle guard's visual signature); the panel is
// only on the sign-in page (a signed-in owner sees the console, not the panel) and only in the owner's lazy chunk.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import OwnerApp from "./OwnerApp";
import { BRAND_ICON_SRC } from "../ui/BrandMark";
import { OWNER_TOKEN_KEY } from "./ownerApi";

const read = (...p: string[]) => readFileSync(path.join(import.meta.dirname, ...p), "utf8");
let urls: string[] = [];
let routes: Record<string, () => { status: number; body: unknown }> = {};
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

beforeEach(() => {
  urls = [];
  routes = { "/api/owner-bootstrap": () => ({ status: 200, body: { ok: true, state: "unavailable" } }) };
  sessionStorage.clear();
  window.location.hash = "#/owner";
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    urls.push(url);
    const h = routes[url];
    return h ? json(h().status, h().body) : json(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("P10-B owner sign-in brand panel", () => {
  it("the signed-out owner page shows the panel (app icon, owner text, decorative illustration) beside the unchanged form", async () => {
    const { container } = render(<OwnerApp />);
    expect(await screen.findByRole("heading", { name: "دخول مالك المنصة", level: 1 })).toBeTruthy();
    const panel = screen.getByRole("region", { name: "لوحة مالك المنصة" });
    expect(panel.classList.contains("auth-brand")).toBe(true);
    expect(container.querySelector(".auth.eb-owner-auth")).not.toBeNull();
    const icon = panel.querySelector("img.eb-brand-icon") as HTMLImageElement;
    expect(icon.getAttribute("src")).toBe(BRAND_ICON_SRC);
    expect(icon.getAttribute("alt")).toBe("");
    expect(panel.textContent).toContain("Tadris+");
    expect(panel.textContent).toContain("مالك المنصة");
    expect(screen.getByRole("heading", { name: "كل المنصة تحت إدارتك من مكان واحد", level: 2 })).toBeTruthy();
    const art = panel.querySelector("svg.eb-owner-art")!;
    expect(art.getAttribute("aria-hidden")).toBe("true");
    expect(art.getAttribute("preserveAspectRatio")).toBeNull();
    // the form is the same: three fields, the recovery switch, the submit; the page asked the server one thing only
    for (const name of [/اسم المستخدم/, /كلمة المرور/, /رمز التحقق من التطبيق/]) expect(screen.getByLabelText(name)).toBeTruthy();
    expect(screen.getByRole("button", { name: "فقدت الهاتف؟ استخدم رمز استرداد" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "دخول" })).toBeTruthy();
    expect(urls).toEqual(["/api/owner-bootstrap"]);
  });

  it("a signed-in owner sees the console, never the sign-in panel", async () => {
    sessionStorage.setItem(OWNER_TOKEN_KEY, "owner-token-test");
    routes["/api/owner-session"] = () => ({ status: 200, body: { ok: true, owner: { accountId: "own_0123456789abcdef", username: "tadris.owner", displayName: "مالك المنصة" }, session: { expiresAt: "2026-11-01T12:00:00.000Z", stepUpValidUntil: null }, recoveryCodesRemaining: 10 } });
    routes["/api/owner-teachers"] = () => ({ status: 200, body: { ok: true, teachers: [] } });
    render(<OwnerApp />);
    await screen.findByText(/أنت داخل بحساب مالك المنصة/);
    expect(screen.queryByRole("region", { name: "لوحة مالك المنصة" })).toBeNull();
    expect(document.querySelector(".eb-owner-art")).toBeNull();
  });

  it("colours come from tokens only; the panel lives in the owner's lazy chunk", () => {
    const hero = read("OwnerLoginHero.tsx");
    const colours = [...hero.matchAll(/(?:stopColor|fill|stroke)="(#[0-9a-fA-F]{3,8})"/g)].map(m => m[1]);
    expect(colours).toEqual(["#fff", "#fff", "#fff"]);                  // the mask's luminance stops only
    expect(hero).not.toMatch(/preserveAspectRatio=/);
    const css = read("owner.css");
    const block = css.slice(css.indexOf("Tadris+ P10-B"));
    expect(block.length).toBeGreaterThan(200);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    expect(read("OwnerApp.tsx")).toMatch(/import OwnerLoginHero from "\.\/OwnerLoginHero"/);
    expect(read("..", "main.tsx")).not.toMatch(/OwnerLoginHero/);
    expect(read("..", "App.tsx")).not.toMatch(/OwnerLoginHero/);
  });
});
