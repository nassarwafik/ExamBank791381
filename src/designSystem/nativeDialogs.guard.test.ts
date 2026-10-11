/// <reference types="node" />
// Phase 21E.1 (slice 1) — design-system guard: the product never opens a NATIVE browser dialog.
//
// `window.confirm` / `window.alert` / `window.prompt` are unstyled, left-to-right, English-buttoned ("OK" / "Cancel"),
// block the whole browser, ignore the design tokens, the focus ring and the dialog layer, and cannot be certified in the
// harness. The shared `useConfirm()` → ConfirmDialog (src/ui) is the ONE confirmation path (RTL, Arabic labels, danger
// tone starts on «إلغاء», Escape / backdrop cancel, focus restored). Before 21E.1 twelve call sites remained
// (App.tsx ×7 incl. one window.prompt, ExamSectionEditor, ExamCoverEditor ×2, QuestionMediaEditor ×2). This guard reads
// the sources from disk (never the DOM) so it fails on the first re-introduction, anywhere under src/.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";

const SRC = fileURLToPath(new URL("..", import.meta.url));
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== "node_modules") sources(full, out); }
    else if (/\.(tsx?|jsx?|mjs)$/.test(name) && !/\.test\.|\.spec\./.test(name) && !/\.bak/.test(name)) out.push(full);
  }
  return out;
}
const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " ")).replace(/(^|[^:\\"'`])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));
// A bare `prompt(` / `alert(` call — but not a method SIGNATURE such as `prompt(): Promise<…>` (the BeforeInstallPromptEvent type).
const NATIVE = /\bwindow\s*\.\s*(confirm|alert|prompt)\s*\(|(^|[^.\w$])(alert|prompt)\s*\((?!\s*\)\s*:)/;

describe("21E.1 — no native browser dialogs in product code (src/**)", () => {
  const files = sources(SRC).map(f => ({ file: relative(SRC, f).replace(/\\/g, "/"), code: stripComments(readFileSync(f, "utf8")) }));

  it("scans the product sources (sanity)", () => {
    expect(files.length).toBeGreaterThan(300);
    expect(files.some(f => f.file === "App.tsx")).toBe(true);
  });

  it("window.confirm / window.alert / window.prompt / bare alert() / prompt() never appear", () => {
    const offenders: string[] = [];
    for (const f of files) {
      f.code.split("\n").forEach((line, i) => { if (NATIVE.test(line)) offenders.push(f.file + ":" + (i + 1) + "  " + line.trim().slice(0, 100)); });
    }
    expect(offenders, "use `const { confirm, confirmDialog } = useConfirm()` (src/ui/useConfirm.tsx):\n" + offenders.join("\n")).toEqual([]);
  });

  it("the migrated surfaces confirm through the shared adapter (pins)", () => {
    for (const [file, hook] of [["App.tsx", "useDeferredConfirm"], ["ExamSectionEditor.tsx", "useConfirm"], ["ExamCoverEditor.tsx", "useConfirm"], ["QuestionMediaEditor.tsx", "useConfirm"]] as const) {
      const f = files.find(x => x.file === file)!;
      expect(f.code, file + " imports " + hook).toMatch(new RegExp("import \\{ " + hook + " \\} from \"\\./ui/" + hook + "\""));
      expect(f.code, file + " renders confirmDialog").toMatch(/\{confirmDialog\}/);
    }
  });
});
