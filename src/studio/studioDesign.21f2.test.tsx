// @vitest-environment happy-dom
/// <reference types="node" />
// Phase 21F.2 — the Exam Studio design system. CSS is stubbed under Vitest, so the sheet is read from disk and guarded structurally:
// colours only through tokens (literals only in the brand token block), logical properties only (RTL first), touch targets, the
// canonical focus ring, reduced motion, and the contrast of the brand pairs. The primitives are exercised for their ARIA contracts.
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { useState } from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { StudioStepper, StudioTabs, StatusDot, StudioSaveStatus } from "./StudioPrimitives";
import { STUDIO_STEPS, type StudioStepKey } from "./studioSteps";

const root = process.cwd();
const raw = readFileSync(path.join(root, "src", "studio", "studio.css"), "utf8");
const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = (() => { const out: { selector: string; body: string }[] = []; const re = /([^{}]+)\{([^{}]*)\}/g; let m: RegExpExecArray | null; while ((m = re.exec(css))) out.push({ selector: m[1].replace(/@[^{]*$/, "").trim().replace(/^.*\{/, "").trim(), body: m[2] }); return out; })();
const tokenBlock = rules[0];
// UX-R11b — the studio tokens now name canonical --eb-* tokens (the reference look), so a pair is checked on the RESOLVED colour:
// a studio token is read from its block, a var(--eb-*) is followed through design-tokens.css (its first, light :root definition)
// to its hex.
const ebRoot = readFileSync(path.join(root, "src", "design-tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const resolve = (value: string, depth = 0): string => {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  const ref = v.match(/^var\(--([\w-]+)\)$/);
  if (!ref || depth > 6) throw new Error("not a hex or a var(): " + v);
  const m = ebRoot.match(new RegExp("--" + ref[1] + ":\\s*([^;]+);"));
  if (!m) throw new Error("eb token " + ref[1]);
  return resolve(m[1], depth + 1);
};
const hex = (name: string) => { const m = tokenBlock.body.match(new RegExp("--" + name + ":\\s*([^;]+);")); if (!m) throw new Error("token " + name); return resolve(m[1]); };
const ebHex = (name: string) => resolve("var(--" + name + ")");
const lum = (h: string) => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

afterEach(() => cleanup());

describe("21F.2 studio.css — tokens, RTL, touch, focus, motion", () => {
  it("the first rule is the token block of the three studio roots, and the only literal colours live there", () => {
    expect(tokenBlock.selector).toBe(".st-studio, .st-home, .st-drawer");
    for (const r of rules.slice(1)) expect(r.body, r.selector).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
  });
  it("every rule is scoped to a studio root (the classic builder is untouched)", () => {
    for (const r of rules.slice(1)) for (const sel of r.selector.split(",")) expect(sel.trim(), r.selector).toMatch(/^(\.sb-builder\.st-studio|\.st-studio|\.st-home|\.st-drawer|\.st-outline|\.st-inspector|\.st-drawer-shell)\b/);
  });
  it("uses logical properties only (no physical left / right)", () => {
    for (const r of rules) expect(r.body, r.selector).not.toMatch(/(^|[;\s])(margin|padding|border)-(left|right)\s*:|(^|[;\s])(left|right)\s*:|text-align:\s*(left|right)/);
  });
  it("coarse pointers get 44 px targets for every studio control", () => {
    const coarse = css.slice(css.indexOf("@media (pointer: coarse)"));
    for (const sel of [".st-step", ".st-btn", ".st-icon-btn", ".st-row", ".st-insert-btn", ".st-tab", ".st-add-zone"]) expect(coarse, sel).toContain(sel);
    expect(coarse).toMatch(/--st-target:\s*44px/);
    expect(coarse).toMatch(/min-block-size:\s*44px/);
  });
  it("focus uses the canonical visible ring token, and motion respects prefers-reduced-motion", () => {
    expect(rules.some(r => /:focus-visible/.test(r.selector) && /outline:\s*var\(--eb-focus-ring\)/.test(r.body))).toBe(true);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.st-studio \*[^}]*transition:\s*none !important/);
  });
  // UX-R11b — the bar is white (it was navy) and the accent is the primary family (it was turquoise). The pairs follow what is
  // drawn: the bar's text and muted text on the bar, the accent text on its tint, a completed step's number (--st-top) on the
  // accent disc, and the current step's number (white) on its heading-coloured disc.
  it("the brand pairs meet WCAG AA (text on the white bar, accent text on its tint, the step numbers on their discs)", () => {
    expect(contrast(hex("st-top-tx"), hex("st-top"))).toBeGreaterThanOrEqual(7);
    expect(contrast(hex("st-top-mute"), hex("st-top"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex("st-teal-tx"), hex("st-teal-050"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex("st-top"), hex("st-teal"))).toBeGreaterThanOrEqual(4.5);   // a completed step's number on the accent disc
    expect(contrast(ebHex("eb-surface"), ebHex("eb-text-heading"))).toBeGreaterThanOrEqual(7);   // the current step's number
    expect(contrast(hex("st-top-tx"), ebHex("eb-chrome-active"))).toBeGreaterThanOrEqual(7);   // the current step's label on its pill
  });
});

describe("21F.2 primitives", () => {
  it("StudioStepper: four labelled steps, the current one aria-current=step, earlier ones marked done", () => {
    function Host() { const [s, setS] = useState<StudioStepKey>("review"); return <div dir="rtl"><StudioStepper current={s} onSelect={setS} /></div>; }
    render(<Host />);
    const nav = screen.getByRole("navigation", { name: "خطوات العمل" });
    const steps = Array.from(nav.querySelectorAll("button"));
    expect(steps.map(b => b.textContent?.replace(/\d/g, ""))).toEqual(STUDIO_STEPS.map(s => s.label));
    expect(steps[2].getAttribute("aria-current")).toBe("step");
    expect(steps.slice(0, 2).every(b => b.classList.contains("is-done"))).toBe(true);
    fireEvent.click(steps[0]);
    expect(nav.querySelectorAll("button")[0].getAttribute("aria-current")).toBe("step");
  });
  it("StudioTabs: arrows move the selection in reading direction (RTL: ArrowLeft = next), Home / End, one Tab stop", async () => {
    function Host() { const [v, setV] = useState("a"); return <div dir="rtl"><StudioTabs label="خصائص" tabs={[{ key: "a", label: "أ" }, { key: "b", label: "ب" }, { key: "c", label: "ج" }]} value={v} onChange={setV}><p>لوحة {v}</p></StudioTabs></div>; }
    render(<Host />);
    const tabs = () => screen.getAllByRole("tab");
    expect(tabs().map(t => t.tabIndex)).toEqual([0, -1, -1]);
    await act(async () => { fireEvent.keyDown(tabs()[0], { key: "ArrowLeft" }); });
    expect(tabs()[1].getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toBe("لوحة b");
    await act(async () => { fireEvent.keyDown(tabs()[1], { key: "ArrowRight" }); });
    expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
    await act(async () => { fireEvent.keyDown(tabs()[0], { key: "End" }); });
    expect(tabs()[2].getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(tabs()[2].id);
  });
  it("StatusDot is never colour alone, and the save status is ONE polite atomic region", () => {
    render(<><StatusDot tone="error" /><StatusDot tone="ok" /><StudioSaveStatus state="dirty" /></>);
    expect(screen.getByRole("img", { name: "خطأ" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "سليم" })).toBeTruthy();
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("aria-atomic")).toBe("true");
    expect(status.textContent).toBe("تغييرات غير محفوظة");
  });
});
