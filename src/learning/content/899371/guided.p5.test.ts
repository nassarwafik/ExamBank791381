// 899371 P5 (docs/enterprise-899371-learning-plan.md §17) — the teacher-led walkthroughs «نحلّ معًا»:
//   • place: each summary lesson of chapters 1–11 ends with 3–5 pages «نحلّ معًا: …» AFTER all its book pages (the book's pages, lessons
//     and ids are untouched; bookLock.test.ts), each page = the program (if any) + ONE guided reveal, enrichment only;
//   • shape: guided/reveal/v1 with restart + full screen, a prompt, 3–5 steps with unique ids, a result and an explanation, code
//     written as left-to-right code spans (no stray backtick) of at most 24 characters (they never wrap on a phone);
//   • results: the printed result of every walkthrough program is what the RECORDED RUN of exactly that program and input printed
//     (guided/proofs.json, scripts/prove-899371-practice.mjs) — judged here again on the course, independently of the prover;
//   • parallel, not copied (owner, 2026-11-09): no walkthrough program is one of the book's programs;
//   • open content: a walkthrough is served as authored (nothing to hide), and it is not an exercise — no key, no Strength.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import manifest from "./manifest";
import proofsFile from "./guided/proofs.json";
import traceRuns from "./traces/runs.json";
import { loadBundledModuleContent } from "../bundledModules";
import type { ContentBlock, ContentModule, ContentPage } from "../types";
// @ts-expect-error — plain ESM tools shared with the converter and the prover; untyped on purpose.
import { readGuided, GUIDED_NOTE } from "../../../../scripts/convert-899371.mjs";
// @ts-expect-error — plain ESM tools shared with the converter and the prover; untyped on purpose.
import { wrapProgram, proofSha } from "../../../../scripts/prove-899371-practice.mjs";

const CID = "899371";
type Walkthrough = { title: string; prompt: string; steps: string[]; result: string; explanation: string; program?: string; stdin?: string; output?: string; runtimeError?: string };
type Proof = { sha: string; stdin?: string; compileExit: number; exitCode: number; stdout: string; exception: string | null };
type Guided = Extract<ContentBlock, { type: "guided" }>;
const authored = readGuided() as Record<string, Walkthrough[]>;
const proofs = proofsFile.proofs as Record<string, Proof>;
const CHAPTERS = Array.from({ length: 11 }, (_, i) => "m" + String(i + 1).padStart(2, "0"));
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const spansText = (spans: { text: string }[] | undefined) => (spans ?? []).map(s => s.text).join("");
/** The printed lines of a run, joined by « | ». */
const printed = (stdout: string) => stdout.split("\n").map(l => l.replace(/\r$/, "").trimEnd()).filter((l, i, a) => l !== "" || i < a.length - 1).join(" | ");

async function modules(): Promise<ContentModule[]> {
  const out: ContentModule[] = [];
  for (const m of manifest.modules) out.push(await loadBundledModuleContent(CID, m.id));
  return out;
}
const isWalkthrough = (p: ContentPage) => p.source?.sourceNote === GUIDED_NOTE;
async function walkthroughs() {
  const out: { chapter: string; n: number; page: ContentPage; block: Guided; code?: string; w: Walkthrough }[] = [];
  for (const m of await modules()) {
    const chapter = m.id.slice(-3);
    let n = 0;
    for (const l of m.lessons) for (const p of l.pages.filter(isWalkthrough)) {
      const block = p.blocks.find(b => b.type === "guided") as Guided;
      const code = p.blocks.find(b => b.type === "code") as Extract<ContentBlock, { type: "code" }> | undefined;
      out.push({ chapter, n: ++n, page: p, block, code: code?.code, w: authored[chapter][n - 1] });
    }
  }
  return out;
}

