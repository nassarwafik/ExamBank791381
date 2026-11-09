// 899371 P4 (docs/enterprise-899371-learning-plan.md §16) — the self-study exercises «تدريبات الوحدة» closing chapters 1–11:
//   • shape: each chapter ends with the lesson «تدريبات الوحدة», 10 exercises of at least 4 kinds on practice pages (enrichment only),
//     the right answer revealed after an answer (decision Q3) on every kind that allows it, an explanation for every exercise;
//   • keys: every program exercise shows its program right above it, and its key agrees with the RECORDED RUN of exactly that program
//     and input (proofs.json, scripts/prove-899371-practice.mjs, csharp@1 settings) — judged here again on the course as served,
//     independently of the prover's own judge; every structured key is well-formed and its presentation never gives it away;
//   • parallel, not copied: no exercise program is one of the book's programs (the book's assignments keep their answers hidden);
//   • server authority: the served bodies carry no key, the check index holds every key, the study index counts all 110 in Strength.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import manifest from "./manifest";
import proofsFile from "./practice/proofs.json";
import { loadBundledModuleContent } from "../bundledModules";
import type { ContentBlock, ContentModule, PracticeQuestion } from "../types";
// @ts-expect-error — plain ESM tools shared with the converter and the prover; untyped on purpose.
import { readPractice, PRACTICE_NOTE } from "../../../../scripts/convert-899371.mjs";
// @ts-expect-error — plain ESM tools shared with the converter and the prover; untyped on purpose.
import { wrapProgram, proofSha } from "../../../../scripts/prove-899371-practice.mjs";

const CID = "899371";
type Item = { question: { kind: string }; program?: string; stdin?: string; prove?: "output" | "claim" | "runtime"; claimOutput?: string; runtimeError?: string };
type Proof = { sha: string; stdin?: string; compileExit: number; exitCode: number; stdout: string; exception: string | null };
type Practice = Extract<ContentBlock, { type: "practice" }>;
const authored = readPractice() as Record<string, Item[]>;
const proofs = proofsFile.proofs as Record<string, Proof>;
const data = (p: string) => JSON.parse(readFileSync(fileURLToPath(new URL("../../../../api/src/data/" + p, import.meta.url)), "utf8"));
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
/** The printed lines of a run, joined by « | » as a multi-line output is written in an option. */
const printed = (stdout: string) => stdout.split("\n").map(l => l.replace(/\r$/, "").trimEnd()).filter((l, i, a) => l !== "" || i < a.length - 1).join(" | ");
const CHAPTERS = Array.from({ length: 11 }, (_, i) => "m" + String(i + 1).padStart(2, "0"));

async function modules(): Promise<ContentModule[]> {
  const out: ContentModule[] = [];
  for (const m of manifest.modules) out.push(await loadBundledModuleContent(CID, m.id));
  return out;
}
/** Chapter mNN's exercises as the course shows them: { block, code (the code block right above it, if any), item (authored) }. */
async function exercises() {
  const out: { chapter: string; n: number; page: string; block: Practice; code?: string; item: Item }[] = [];
  for (const m of await modules()) {
    const chapter = m.id.slice(-3);
    const lesson = m.lessons.find(l => l.title === "تدريبات الوحدة");
    if (!lesson) continue;
    let n = 0;
    for (const p of lesson.pages) p.blocks.forEach((b, i) => {
      if (b.type !== "practice") return;
      const above = p.blocks[i - 1];
      out.push({ chapter, n: ++n, page: p.id, block: b, code: above?.type === "code" ? above.code : undefined, item: authored[chapter][n - 1] });
    });
  }
  return out;
}

