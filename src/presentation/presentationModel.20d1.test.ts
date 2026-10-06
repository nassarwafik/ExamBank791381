import { describe, it, expect } from "vitest";
import * as P from "./presentationModel";

// Phase 20D.1 — ExamPresentationV1: a versioned, data-only, code-owned presentation contract. Fail-first on 0b22080: the module does not
// exist. JSON references code-owned vocabulary only (presets, token words, strict #RRGGBB colours, slot variants, type variants); it never
// carries CSS, HTML, selectors, URLs, class or component names. Malformed → blocking finalization issues and a safe runtime fallback.
const codes = (raw: unknown) => P.validatePresentation(raw).issues.filter(i => i.severity === "error").map(i => i.code);
const base = () => ({ schemaVersion: 1, preset: "modernAcademic" });

describe("20D1-P1 vocabulary and presets", () => {
  it("eleven code-owned production presets, each resolving to complete tokens, layout, components and type variants", () => {
    expect(Object.keys(P.PRESENTATION_PRESETS)).toEqual(["default", "classicPaper", "modernAcademic", "cards", "focus", "compact", "scienceLab", "networkLab", "developerWorkspace", "friendly", "highContrast"]);
    for (const id of Object.keys(P.PRESENTATION_PRESETS)) {
      const r = P.resolvePresentation({ schemaVersion: 1, preset: id })!;
      expect(r.fallback, id).toBe(false);
      expect(Object.keys(r.tokens.colors).sort()).toEqual(["accent", "background", "border", "danger", "muted", "primary", "success", "surface", "surfaceAlt", "text", "warning"]);
      for (const slot of Object.keys(P.PRESENTATION_VOCABULARY.slots)) expect(P.PRESENTATION_VOCABULARY.slots[slot as keyof typeof P.PRESENTATION_VOCABULARY.slots]).toContain(r.components[slot as keyof typeof r.components]);
    }
  });
  it("every preset passes the documented WCAG contrast policy", () => {
    for (const id of Object.keys(P.PRESENTATION_PRESETS)) expect(P.presentationContrastIssues(P.resolvePresentation({ schemaVersion: 1, preset: id })!.tokens.colors), id).toEqual([]);
  });
  it("the vocabulary is discoverable, frozen data (for safe future generation): slots, variants, type variants, token words", () => {
    const v = P.PRESENTATION_VOCABULARY;
    expect(Object.isFrozen(v)).toBe(true);
    expect(v.typeVariants).toEqual(["standard", "writingPaper", "developerWorkspace", "laboratory", "networkWorkspace", "storyWorkspace", "visualWorkspace"]);
    expect(v.families).toEqual(["systemArabic", "systemSans", "academicSerif", "developerMono"]);
    expect(Object.keys(v.slots)).toEqual(expect.arrayContaining(["examHeader", "sectionHeader", "questionCard", "questionNumber", "marksBadge", "questionStem", "table", "callout", "answerArea", "navigation"]));
  });
});

