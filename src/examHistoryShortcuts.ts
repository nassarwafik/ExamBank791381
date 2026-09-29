// Phase 13A — keyboard contract of the builder's undo / redo (pure, DOM-type only; no React).
//   Ctrl/Cmd+Z = undo · Ctrl+Y or Ctrl/Cmd+Shift+Z = redo.
// Text-editing targets (input / textarea / select / contenteditable) keep the browser's NATIVE undo / redo: the
// builder's shortcuts act only when focus is outside them, so a teacher typing in a field is never surprised.

export type HistoryKey = { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean };

export function historyShortcut(e: HistoryKey): "undo" | "redo" | null {
  if (e.altKey || !(e.ctrlKey || e.metaKey)) return null;
  const k = e.key.toLowerCase();
  if (k === "z") return e.shiftKey ? "redo" : "undo";
  if (k === "y" && e.ctrlKey && !e.metaKey && !e.shiftKey) return "redo";   // Cmd+Y is the browser's history shortcut
  return null;
}

const NON_TEXT_INPUTS = new Set(["button", "checkbox", "radio", "submit", "reset", "file", "range", "color"]);
export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const ce = target.getAttribute("contenteditable");
  if (target.isContentEditable || ce === "" || ce === "true" || ce === "plaintext-only") return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return !NON_TEXT_INPUTS.has(String((target as HTMLInputElement).type || "text").toLowerCase());
  return false;
}