describe("899371 P5 — «نحلّ معًا»", () => {
  it("each summary lesson of chapters 1–11 ends with 3–5 walkthrough pages, after all its book pages; 44 in all", async () => {
    expect(Object.keys(authored).sort()).toEqual(CHAPTERS);
    let total = 0;
    for (const m of await modules()) {
      const chapter = m.id.slice(-3);
      const withWalkthroughs = m.lessons.filter(l => l.pages.some(isWalkthrough));
      if (!CHAPTERS.includes(chapter)) { expect(withWalkthroughs, m.id).toEqual([]); continue; }
      expect(withWalkthroughs.map(l => l.title), m.id).toEqual([m.lessons.find(l => l.order === 1)!.title]);
      const pages = withWalkthroughs[0].pages;
      const first = pages.findIndex(isWalkthrough);
      expect(pages.slice(first).every(isWalkthrough), m.id + " walkthroughs come last in the summary").toBe(true);
      expect(first, m.id + " the summary's book pages come first").toBeGreaterThan(0);
      const count = pages.length - first;
      expect(count, m.id).toBeGreaterThanOrEqual(3);
      expect(count, m.id).toBeLessThanOrEqual(5);
      expect(count, m.id).toBe(authored[chapter].length);
      total += count;
    }
    expect(total).toBe(44);
  }, 30000);

  it("each walkthrough page holds its program (if any) then one guided reveal (then, P6, its tracer if traced), all enrichment", async () => {
    for (const { chapter, n, page, block, w } of await walkthroughs()) {
      const traced = (`${chapter}/g${String(n).padStart(2, "0")}`) in traceRuns.runs;
      expect(page.layout, page.id).toBeUndefined();
      expect(page.title, page.id).toBe("نحلّ معًا: " + w.title);
      expect(page.blocks.map(b => b.type), page.id).toEqual([...(w.program ? ["code"] : []), "guided", ...(traced ? ["simulation"] : [])]);
      for (const b of page.blocks) expect(b.origin, b.id).toBe("teacher-enrichment");
      expect(block.title, page.id).toBe(w.title);
    }
  }, 30000);

  it("every guided block is a well-formed reveal: restart + full screen, prompt, 3–5 unique steps, result, explanation, code spans", async () => {
    for (const { block } of await walkthroughs()) {
      expect([block.guidedType, block.version], block.id).toEqual(["reveal", 1]);
      expect(block.capabilities, block.id).toEqual({ fullscreen: true, reset: true });
      expect(spansText(block.prompt).length, block.id).toBeGreaterThan(15);
      expect(block.steps.length, block.id).toBeGreaterThanOrEqual(3);
      expect(block.steps.length, block.id).toBeLessThanOrEqual(5);
      expect(new Set(block.steps.map(s => s.id)).size, block.id).toBe(block.steps.length);
      expect(spansText(block.result).length, block.id).toBeGreaterThan(5);
      expect((block.explanation ?? "").length, block.id).toBeGreaterThan(20);
      const spans = [...(block.prompt ?? []), ...block.steps.flatMap(s => s.text), ...(block.result ?? [])];
      for (const s of spans) {
        expect(s.text, block.id).not.toContain("`");
        if (s.style === "code") {
          expect(s.dir, block.id).toBe("ltr");
          expect(s.text.length, block.id + " a code fragment never wraps (reader.css), so it stays short: " + s.text).toBeLessThanOrEqual(24);
        }
      }
    }
  }, 30000);

  it("the printed result of every walkthrough program is what the recorded run of exactly that program printed", async () => {
    let checked = 0;
    for (const { chapter, n, block, code, w } of await walkthroughs()) {
      const key = `${chapter}/g${String(n).padStart(2, "0")}`;
      if (!w.program) { expect(code, key).toBeUndefined(); expect(proofs[key], key).toBeUndefined(); continue; }
      expect(code, key).toBe(w.program);
      const proof = proofs[key];
      expect(proof, key + " was run").toBeDefined();
      expect(proof.sha, key + " proof belongs to this program and input").toBe(proofSha(wrapProgram(w.program), w.stdin));
      expect(proof.stdin, key).toBe(w.stdin);
      expect(proof.compileExit, key + " compiles").toBe(0);
      const shown = norm(spansText(block.result));
      const codeShown = (block.result ?? []).filter(s => s.style === "code").map(s => norm(s.text));   // the result's program text, in order
      if (w.runtimeError !== undefined) {
        expect(proof.exitCode, key).not.toBe(0);
        expect(proof.exception, key).toBe(w.runtimeError);
        expect(shown, key).toContain(w.runtimeError);
        expect(codeShown, key).toContain(w.runtimeError);
      } else {
        expect([proof.exitCode, proof.exception], key + " ran cleanly").toEqual([0, null]);
        const out = printed(proof.stdout);
        expect(norm(out), key).toBe(norm(w.output!));
        expect(codeShown, key + " the result shows exactly the printed lines, in order").toEqual(out.split(" | ").map(norm));
      }
      checked++;
    }
    expect(checked).toBe(43);
    expect(Object.keys(proofs).length).toBe(43);
    expect(proofsFile.worker).toBe("csharp@1");
  }, 30000);

  it("no walkthrough program is one of the book's own programs (parallel, never a book assignment's own answer)", async () => {
    const book = new Set((await modules()).flatMap(m => m.lessons.flatMap(l => l.pages.flatMap(p => p.blocks))).filter(b => b.type === "code" && b.origin === "book").map(b => norm((b as { code: string }).code)));
    for (const { block, code } of await walkthroughs()) if (code) expect(book.has(norm(code)), block.id).toBe(false);
  }, 30000);

  it("a walkthrough is open content: served as authored, never a checkable exercise, never counted in Strength", async () => {
    const data = (p: string) => JSON.parse(readFileSync(fileURLToPath(new URL("../../../../api/src/data/" + p, import.meta.url)), "utf8"));
    const check = JSON.stringify(data("learning-check/" + CID + ".json"));
    const study = data("learning-study/" + CID + ".json");
    for (const { page, block } of await walkthroughs()) {
      const served = data(`learning-content/${CID}/${page.id.split("-").slice(0, 2).join("-")}.json`) as ContentModule;
      const b = served.lessons.flatMap(l => l.pages).find(p => p.id === page.id)!.blocks.find(x => x.id === block.id);
      expect(b, block.id).toEqual(JSON.parse(JSON.stringify(block)));
      expect(check, block.id).not.toContain(block.id);
      expect(study.pages[page.id], page.id).toBeUndefined();
    }
  }, 30000);
});