describe("20D1-P2 strict validation — every violation blocks, nothing is repaired", () => {
  const cases: [string, unknown, string][] = [
    ["not an object", "modern", "PRESENTATION_INVALID"],
    ["future schema version", { ...base(), schemaVersion: 2 }, "PRESENTATION_VERSION"],
    ["missing schema version", { preset: "default" }, "PRESENTATION_VERSION"],
    ["unknown preset", { ...base(), preset: "neon" }, "PRESENTATION_PRESET"],
    ["unknown root key", { ...base(), css: "body{display:none}" }, "PRESENTATION_UNKNOWN_KEY"],
    ["prototype key", JSON.parse('{"schemaVersion":1,"preset":"default","__proto__":{"x":1}}'), "PRESENTATION_UNKNOWN_KEY"],
    ["named colour", { ...base(), tokens: { colors: { primary: "red" } } }, "PRESENTATION_COLOR"],
    ["rgb() colour", { ...base(), tokens: { colors: { primary: "rgb(0,0,0)" } } }, "PRESENTATION_COLOR"],
    ["css var colour", { ...base(), tokens: { colors: { primary: "var(--x)" } } }, "PRESENTATION_COLOR"],
    ["url() smuggled as a colour", { ...base(), tokens: { colors: { background: "url(https://x/y.png)" } } }, "PRESENTATION_COLOR"],
    ["expression()", { ...base(), tokens: { colors: { text: "expression(alert(1))" } } }, "PRESENTATION_COLOR"],
    ["8-digit hex", { ...base(), tokens: { colors: { primary: "#11223344" } } }, "PRESENTATION_COLOR"],
    ["unknown colour token", { ...base(), tokens: { colors: { overlay: "#000000" } } }, "PRESENTATION_UNKNOWN_KEY"],
    ["external font", { ...base(), tokens: { typography: { family: "url(https://fonts.example/x.woff2)" } } }, "PRESENTATION_TOKEN"],
    ["raw css length", { ...base(), tokens: { radius: "12px" } }, "PRESENTATION_TOKEN"],
    ["unknown slot", { ...base(), components: { submitButton: { variant: "hidden" } } }, "PRESENTATION_UNKNOWN_KEY"],
    ["unknown variant", { ...base(), components: { questionCard: { variant: "position:fixed" } } }, "PRESENTATION_VARIANT"],
    ["class name smuggled as variant", { ...base(), components: { table: { variant: "iex-topbar" } } }, "PRESENTATION_VARIANT"],
    ["unknown type key", { ...base(), questionTypeVariants: { essay: "writingPaper" } }, "PRESENTATION_TYPE_VARIANT"],
    ["unknown type variant", { ...base(), questionTypeVariants: { coding: "Monaco" } }, "PRESENTATION_TYPE_VARIANT"],
    ["unknown layout value", { ...base(), layout: { pageWidth: "100vw" } }, "PRESENTATION_TOKEN"],
    ["non-boolean sticky", { ...base(), layout: { stickyTopBar: "yes" } }, "PRESENTATION_TOKEN"],
    ["unknown motion", { ...base(), motion: { level: "wild" } }, "PRESENTATION_TOKEN"],
    ["unknown print", { ...base(), print: { mode: "poster" } }, "PRESENTATION_TOKEN"],
    ["unsupported appearance", { ...base(), appearance: "neon" }, "PRESENTATION_TOKEN"],
    ["unreadable palette (white text)", { ...base(), tokens: { colors: { text: "#FFFFFF" } } }, "PRESENTATION_CONTRAST"],
    ["muted below AA on the surface", { ...base(), tokens: { colors: { muted: "#CCCCCC" } } }, "PRESENTATION_CONTRAST"]
  ];
  for (const [name, raw, code] of cases) it(name + " → " + code, () => expect(codes(raw)).toContain(code));
  it("a complete valid presentation (the documented example) has no issue and its canonical value equals the input", () => {
    const full = { schemaVersion: 1, preset: "networkLab", direction: "rtl", appearance: "light",
      tokens: { colors: { primary: "#0F4C81", accent: "#0284C7", background: "#F5F8FC", surface: "#FFFFFF", text: "#172033" }, typography: { family: "systemArabic", scale: "comfortable", lineHeight: "relaxed", questionWeight: "medium" }, spacing: "comfortable", radius: "lg", shadow: "medium" },
      layout: { pageWidth: "wide", questionSpacing: "comfortable", sectionSpacing: "large", stickyTopBar: true, scenarioPlacement: "responsiveSide" },
      components: { sectionHeader: { variant: "band" }, questionCard: { variant: "elevated" }, marksBadge: { variant: "pill" }, table: { variant: "striped" } },
      questionTypeVariants: { smartSim: "networkWorkspace", coding: "developerWorkspace", composite: "storyWorkspace", openResponse: "writingPaper" },
      motion: { level: "subtle" }, print: { mode: "academic" } };
    const r = P.validatePresentation(full);
    expect(r.issues).toEqual([]);
    expect(r.value).toEqual(full);
  });
  it("#RGB is normalized to #RRGGBB in the canonical value", () => {
    expect(P.validatePresentation({ ...base(), tokens: { colors: { primary: "#14d" } } }).value!.tokens!.colors!.primary).toBe("#1144DD");
  });
});

