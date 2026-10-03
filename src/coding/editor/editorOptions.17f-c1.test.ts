import { describe, it, expect } from "vitest";
import { CODING_LANGUAGES } from "../../codingQuestion";
import { EDITOR_ASSISTANCE_OFF, EDITOR_BASE_OPTIONS, EDITOR_EDITING_FEATURES, EDITOR_LANGUAGE_MODES, SMARTASSESS_EDITOR_THEME, editorCreateOptions, editorLanguageMode } from "./editorOptions";

// Phase 17F-C1 — the PURE editor contract (no Monaco import, no DOM): language → syntax mode mapping, the frozen option set every
// editor instance is created with, and the light theme. These constants are what the Monaco adapter hands to `editor.create`, so a
// mutation here (M1–M8) is a mutation of the product.

describe("17F-C1 editor options — language mapping (ED1–ED4, M7, M8)", () => {
  it("ED1 Python maps to Monaco's python mode", () => { expect(editorLanguageMode("python")).toBe("python"); });
  it("ED2 Java maps to Monaco's java mode", () => { expect(editorLanguageMode("java")).toBe("java"); });
  it("ED3 C# maps to Monaco's csharp mode (never plaintext)", () => { expect(editorLanguageMode("csharp")).toBe("csharp"); });
  it("the mapping is data for EXACTLY the registry languages; unknown / foreign keys fail closed to plaintext (no language guessing)", () => {
    expect(Object.keys(EDITOR_LANGUAGE_MODES).sort()).toEqual(CODING_LANGUAGES.map(l => l.key).sort());
    for (const l of CODING_LANGUAGES) expect(EDITOR_LANGUAGE_MODES[l.key]).toBe(l.editorLanguage);
    expect(new Set(Object.values(EDITOR_LANGUAGE_MODES)).size).toBe(3);                                   // M8: no two languages share a mode
    for (const bad of ["javascript", "cpp", "PYTHON", "", undefined, null, 3, {}]) expect(editorLanguageMode(bad)).toBe("plaintext");
    expect(Object.isFrozen(EDITOR_LANGUAGE_MODES)).toBe(true);
  });
});

describe("17F-C1 editor options — solution assistance is OFF (ED11–ED18, M1–M6)", () => {
  const o = EDITOR_ASSISTANCE_OFF as Record<string, unknown>;
  it("ED11 the suggest widget can show nothing: words, snippets, previews, details, icons all off", () => {
    expect(o.suggest).toMatchObject({ showWords: false, showSnippets: false, preview: false, showInlineDetails: false, showIcons: false, filterGraceful: false, showStatusBar: false });
  });
  it("ED12 quick suggestions off (M1)", () => { expect(o.quickSuggestions).toBe(false); });
  it("ED13 trigger-character suggestions off (M3)", () => { expect(o.suggestOnTriggerCharacters).toBe(false); });
  it("ED14 word-based suggestions off (M2)", () => { expect(o.wordBasedSuggestions).toBe("off"); });
  it("ED15 inline suggestions / ghost text off (M4)", () => { expect(o.inlineSuggest).toMatchObject({ enabled: false }); });
  it("ED16 parameter hints off (M5)", () => { expect(o.parameterHints).toMatchObject({ enabled: false }); });
  it("ED17 snippet completion off", () => { expect(o.snippetSuggestions).toBe("none"); });
  it("ED18 Tab completion off; Enter / commit characters never accept a suggestion (M6)", () => {
    expect(o.tabCompletion).toBe("off");
    expect(o.acceptSuggestionOnEnter).toBe("off");
    expect(o.acceptSuggestionOnCommitCharacter).toBe(false);
  });
  it("every other assistance surface is off: hover, code lens, light bulb, links, inlay hints, format-on-type/paste, drop / paste-as", () => {
    expect(o.hover).toMatchObject({ enabled: false });
    expect(o.codeLens).toBe(false);
    expect(o.lightbulb).toMatchObject({ enabled: "off" });
    expect(o.links).toBe(false);
    expect(o.inlayHints).toMatchObject({ enabled: "off" });
    expect(o.formatOnType).toBe(false);
    expect(o.formatOnPaste).toBe(false);
    expect(o.dropIntoEditor).toMatchObject({ enabled: false });
    expect(o.pasteAs).toMatchObject({ enabled: false });
  });
  it("the set is frozen and is part of EVERY create() option object", () => {
    expect(Object.isFrozen(EDITOR_ASSISTANCE_OFF)).toBe(true);
    const created = editorCreateOptions({ value: "x", languageMode: "python", label: "l", readOnly: false, indentUnit: "    " }) as Record<string, unknown>;
    for (const [k, v] of Object.entries(o)) expect(created[k]).toEqual(v);
  });
});

