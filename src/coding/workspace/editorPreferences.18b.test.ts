// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DEFAULT_EDITOR_PREFERENCES, EDITOR_FONT_SIZES, EDITOR_PREFERENCES_KEY, getEditorPreferences, lineHeightFor, normalizeEditorPreferences, resetEditorPreferencesForTests, setEditorPreferences, subscribeEditorPreferences, type EditorPreferences } from "./editorPreferences";

// Phase 18B — editor UI preferences: device-level presentation choices (font size, wrap, minimap, line numbers). They live in ONE
// fixed localStorage key, never in the Answer, never in a question, never on the wire. Storage failures fall back to memory for
// the current page. Every stored value is re-validated on read (fail closed to the defaults, field by field).

beforeEach(() => resetEditorPreferencesForTests());
afterEach(() => { resetEditorPreferencesForTests(); vi.restoreAllMocks(); });

describe("18B editor preferences — model", () => {
  it("defaults match the 17F-C1 editor (14 px, no wrap, no minimap, line numbers on) and are frozen", () => {
    expect(DEFAULT_EDITOR_PREFERENCES).toEqual({ fontSize: 14, wordWrap: false, minimap: false, lineNumbers: true });
    expect(Object.isFrozen(DEFAULT_EDITOR_PREFERENCES)).toBe(true);
    expect(EDITOR_FONT_SIZES).toContain(14);
    expect([...EDITOR_FONT_SIZES]).toEqual([...EDITOR_FONT_SIZES].sort((a, b) => a - b));
  });
  it("line height scales with the font size and reproduces the 17F-C1 pair exactly (14 → 22)", () => {
    expect(lineHeightFor(14)).toBe(22);
    expect(lineHeightFor(20)).toBeGreaterThan(lineHeightFor(14));
    expect(Number.isInteger(lineHeightFor(13))).toBe(true);
  });
  it("normalize fails closed per field: unknown sizes, strings, nulls and extra keys never survive; nothing answer-like can be stored", () => {
    expect(normalizeEditorPreferences(undefined)).toEqual(DEFAULT_EDITOR_PREFERENCES);
    expect(normalizeEditorPreferences("junk")).toEqual(DEFAULT_EDITOR_PREFERENCES);
    expect(normalizeEditorPreferences({ fontSize: 99, wordWrap: "yes", minimap: 1, lineNumbers: null })).toEqual(DEFAULT_EDITOR_PREFERENCES);
    expect(normalizeEditorPreferences({ fontSize: 18, wordWrap: true, minimap: true, lineNumbers: false, source: "print(1)", language: "java" })).toEqual({ fontSize: 18, wordWrap: true, minimap: true, lineNumbers: false });
    expect(Object.keys(normalizeEditorPreferences({ source: "x" }))).toEqual(["fontSize", "wordWrap", "minimap", "lineNumbers"]);
  });
});

describe("18B editor preferences — storage", () => {
  it("round-trips through the fixed key; a partial patch keeps the other fields; subscribers are notified; the snapshot is stable until a change", () => {
    const seen: EditorPreferences[] = [];
    const off = subscribeEditorPreferences(() => seen.push(getEditorPreferences()));
    const first = getEditorPreferences();
    expect(getEditorPreferences()).toBe(first);                                                            // same reference: useSyncExternalStore-safe
    setEditorPreferences({ fontSize: 16 });
    expect(JSON.parse(localStorage.getItem(EDITOR_PREFERENCES_KEY)!)).toEqual({ fontSize: 16, wordWrap: false, minimap: false, lineNumbers: true });
    setEditorPreferences({ wordWrap: true });
    expect(getEditorPreferences()).toEqual({ fontSize: 16, wordWrap: true, minimap: false, lineNumbers: true });
    expect(seen).toHaveLength(2);
    off();
    setEditorPreferences({ minimap: true });
    expect(seen).toHaveLength(2);
  });
  it("a corrupt or foreign stored value is ignored (defaults), never thrown", () => {
    localStorage.setItem(EDITOR_PREFERENCES_KEY, "{not json");
    resetEditorPreferencesForTests({ keepStorage: true });
    expect(getEditorPreferences()).toEqual(DEFAULT_EDITOR_PREFERENCES);
    localStorage.setItem(EDITOR_PREFERENCES_KEY, JSON.stringify({ fontSize: "18", lineNumbers: false }));
    resetEditorPreferencesForTests({ keepStorage: true });
    expect(getEditorPreferences()).toEqual({ ...DEFAULT_EDITOR_PREFERENCES, lineNumbers: false });
  });
  it("storage unavailable (privacy mode / quota): the choice still applies in memory for this page and nothing throws", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    resetEditorPreferencesForTests({ keepStorage: true });
    expect(() => setEditorPreferences({ fontSize: 20 })).not.toThrow();
    expect(getEditorPreferences().fontSize).toBe(20);
    get.mockRestore(); set.mockRestore();
  });
  it("another tab's change (storage event) is picked up", () => {
    const seen: number[] = [];
    const off = subscribeEditorPreferences(() => seen.push(getEditorPreferences().fontSize));
    localStorage.setItem(EDITOR_PREFERENCES_KEY, JSON.stringify({ fontSize: 13, wordWrap: false, minimap: false, lineNumbers: true }));
    window.dispatchEvent(new StorageEvent("storage", { key: EDITOR_PREFERENCES_KEY }));
    expect(seen).toEqual([13]);
    off();
  });
});
