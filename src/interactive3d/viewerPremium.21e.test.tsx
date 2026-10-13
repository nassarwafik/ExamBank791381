// @vitest-environment happy-dom
// Phase 21E — Premium 3D viewer (Interactive3DView) + SmartSim host chrome. Pins what the presentation redesign must keep: every control
// by its exact accessible name inside one labelled toolbar, the scene's accessible description byte-for-byte, decorative-only additions,
// answer integrity (camera / display actions never emit an answer), read-only, and the CSS rules that keep focus, touch, gestures,
// reduced motion and the scene drawing intact. Real-browser behaviour is certified by scripts/check-viewer-premium-21e.mjs.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import Interactive3DView from "./Interactive3DView";
import { scene3DPreset } from "./scenePresets";
import type { Interactive3DSceneSpecV1 } from "./sceneSpec";

afterEach(cleanup);

const HELP = "اسحب النموذج لتدويره بحرية في كل الاتجاهات. للتكبير: إصبعان على الشاشة اللمسية، أو عجلة الفأرة بعد النقر على النموذج (أو مع Ctrl). بعد التركيز على النموذج: الأسهم للتدوير، و+ و− للتكبير والتصغير، وHome لإعادة العرض.";
const ROTATE = ["تدوير لليسار", "تدوير لليمين", "رفع المنظور", "خفض المنظور"], ZOOM = ["تكبير", "تصغير", "عرض النموذج كاملًا"], VIEW = ["إعادة العرض"];
const heart = () => scene3DPreset("heart", "t-heart") as Interactive3DSceneSpecV1;
const renderHeart = (over: Partial<{ readOnly: boolean; value: string[] }> = {}) => {
  const onChange = vi.fn();
  const utils = render(<Interactive3DView spec={heart()} selection={{ kind: "object", mode: "single", max: 1, value: over.value ?? [], label: "اختر جزءًا من القلب", readOnly: over.readOnly, onChange }} />);
  return { ...utils, onChange, svg: utils.container.querySelector("svg.i3d-scene") as SVGSVGElement };
};

describe("21E viewer — one labelled toolbar, every control by its exact name", () => {
  it("three groups (التدوير / التكبير / العرض) inside «أدوات عرض النموذج ثلاثي الأبعاد», each control once, in the right group", () => {
    renderHeart();
    const bar = screen.getByRole("group", { name: "أدوات عرض النموذج ثلاثي الأبعاد" });
    for (const [group, names] of [["التدوير", ROTATE], ["التكبير", ZOOM], ["العرض", VIEW]] as const) {
      const g = within(bar).getByRole("group", { name: group });
      for (const n of names) expect(within(g).getAllByRole("button", { name: n }), n).toHaveLength(1);
    }
    expect(bar.classList.contains("i3d-controls")).toBe(true);
  });
  it("icons are decorative: aria-hidden, not focusable, and icon-only buttons carry no glyph text (names come from aria-label)", () => {
    const { container } = renderHeart();
    const icons = [...container.querySelectorAll(".i3d-controls svg.i3d-ico")];
    expect(icons.length).toBeGreaterThanOrEqual(8);
    for (const i of icons) { expect(i.getAttribute("aria-hidden")).toBe("true"); expect(i.getAttribute("focusable")).toBe("false"); }
    for (const b of container.querySelectorAll(".i3d-controls .i3d-icon")) expect((b.textContent || "").trim()).toBe("");
  });
  it("a scene without rotate / zoom shows neither group and no drag hint; «إعادة العرض» stays", () => {
    const still = { ...heart(), interaction: { rotate: false, zoom: false, select: true } } as Interactive3DSceneSpecV1;
    const { container } = render(<Interactive3DView spec={still} />);
    expect(screen.queryByRole("group", { name: "التدوير" })).toBeNull();
    expect(screen.queryByRole("group", { name: "التكبير" })).toBeNull();
    expect(screen.getByRole("button", { name: "إعادة العرض" })).toBeTruthy();
    expect(container.querySelector(".i3d-stage-hint")).toBeNull();
  });
});