describe("17F-C1 editor options — allowed editing mechanics (ED6–ED10)", () => {
  const f = EDITOR_EDITING_FEATURES as Record<string, unknown>;
  it("ED6 line numbers on", () => { expect(f.lineNumbers).toBe("on"); });
  it("ED7 bracket matching always + bracket-pair colorization", () => { expect(f.matchBrackets).toBe("always"); expect(f.bracketPairColorization).toMatchObject({ enabled: true }); });
  it("ED8 auto-closing brackets and quotes follow the language definition", () => { expect(f.autoClosingBrackets).toBe("languageDefined"); expect(f.autoClosingQuotes).toBe("languageDefined"); });
  it("ED9 indentation: full auto-indent, spaces, size from the registry indent unit, never auto-detected from the source", () => {
    expect(f.autoIndent).toBe("full"); expect(f.insertSpaces).toBe(true); expect(f.detectIndentation).toBe(false);
    expect((editorCreateOptions({ value: "", languageMode: "java", label: "l", readOnly: false, indentUnit: "    " }) as Record<string, unknown>).tabSize).toBe(4);
    expect((editorCreateOptions({ value: "", languageMode: "java", label: "l", readOnly: false, indentUnit: "  " }) as Record<string, unknown>).tabSize).toBe(2);
  });
  it("ED10 Find stays available (and never seeds from outside the selection); folding on; current-line highlight on", () => {
    expect(f.find).toMatchObject({ autoFindInSelection: "never", seedSearchStringFromSelection: "selection" });
    expect(f.folding).toBe(true);
    expect(f.renderLineHighlight).toBe("line");
  });
  it("source stays authoritative text: no word wrap, no minimap, no auto-formatting, bounded layout handled by the editor", () => {
    const b = EDITOR_BASE_OPTIONS as Record<string, unknown>;
    expect(b.wordWrap).toBe("off"); expect(b.minimap).toMatchObject({ enabled: false }); expect(b.automaticLayout).toBe(true);
    expect(b.scrollBeyondLastLine).toBe(false); expect(b.fixedOverflowWidgets).toBe(true); expect(b.editContext).toBe(false);
    expect(Object.isFrozen(EDITOR_BASE_OPTIONS)).toBe(true);
  });
});

describe("17F-C1 editor options — create() input and the theme", () => {
  it("ariaLabel, readOnly + domReadOnly, the language-aware read-only message and the SmartAssess theme are set per instance", () => {
    const ro = editorCreateOptions({ value: "print(1)", languageMode: "python", label: "محرر الكود", readOnly: true, indentUnit: "    " }) as Record<string, unknown>;
    expect(ro.ariaLabel).toBe("محرر الكود"); expect(ro.readOnly).toBe(true); expect(ro.domReadOnly).toBe(true);
    expect(ro.theme).toBe(SMARTASSESS_EDITOR_THEME.name);
    expect(String((ro.readOnlyMessage as { value: string }).value)).toMatch(/للقراءة فقط/);
    const rw = editorCreateOptions({ value: "", languageMode: "python", label: "x", readOnly: false, indentUnit: "    " }) as Record<string, unknown>;
    expect(rw.readOnly).toBe(false); expect(rw.domReadOnly).toBe(false);
    expect("value" in rw).toBe(false);                                                                   // the model carries the value, not the options
  });
  it("the theme is a LIGHT theme on the vs base with distinct colours for keywords, strings, numbers, comments and types (not a dark VS Code clone)", () => {
    expect(SMARTASSESS_EDITOR_THEME.name).toBe("smartassess-light");
    expect(SMARTASSESS_EDITOR_THEME.data.base).toBe("vs");
    const colour = (token: string) => SMARTASSESS_EDITOR_THEME.data.rules.find(r => r.token === token)?.foreground;
    const set = new Set([colour("keyword"), colour("string"), colour("number"), colour("comment"), colour("type")]);
    expect([...set].every(c => typeof c === "string" && /^[0-9a-f]{6}$/i.test(c))).toBe(true);
    expect(set.size).toBe(5);
    expect(SMARTASSESS_EDITOR_THEME.data.colors["editor.background"]).toBe("#ffffff");
    expect(SMARTASSESS_EDITOR_THEME.data.colors["editor.lineHighlightBackground"]).toBeTruthy();
  });
});
