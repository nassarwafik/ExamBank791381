// UX-R16 — the login and public pages in the reference look (docs/enterprise-ux-r0-redesign-foundation.md R16). Presentation
// only: the login form, session validation, role selection and routing are pinned by brand.10a, AppStudentLogin and the App
// suites; the boundary's messages and logging by ErrorBoundary.test; the offline page's static contract by serviceWorker.6a.
// These guards pin the palette: the login sheet holds no colour literal (its hero and illustration read the purple tokens), the
// hero text keeps ≥ 7:1, the submit is a flat primary, and the error and offline pages carry the reference values.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const login = strip(read("src", "login-pro.css")), app = read("src", "App.tsx"), tokens = strip(read("src", "design-tokens.css"));
const boundary = read("src", "ErrorBoundary.tsx"), offline = read("public", "offline.html");
const rule = (css: string, sel: string) => {
  const i = css.indexOf("\n" + sel + "{");
  expect(i, "rule " + sel).toBeGreaterThan(-1);
  return css.slice(css.indexOf("{", i) + 1, css.indexOf("}", i)).replace(/\s+/g, " ").trim();
};
const hex = (name: string) => tokens.match(new RegExp("--" + name + ":\\s*(#[0-9a-fA-F]{6})"))![1];
const lum = (h: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("UX-R16 — the login sheet", () => {
  it("holds no colour literal: the navy → blue hero, its sky accents and the blue role border are gone", () => {
    expect(login).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
    expect(JSON.parse(read("scripts", "ux-color-inventory.baseline.json")).files["src/login-pro.css"]).toBeUndefined();
  });

  it("the hero is the deep purple gradient (navy → primary → primary-strong) with white text", () => {
    const hero = rule(login, ".auth-brand");
    expect(hero).toContain("color:var(--eb-surface);");
    expect(hero).toContain("linear-gradient(168deg,var(--eb-navy) 0%,var(--eb-primary) 52%,var(--eb-primary-strong) 100%)");
  });

  it("every hero text colour keeps ≥ 7:1 on each stop of the gradient", () => {
    for (const fg of ["primary-200", "primary-050", "surface"]) for (const bg of ["navy", "primary", "primary-strong"]) {
      expect(ratio(hex("eb-" + fg), hex("eb-" + bg)), fg + " on " + bg).toBeGreaterThanOrEqual(7);
    }
    expect(rule(login, ".auth-lead")).toContain("color:var(--eb-primary-200);");
    expect(rule(login, ".auth-logo-text small")).toContain("color:var(--eb-primary-200);");
  });

  it("the submit is a flat primary: no gradient, no glow, no lift on hover", () => {
    const submit = rule(login, ".auth-submit");
    expect(submit).toContain("background:var(--eb-primary); box-shadow:none;");
    expect(submit).not.toContain("gradient");
    expect(rule(login, ".auth-submit:hover:not(:disabled)")).toBe("background:var(--eb-primary-strong);");
    expect(login).not.toMatch(/\.auth-submit[^{]*\{[^}]*transform/);
  });

  it("the form card is a flat 8 px card with the heading colour (the legacy .login-card shadow, 12 px and slate heading lose)", () => {
    expect(rule(login, ".auth .auth-card")).toBe("border-radius:var(--eb-r); box-shadow:none;");
    expect(rule(login, ".auth .auth-card h1")).toBe("color:var(--eb-text-heading);");
  });

  it("the error message names the danger tokens; the role chips sit on the primary family", () => {
    expect(rule(login, ".auth-error")).toContain("color:var(--eb-danger-tx);");
    expect(rule(login, ".auth-role")).toContain("border:1px solid var(--eb-primary-100);");
  });
});

describe("UX-R16 — the login illustration", () => {
  it("App.tsx carries classes only: no colour attribute is left in the constellation (the mask's white stops stay)", () => {
    const svg = app.slice(app.indexOf('<svg className="auth-net"'), app.indexOf("</svg>", app.indexOf('<svg className="auth-net"')));
    const colours = [...svg.matchAll(/(?:stroke|fill|stopColor)="(#[0-9a-fA-F]{3,6})"/g)].map(m => m[1]);
    expect(colours).toEqual(["#fff", "#fff", "#fff"]);                                     // the three mask-gradient stops
    expect(svg.match(/stopColor="#fff"/g)).toHaveLength(3);
    for (const c of ["auth-net-glow", "auth-net-rings", "auth-net-links", "auth-net-halos", "auth-net-nodes", "auth-net-hubs"]) expect(svg).toContain('className="' + c + '"');
  });

  it("login-pro.css colours each part from the purple tokens", () => {
    expect(rule(login, ".auth-net .auth-net-glow stop")).toBe("stop-color:var(--eb-primary-300);");
    expect(rule(login, ".auth-net .auth-net-rings")).toBe("stroke:var(--eb-surface);");
    expect(rule(login, ".auth-net .auth-net-links")).toBe("stroke:var(--eb-primary-200);");
    expect(rule(login, ".auth-net .auth-net-halos")).toBe("fill:var(--eb-primary-200);");
    expect(rule(login, ".auth-net .auth-net-nodes")).toBe("fill:var(--eb-primary-050);");
    expect(rule(login, ".auth-net .auth-net-hubs")).toBe("fill:var(--eb-surface);");
  });
});

describe("UX-R16 — the error and offline pages", () => {
  it("the error boundary reads the tokens (with the reference values as fallbacks): 8 px flat card, no shadow, no slate", () => {
    for (const s of ['background: "var(--eb-bg, #f7f6fa)"', 'border: "1px solid var(--eb-line, #e9e8ee)"', 'borderRadius: "var(--eb-r, 8px)"', 'color: "var(--eb-text-heading, #1c1330)"', 'color: "var(--eb-muted, #5f5a6e)"', 'background: "var(--eb-primary, #2a0a4e)"']) expect(boundary).toContain(s);
    expect(boundary).not.toMatch(/boxShadow|#0f172a|#64748b|#f5f7fa|#e9edf4/);
    // the fallbacks are the tokens' own values
    expect(hex("eb-bg")).toBe("#f7f6fa"); expect(hex("eb-line")).toBe("#e9e8ee"); expect(hex("eb-muted")).toBe("#5f5a6e"); expect(hex("eb-primary")).toBe("#2a0a4e");
  });

  it("the offline page (self-contained, it cannot read tokens) mirrors the palette; the brand mark and theme colour stay navy", () => {
    const css = offline.slice(offline.indexOf("<style>"), offline.indexOf("</style>"));
    expect(css).toContain("background: #f7f6fa; color: #1c1330;");
    expect(css).toContain("border: 1px solid #e9e8ee; border-radius: 8px;");
    expect(css).toContain("background: #2a0a4e; color: #ffffff;");
    expect(css).not.toMatch(/#2563eb|#0f172a|#334155|#e2e8f0|#f5f7fa/i);
    expect(offline).toContain('<meta name="theme-color" content="#031c40" />');
    expect(css).toMatch(/\.mark \{[^}]*background: #031c40;/);
    expect([hex("eb-bg"), hex("eb-navy"), hex("eb-line"), hex("eb-muted"), hex("eb-primary"), hex("eb-primary-strong")]).toEqual(["#f7f6fa", "#1c1330", "#e9e8ee", "#5f5a6e", "#2a0a4e", "#4a2380"]);
  });
});
