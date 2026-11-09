// 899371 decisions (docs/enterprise-899371-learning-plan.md §18) — the teacher clarifications next to the book's incomplete questions:
//   • exactly F9 × 5 (the inputs of the chapter-6 traces) and F15 × 3 (the points table, the choices of 5.2 and 5.3), each a
//     clarification callout «توضيح المعلم» (teacher-enrichment) RIGHT AFTER the book line it completes, in the same page;
//   • the book's own blocks are untouched (bookLock.test.ts, fidelity.p2.test.ts) and no clarification shows an answer (Q3);
//   • every F9 input set is proven on the BOOK's own program (clarifications.proofs.json): it ends normally with these inputs and not
//     without the last one, so every input is read; the F15 choices are proven by the probe f15-igloo-choices (run-csharp-probes).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import manifest from "./manifest";
import proofsFile from "./clarifications.proofs.json";
import { loadBundledModuleContent } from "../bundledModules";
import type { ContentBlock, ContentModule } from "../types";
// @ts-expect-error — plain ESM tools shared with the converter and the prover; untyped on purpose.
import { readClarifications, CLARIFICATION_TITLE } from "../../../../scripts/convert-899371.mjs";
// @ts-expect-error — plain ESM tools shared with the converter and the prover; untyped on purpose.
import { wrapProgram, proofSha, clarificationStdins } from "../../../../scripts/prove-899371-practice.mjs";

const CID = "899371";
type Clarification = { finding: string; after: string; program?: string; inputs?: string; text?: string; choices?: string[] };
type Proof = { sha: string; inputs: string; compileExit: number; exitCode: number; stdout: string; exception: string | null; withoutLastExitCode: number };
const clarifications = readClarifications() as Clarification[];
const proofs = proofsFile.proofs as Record<string, Proof>;
const text = (b: ContentBlock) => JSON.stringify(b);

async function pages() {
  const out: ContentModule[] = [];
  for (const m of manifest.modules) out.push(await loadBundledModuleContent(CID, m.id));
  return out.flatMap(m => m.lessons.flatMap(l => l.pages));
}

describe("899371 §18 — teacher clarifications of F9 and F15", () => {
  it("exactly F9 × 5 and F15 × 3, nothing else", () => {
    expect(clarifications.map(c => c.finding)).toEqual(["F9", "F9", "F9", "F9", "F9", "F15", "F15", "F15"]);
    expect(new Set(clarifications.map(c => c.after)).size).toBe(8);
  });

  it("each sits right after the book line it completes, as «توضيح المعلم» (with its lettered choices when choices are missing)", async () => {
    const all = await pages();
    for (const c of clarifications) {
      const page = all.find(p => p.blocks.some(b => b.id === c.after))!;
      expect(page, c.after).toBeDefined();
      const at = page.blocks.findIndex(b => b.id === c.after);
      expect(page.blocks[at].origin, c.after).toBe("book");
      const note = page.blocks[at + 1] as Extract<ContentBlock, { type: "callout" }>;
      expect([note.type, note.kind, note.origin, note.title, note.id]).toEqual(["callout", "clarification", "teacher-enrichment", CLARIFICATION_TITLE, c.after + "-clarify"]);
      const said = note.spans.map(s => s.text).join("");
      expect(said, c.after).toMatch(/لم تُطبع في الكتاب|لم يُطبع في الكتاب/);
      if (c.inputs !== undefined) expect(note.spans.find(s => s.style === "code")?.text, c.after).toBe(c.inputs);
      if (c.choices) {
        const list = page.blocks[at + 2] as Extract<ContentBlock, { type: "list" }>;
        expect([list.type, list.origin, list.id]).toEqual(["list", "teacher-enrichment", c.after + "-choices"]);
        expect(list.items.map(i => i.term)).toEqual(["أ", "ب", "ج", "د"]);
        expect(list.items.map(i => i.text.map(s => s.text).join(""))).toEqual(c.choices);
      }
    }
  }, 30000);

  it("no clarification shows an answer (Q3): no recorded output, no marked choice", async () => {
    const added = (await pages()).flatMap(p => p.blocks).filter(b => /-(clarify|choices)$/.test(b.id));
    expect(added).toHaveLength(10);
    for (const b of added) {
      expect(text(b)).not.toMatch(/"correct"|✓|✅|الإجابة الصحيحة/);
      for (const p of Object.values(proofs)) for (const line of p.stdout.split("\n").filter(l => /\d/.test(l))) expect(text(b), b.id).not.toContain(line.trim());
    }
  }, 30000);

  it("every F9 input set is proven on the book's own program: a normal end with these inputs, no normal end without the last", async () => {
    const all = (await pages()).flatMap(p => p.blocks);
    const withInputs = clarifications.filter(c => c.inputs !== undefined);
    expect(withInputs).toHaveLength(5);
    for (const c of withInputs) {
      const program = all.find(b => b.id === c.program) as Extract<ContentBlock, { type: "code" }>;
      expect([program?.type, program?.origin], c.program).toEqual(["code", "book"]);
      const p = proofs[c.after];
      expect(p, c.after).toBeDefined();
      expect(p.sha, c.after + " proof belongs to the book program and these inputs").toBe(proofSha(wrapProgram(program.code), clarificationStdins(c.inputs!)[0]));
      expect([p.compileExit, p.exitCode, p.exception], c.after).toEqual([0, 0, null]);
      expect(p.stdout.trim().length, c.after).toBeGreaterThan(0);
      expect(p.withoutLastExitCode, c.after + " every input is read").not.toBe(0);
    }
    expect(Object.keys(proofs).sort()).toEqual(withInputs.map(c => c.after).sort());
  }, 30000);

  it("the F15 choices are proven by the probe f15-igloo-choices (exactly one intended choice holds in every case)", () => {
    const probe = JSON.parse(readFileSync(new URL("../../../../docs/enterprise-899371-learning/probes/f15-igloo-choices/probe.json", import.meta.url), "utf8"));
    expect(probe.finding).toBe("F15");
    expect(probe.runs[0].expect.stdout).toBe("5.2 OK\n5.3 OK");
    const program = readFileSync(new URL("../../../../docs/enterprise-899371-learning/probes/f15-igloo-choices/Program.cs", import.meta.url), "utf8");
    // the probe checks the very choices the course shows, in the same order
    const shown = clarifications.filter(c => c.choices).map(c => c.choices!);
    expect(shown).toHaveLength(2);
    expect(program).toContain("أ present and the largest · ب present in the last cell · ج absent and larger than all · د smaller than all");
    expect(shown[0]).toEqual(["num موجود في المصفوفة، وهو أكبر عناصرها.", "num موجود في آخر خانة من المصفوفة.", "num غير موجود في المصفوفة، وهو أكبر من جميع عناصرها.", "num أصغر من جميع عناصر المصفوفة."]);
    expect(program).toContain("أ only when num is the first element · ب no smaller value before it, or absent and smaller than all · ج only absent and smaller than all · د only an empty array");
    expect(shown[1][1]).toBe("عندما لا يسبق num في المصفوفة أي عدد أصغر منه، أو عندما يكون غير موجود فيها وأصغر من جميع عناصرها.");
  });
});