describe("899371 P4 — «تدريبات الوحدة»", () => {
  it("each of chapters 1–11 ends with «تدريبات الوحدة»: 10 exercises of ≥ 4 kinds on two practice pages, enrichment only", async () => {
    const mods = await modules();
    expect(Object.keys(authored).sort()).toEqual(CHAPTERS);
    for (const m of mods) {
      const last = m.lessons.at(-1)!;
      if (!CHAPTERS.includes(m.id.slice(-3))) { expect(m.lessons.some(l => l.title === "تدريبات الوحدة"), m.id).toBe(false); continue; }
      expect(last.title, m.id).toBe("تدريبات الوحدة");
      expect(last.pages.map(p => [p.layout, p.title, p.source?.sourceNote])).toEqual([1, 2].map(k => ["practice", `تدريبات الوحدة (${k} من 2)`, PRACTICE_NOTE]));
      const blocks = last.pages.flatMap(p => p.blocks);
      for (const b of blocks) { expect(b.origin, b.id).toBe("teacher-enrichment"); expect(["code", "practice"]).toContain(b.type); }
      const qs = blocks.filter(b => b.type === "practice") as Practice[];
      expect(qs, m.id).toHaveLength(10);
      expect(new Set(qs.map(q => q.question.kind)).size, m.id).toBeGreaterThanOrEqual(4);
      // the exercises come after every book lesson of the chapter
      expect(m.lessons.slice(0, -1).every(l => l.pages.every(p => p.source?.sourceNote !== PRACTICE_NOTE))).toBe(true);
    }
  }, 30000);

  it("every exercise reveals its answer after an answer (all but the free short answer) and explains it; it counts in Strength", async () => {
    for (const { block } of await exercises()) {
      const q = block.question;
      expect(block.reveal, block.id).toBe(q.kind === "shortInput" ? undefined : true);
      expect(block.studyEligible, block.id).toBeUndefined();
      expect((q.feedback?.explanation ?? "").length, block.id).toBeGreaterThan(20);
    }
  }, 30000);

  it("every key is well formed and the presentation never gives it away", async () => {
    const at = [0, 0, 0, 0];
    for (const { block } of await exercises()) {
      const q = block.question as PracticeQuestion;
      if (q.kind === "multipleChoice") {
        expect(q.options.filter(o => o.correct), block.id).toHaveLength(1);
        expect(new Set(q.options.map(o => norm(o.text))).size, block.id).toBe(q.options.length);
        at[q.options.findIndex(o => o.correct)]++;
      } else if (q.kind === "trueFalse") expect(typeof q.answer).toBe("boolean");
      else if (q.kind === "shortInput") expect(q.answer!.trim().length).toBeGreaterThan(0);
      else if (q.kind === "matching") {
        expect(Object.keys(q.pairs!).sort()).toEqual(q.left.map(l => l.id).sort());
        expect(Object.values(q.pairs!).sort()).toEqual(q.right.map(r => r.id).sort());
        expect(q.left.map(l => q.pairs![l.id]), block.id + " right side shown in key order").not.toEqual(q.right.map(r => r.id));
      } else if (q.kind === "ordering") {
        expect([...q.order!].sort()).toEqual(q.items.map(i => i.id).sort());
        expect(q.items.map(i => i.id), block.id + " shown already in order").not.toEqual(q.order);
      } else if (q.kind === "classify") {
        expect(Object.keys(q.assign!).sort()).toEqual(q.items.map(i => i.id).sort());
        expect(new Set(Object.values(q.assign!)), block.id + " every group used").toEqual(new Set(q.groups.map(g => g.id)));
      } else if (q.kind === "wordBank") {
        const blanks = q.segments.filter(s => typeof s !== "string").map(s => (s as { blank: string }).blank);
        expect(Object.keys(q.answers!).sort()).toEqual([...blanks].sort());
        for (const w of Object.values(q.answers!)) expect(q.bank, block.id).toContain(w);
        expect(q.bank.length, block.id + " distractors").toBeGreaterThan(blanks.length);
      } else throw new Error("unexpected kind " + q.kind);
    }
    // the right options are spread over a–d (no position a learner could just guess)
    for (const n of at) expect(n).toBeGreaterThanOrEqual(12);
  }, 30000);

  it("every program exercise shows its program right above it, and its key agrees with the recorded run of exactly that program", async () => {
    let checked = 0;
    for (const { chapter, n, block, code, item } of await exercises()) {
      const key = `${chapter}/q${String(n).padStart(2, "0")}`;
      if (!item.program) { expect(code, key + " has no program").toBeUndefined(); expect(proofs[key], key).toBeUndefined(); continue; }
      expect(code, key).toBe(item.program);
      const proof = proofs[key];
      expect(proof, key + " was run").toBeDefined();
      expect(proof.sha, key + " proof belongs to this program and input").toBe(proofSha(wrapProgram(item.program), item.stdin));
      expect(proof.stdin, key).toBe(item.stdin);
      expect(proof.compileExit, key + " compiles").toBe(0);
      const q = block.question as PracticeQuestion;
      const out = printed(proof.stdout);
      if (item.prove === "runtime") {
        expect(proof.exitCode, key).not.toBe(0);
        expect(proof.exception, key).toBe(item.runtimeError);
        expect(q.kind).toBe("multipleChoice");
        if (q.kind === "multipleChoice") expect(q.options.find(o => o.correct)!.text, key).toMatch(/^خطأ تنفيذ/);
        expect(q.feedback!.explanation, key).toContain(item.runtimeError);
      } else {
        expect([proof.exitCode, proof.exception], key + " ran cleanly").toEqual([0, null]);
        if (item.prove === "claim") {
          expect(q.kind, key).toBe("trueFalse");
          if (q.kind === "trueFalse") expect(q.answer, key + ` printed «${out}», claim «${item.claimOutput}»`).toBe(norm(out) === norm(item.claimOutput!));
        } else if (q.kind === "multipleChoice") {
          expect(q.options.filter(o => norm(o.text) === norm(out)).map(o => o.correct), key + ` printed «${out}»`).toEqual([true]);
        } else if (q.kind === "shortInput") {
          expect(norm(q.answer!), key).toBe(norm(out.split(" | ").join(" ")));
        } else throw new Error(key + ": a program exercise of kind " + q.kind);
      }
      checked++;
    }
    expect(checked).toBe(77);
    expect(Object.keys(proofs).length).toBe(77);
    expect(proofsFile.worker).toBe("csharp@1");
  }, 30000);

  it("no exercise program is one of the book's own programs (parallel questions; the book's assignments keep their answers hidden)", async () => {
    const book = new Set((await modules()).flatMap(m => m.lessons.flatMap(l => l.pages.flatMap(p => p.blocks))).filter(b => b.type === "code" && b.origin === "book").map(b => norm((b as { code: string }).code)));
    for (const { block, code } of await exercises()) if (code) expect(book.has(norm(code)), block.id).toBe(false);
  }, 30000);

  it("server authority: the served bodies carry no key; the check index holds every key; the study index counts all 110", async () => {
    const ex = await exercises();
    const check = data("learning-check/" + CID + ".json").pages;
    const study = data("learning-study/" + CID + ".json").pages;
    for (const { page, block } of ex) {
      const served = data(`learning-content/${CID}/${page.split("-").slice(0, 2).join("-")}.json`) as ContentModule;
      const b = served.lessons.flatMap(l => l.pages).find(p => p.id === page)!.blocks.find(x => x.id === block.id) as Practice;
      expect(b.serverCheck, block.id).toBe(true);
      const shown = JSON.stringify(b.question);
      for (const k of ['"correct"', '"answer"', '"pairs"', '"order"', '"assign"', '"answers"', '"feedback"']) expect(shown, block.id + " " + k).not.toContain(k);
      expect(check[page].activities[block.id], block.id).toMatchObject({ study: true, key: { kind: block.question.kind } });
      expect(study[page].activities[block.id], block.id).toBeDefined();
    }
    const counted = Object.values(study as Record<string, { activities: object }>).reduce((n, p) => n + Object.keys(p.activities).length, 0);
    expect(counted).toBe(110);
    expect(ex).toHaveLength(110);
  }, 30000);
});
