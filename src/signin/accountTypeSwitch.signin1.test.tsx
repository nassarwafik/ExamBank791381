// @vitest-environment happy-dom
// Tadris+ SIGN-IN-1 — one sign-in screen for every account: «نوع الحساب» (معلم أو طالب | مالك المنصة) on the main sign-in card and
// on the owner's sign-in card. Navigation only (links); the owner's screens stay their own surface and lazy chunk (P1-A2).
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AccountTypeSwitch from "./AccountTypeSwitch";

afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });
const read = (p: string) => readFileSync(resolve(import.meta.dirname, "..", p), "utf8");

describe("SIGN-IN-1 «نوع الحساب»", () => {
  it("on the main page: «معلم أو طالب» is current, «مالك المنصة» leads to the owner's form", () => {
    window.history.replaceState(null, "", "/");
    render(<AccountTypeSwitch current="platform" />);
    const nav = screen.getByRole("navigation", { name: "نوع الحساب" });
    const links = within(nav).getAllByRole("link");
    expect(links.map(l => [l.textContent, l.getAttribute("href"), l.getAttribute("aria-current")])).toEqual([
      ["معلم أو طالب", "/", "page"],
      ["مالك المنصة", "/#/owner", null]
    ]);
  });

  it("on the owner's page: «مالك المنصة» is current, «معلم أو طالب» leads back to the main form (no hash: a full load into the app)", () => {
    window.history.replaceState(null, "", "/#/owner");
    render(<AccountTypeSwitch current="owner" />);
    const links = within(screen.getByRole("navigation", { name: "نوع الحساب" })).getAllByRole("link");
    expect(links.map(l => [l.getAttribute("href"), l.getAttribute("aria-current")])).toEqual([["/", null], ["/#/owner", "page"]]);
  });

  it("both sign-in cards start with it, and the main bundle never imports the owner's screens to show it", () => {
    const app = read("App.tsx"), owner = read("owner/OwnerApp.tsx"), sw = read("signin/AccountTypeSwitch.tsx");
    expect(app).toMatch(/<section className="auth-card login-card">\s*<AccountTypeSwitch current="platform" \/>/);
    expect(owner).toMatch(/<section className="auth-card eb-owner-card"[^>]*>\s*<AccountTypeSwitch current="owner" \/>/);
    expect(sw).not.toMatch(/from "\.\.\/owner\//);
  });
});