describe("21E viewer — accessible description and decorative additions", () => {
  it("the scene keeps its exact accessible description; the card title and the stage hint are aria-hidden", () => {
    const { svg, container } = renderHeart();
    const help = document.getElementById(svg.getAttribute("aria-describedby") || "");
    expect(help?.textContent).toBe(HELP);
    expect(help?.classList.contains("i3d-help")).toBe(true);
    expect(container.querySelector(".i3d-howto-title")?.getAttribute("aria-hidden")).toBe("true");
    const hint = container.querySelector(".i3d-stage .i3d-stage-hint");
    expect(hint?.getAttribute("aria-hidden")).toBe("true");
    expect(svg.closest(".i3d-stage")).toBeTruthy();
    expect(svg.getAttribute("tabindex")).toBe("0");
    expect(svg.getAttribute("role")).toBe("img");
  });
});

describe("21E viewer — answer integrity", () => {
  it("choosing a part emits exactly its semantic key; every camera / display action afterwards emits nothing", () => {
    const { onChange, svg, container } = renderHeart();
    fireEvent.click(within(screen.getByRole("group", { name: "اختر جزءًا من القلب" })).getByRole("button", { name: /البطين الأيسر/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(["object:leftVentricle"]);
    for (const n of [...ROTATE, ...ZOOM, ...VIEW]) fireEvent.click(screen.getByRole("button", { name: n }));
    fireEvent.keyDown(svg, { key: "ArrowLeft" }); fireEvent.keyDown(svg, { key: "+" }); fireEvent.keyDown(svg, { key: "Home" });
    for (const sel of container.querySelectorAll(".i3d-options select")) fireEvent.change(sel, { target: { value: (sel as HTMLSelectElement).options[1].value } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
  it("the camera still answers the toolbar and the keyboard (data-zoom / data-yaw move, «إعادة العرض» restores)", () => {
    const { svg } = renderHeart();
    const at = () => [svg.getAttribute("data-yaw"), svg.getAttribute("data-pitch"), svg.getAttribute("data-zoom")].join("|");
    const start = at();
    fireEvent.click(screen.getByRole("button", { name: "تكبير" }));
    expect(svg.getAttribute("data-zoom")).not.toBe(start.split("|")[2]);
    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    expect(svg.getAttribute("data-yaw")).not.toBe(start.split("|")[0]);
    fireEvent.click(screen.getByRole("button", { name: "إعادة العرض" }));
    expect(at()).toBe(start);
  });
  it("read-only (submitted / review): answer buttons are disabled and a click emits nothing", () => {
    const { onChange } = renderHeart({ readOnly: true, value: ["object:leftVentricle"] });
    const buttons = within(screen.getByRole("group", { name: "اختر جزءًا من القلب" })).getAllByRole("button");
    for (const b of buttons) expect((b as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(buttons[0]);
    expect(onChange).not.toHaveBeenCalled();
    expect(buttons.find(b => /البطين الأيسر/.test(b.textContent || ""))?.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("21E viewer + SmartSim — CSS guards (CSS is stubbed under Vitest; the sheets are read from disk)", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
  const i3d = strip(readFileSync(path.join(process.cwd(), "src", "interactive3d", "interactive3d.css"), "utf8"));
  const sim = strip(readFileSync(path.join(process.cwd(), "src", "smartsim", "smartsim.css"), "utf8"));
  const media = (css: string, q: string) => { const i = css.indexOf(q); if (i < 0) return ""; const o = css.indexOf("{", i); let d = 0; for (let k = o; k < css.length; k++) { if (css[k] === "{") d++; else if (css[k] === "}" && --d === 0) return css.slice(o + 1, k); } return ""; };
  it("the scene drawing rules (lines, edges, vertices, selected / review tints) are unchanged", () => {
    for (const rule of [
      ".i3d-line{pointer-events:none;stroke-linecap:round;fill:none}.i3d-line-crease{stroke:#1d3247;stroke-width:1.7}",
      ".i3d-edge-target{stroke:#334155;stroke-width:4;stroke-linecap:round}.i3d-edge-target.is-selected{stroke:#111827;stroke-width:7}",
      ".i3d-edge-hit{stroke:transparent;stroke-width:16;cursor:pointer}",
      ".i3d-vertex-target{fill:#fff;stroke:#334155;stroke-width:2;cursor:pointer}.i3d-vertex-target.is-selected{fill:#111827;stroke:#fff;stroke-width:2.5}",
      ".i3d-face.is-selected:not(.is-curved){stroke:#7a4a00;stroke-width:2.6;stroke-opacity:1}",
      ".i3d-target-list .review-correct{outline:3px solid #166534;outline-offset:-3px}"
    ]) expect(i3d, rule.slice(0, 40)).toContain(rule);
  });
  it("gestures stay on the scene: touch-action none, grab cursor; the hint never takes input and hides while dragging", () => {
    expect(i3d).toMatch(/\.i3d-scene\{[^}]*touch-action:none[^}]*cursor:grab/);
    expect(i3d).toMatch(/\.i3d-stage-hint\{[^}]*pointer-events:none/);
    expect(i3d).toMatch(/\.i3d-stage\[data-interacting\] \.i3d-stage-hint\{opacity:0\}/);
  });
  it("every control keeps a visible focus ring, the scene too", () => {
    expect(i3d).toMatch(/\.i3d-controls button:focus-visible,\.i3d-target-list button:focus-visible,[^{]*\{outline:var\(--eb-focus-ring\)/);
    expect(i3d).toMatch(/\.i3d-scene:focus-visible\{outline:3px solid var\(--eb-primary\)/);
  });
  it("touch: 44 px controls; the chosen answer is shown by form (a filled indicator), not colour alone", () => {
    expect(media(i3d, "@media(pointer:coarse)")).toMatch(/\.i3d-controls button,\.i3d-options select\{min-height:44px\}/);
    expect(i3d).toMatch(/\.i3d-target-list button\.is-selected::before\{[^}]*background:var\(--eb-primary-strong\)/);
  });
  it("only the decorative hint is ever hidden on screen (phones); controls are hidden only in print", () => {
    const screenCss = i3d.replace(/@media print\{[\s\S]*?\}\}/, "");
    const hidden = [...screenCss.matchAll(/([^{}]+)\{[^{}]*display:none/g)].map(m => m[1].trim());
    expect(hidden).toEqual([".i3d-stage-hint"]);
  });
  it("reduced motion removes every new transition and the SmartSim loading pulse", () => {
    expect(media(i3d, "@media(prefers-reduced-motion:reduce)")).toMatch(/\.i3d-controls button,\.i3d-target-list button,\.i3d-stage-hint\{transition:none\}/);
    expect(media(sim, "@media (prefers-reduced-motion:reduce){.smartsim-loading")).toMatch(/animation:none/);
  });
  it("SmartSim: the frame keeps its [hidden] rule and the new chrome never sets its height, display or position (height handshake)", () => {
    expect(sim).toContain(".smartsim-frame[hidden]{display:none}");
    const premium = sim.slice(sim.indexOf(".smartsim-host{gap:var(--eb-space-2)}"));
    for (const m of premium.matchAll(/\.smartsim-frame\{([^}]*)\}/g)) expect(m[1]).not.toMatch(/(^|;)\s*(height|display|position|min-height|max-height)\s*:/);
  });
  it("the Phase 21E chrome is token-only (the scene drawing keeps its own colours)", () => {
    const chrome = (i3d.slice(i3d.indexOf(".i3d{display:grid"), i3d.indexOf(".i3d-face{stroke-width")) + i3d.slice(i3d.indexOf(".i3d-target-list{display:grid"), i3d.indexOf(".i3d-editor{")))
      .replace(/\b(Highlight|Canvas|CanvasText)\b/g, "");
    expect(chrome.length).toBeGreaterThan(2000);
    expect(chrome).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(/);
    const simChrome = sim.slice(sim.indexOf(".smartsim-host{gap:var(--eb-space-2)}"), sim.indexOf(".qt-simulation{"));
    expect(simChrome.replace(/\b(Canvas|CanvasText)\b/g, "")).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(/);
  });
});