describe("20D1-P3 resolver: precedence preset → exam → section → question → type variant; malformed falls back safely", () => {
  it("absent presentation is NOT the engine (legacy path decides); malformed presentation resolves to the default preset with fallback:true", () => {
    expect(P.resolvePresentation(undefined)).toBeNull();
    const r = P.resolvePresentation({ schemaVersion: 9, preset: "networkLab" })!;
    expect(r.fallback).toBe(true);
    expect(r.preset).toBe("default");
    expect(r.tokens).toEqual(P.resolvePresentation({ schemaVersion: 1, preset: "default" })!.tokens);
  });
  it("exam overrides apply on top of the preset; untouched tokens keep the preset value", () => {
    const preset = P.resolvePresentation({ schemaVersion: 1, preset: "classicPaper" })!;
    const r = P.resolvePresentation({ schemaVersion: 1, preset: "classicPaper", tokens: { colors: { primary: "#14532D" } }, components: { table: { variant: "bordered" } } })!;
    expect(r.tokens.colors.primary).toBe("#14532D");
    expect(r.tokens.colors.text).toBe(preset.tokens.colors.text);
    expect(r.components.table).toBe("bordered");
    expect(r.components.questionCard).toBe(preset.components.questionCard);
  });
  it("section overrides are bounded (header / card / number / marks / answer area / question spacing); question overrides narrower still", () => {
    const exam = P.resolvePresentation({ schemaVersion: 1, preset: "modernAcademic" })!;
    const sec = P.resolveSectionPresentation(exam, { schemaVersion: 1, components: { sectionHeader: { variant: "card" }, questionCard: { variant: "paper" } }, layout: { questionSpacing: "compact" } });
    expect([sec.components.sectionHeader, sec.components.questionCard, sec.layout.questionSpacing]).toEqual(["card", "paper", "compact"]);
    expect(P.validateSectionPresentation({ schemaVersion: 1, tokens: { colors: { text: "#000000" } } }).issues.map(i => i.code)).toContain("PRESENTATION_SECTION_OVERRIDE");
    const q = P.resolveQuestionPresentation(sec, { presentationType: "coding", presentation: { schemaVersion: 1, width: "wide", answerArea: "lined" } });
    expect([q.variant, q.width, q.answerArea, q.card]).toEqual(["developerWorkspace", "wide", "lined", "paper"]);
    expect(P.validateQuestionPresentation({ schemaVersion: 1, components: {} }).issues.map(i => i.code)).toContain("PRESENTATION_QUESTION_OVERRIDE");
  });
  it("type variants: exam map → preset defaults (coding developerWorkspace, smartSim laboratory, composite storyWorkspace, openResponse writingPaper) → standard", () => {
    const r = P.resolvePresentation({ schemaVersion: 1, preset: "default" })!;
    const s = P.resolveSectionPresentation(r, undefined);
    const v = (t: string) => P.resolveQuestionPresentation(s, { presentationType: t }).variant;
    expect([v("coding"), v("smartSim"), v("composite"), v("openResponse"), v("multipleChoice")]).toEqual(["developerWorkspace", "laboratory", "storyWorkspace", "writingPaper", "standard"]);
    const net = P.resolveSectionPresentation(P.resolvePresentation({ schemaVersion: 1, preset: "default", questionTypeVariants: { smartSim: "networkWorkspace" } })!, undefined);
    expect(P.resolveQuestionPresentation(net, { presentationType: "smartSim" }).variant).toBe("networkWorkspace");
  });
  it("a malformed section / question override is ignored at runtime (never breaks the exam)", () => {
    const r = P.resolvePresentation({ schemaVersion: 1, preset: "cards" })!;
    expect(P.resolveSectionPresentation(r, { schemaVersion: 1, components: { questionCard: { variant: "evil" } } }).components.questionCard).toBe(r.components.questionCard);
    expect(P.resolveQuestionPresentation(P.resolveSectionPresentation(r, undefined), { presentationType: "open", presentation: { schemaVersion: 1, width: "100%" } }).width).toBe("normal");
  });
});

describe("20D1-P4 CSS variables come only from validated tokens; the student projection is a strict rebuild", () => {
  it("presentationCssVars emits ONLY the known --xp-* names with validated values", () => {
    const vars = P.presentationCssVars(P.resolvePresentation({ schemaVersion: 1, preset: "networkLab", tokens: { colors: { primary: "#0F4C81" } } })!);
    for (const [k, v] of Object.entries(vars)) { expect(k).toMatch(/^--xp-[a-z0-9-]+$/); expect(String(v)).not.toMatch(/url\(|expression|;|\}|\{|<|>|@import|javascript:/i); }
    expect(vars["--xp-primary"]).toBe("#0F4C81");
  });
  it("projectPresentationForStudent returns the canonical copy (no foreign keys) or undefined for malformed data", () => {
    const ok = P.projectPresentationForStudent({ schemaVersion: 1, preset: "focus", motion: { level: "none" } });
    expect(ok).toEqual({ schemaVersion: 1, preset: "focus", motion: { level: "none" } });
    expect(P.projectPresentationForStudent({ schemaVersion: 1, preset: "focus", teacherNote: "secret" })).toBeUndefined();
    expect(P.projectPresentationForStudent({ schemaVersion: 1, preset: "focus", tokens: { colors: { text: "#FFFFFF" } } })).toBeUndefined();
  });
  it("contrastRatio follows the WCAG relative-luminance formula", () => {
    expect(P.contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(P.contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
  });
});
