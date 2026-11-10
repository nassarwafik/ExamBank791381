// 899371 enrichment P14 (docs/enterprise-899371-enrichment-plan.md §3.3, §11) — «حلّ وافحص»: the authored questions of the book's
// "write a program / method / class" questions, resolved to one full spec each. Shared by the converter (the starter block on the page),
// the Docker prover (scripts/prove-899371-solve.mjs) and the server index builder (scripts/build-learning-solve-index.mjs).
//
// Source: scripts/learning-solve-899371/mNN.json (authored; never served). A question either REUSES a P7 coding-lab question
// ({ book, reuse: "CL899371-NN-QKK", explanation, hidden }: version, template / reference, wrong and public example come from
// scripts/coding-lab-899371/mNN.json, already proven on the real Runner in P7; the hidden inputs are its OWN, never the lab's — P16)
// or is a full spec in the same format, plus:
//   • check: false — the question cannot be checked automatically (random, ambiguous wording until the owner corrects it): «تشغيل»
//     and the solution card only, no hidden inputs, no known-wrong solution;
//   • explanation — the idea of the solution in 1–3 Arabic sentences (the solution card).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readLab, questionId, programOf } from "../build-899371-coding-lab.mjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { reconstructTemplateSource } = require("../../api/src/lib/shared-finalization/codingTemplate.js");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SOLVE_DIR = join(ROOT, "scripts", "learning-solve-899371");
/** The editor's starting program of a whole-program question (the same shell as the P7 lab). */
export const STARTER = "using System;\n\npublic class Program\n{\n    public static void Main()\n    {\n        \n    }\n}\n";

/** Every authored question, resolved: [{ book, module, version, check, title?, text?, template?, reference?, referenceGaps?, wrong?,
 *  wrongGaps?, public, hidden, explanation, reuse? }] in file order. Throws on a missing reuse or an incomplete spec. */
export function readSolve(dir = SOLVE_DIR, lab = readLab()) {
  const p7 = {};
  for (const [mid, qs] of Object.entries(lab)) qs.forEach((q, i) => { p7[questionId(mid, i)] = q; });
  const out = [];
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter(f => /^m\d\d\.json$/.test(f)).sort()) {
    const file = JSON.parse(readFileSync(join(dir, f), "utf8"));
    if (file.module !== f.slice(0, 3)) throw new Error(f + ": module " + file.module);
    for (const raw of file.questions) {
      if (typeof raw.explanation !== "string" || !raw.explanation.trim()) throw new Error(raw.book + ": no explanation");
      let q;
      if (raw.reuse) {
        const base = p7[raw.reuse];
        if (!base || base.book !== raw.book) throw new Error(raw.book + ": reuse " + raw.reuse + " is not that question's P7 version");
        // enrichment P16 (owner decision, 2026-11-10): «حلّ وافحص» has its OWN hidden inputs, never the coding lab's (CL899371-*),
        // so practising here never rehearses an official test; the P7 program, template, wrong solution and public example are kept
        if (!Array.isArray(raw.hidden)) throw new Error(raw.book + ": a reused question needs its own hidden inputs (not the coding lab's)");
        const lab = new Set(base.hidden || []);
        if (raw.hidden.some(h => lab.has(h))) throw new Error(raw.book + ": a hidden input is also a coding-lab hidden input");
        q = { ...base, reuse: raw.reuse, check: true, explanation: raw.explanation, hidden: raw.hidden };
      } else q = { ...raw, check: raw.check !== false };
      if (q.version !== 2 && q.version !== 3) throw new Error(q.book + ": version " + q.version);
      if (!Array.isArray(q.public) || q.public.length < 1) throw new Error(q.book + ": no public example");
      // ≥ 3 hidden inputs for every checked question (a reused P7 question brings its own, P16)
      if (q.check && (!Array.isArray(q.hidden) || q.hidden.length < 3)) throw new Error(q.book + ": a checked question needs ≥ 3 hidden inputs");
      if (!q.check && (q.hidden || q.wrong || q.wrongGaps)) throw new Error(q.book + ": a run-only question has no hidden inputs and no wrong solution");
      out.push({ ...q, module: file.module, hidden: q.check ? q.hidden : [] });
    }
  }
  return out;
}

/** The program the student starts from (shown on the page and in the editor): the shell, or the template with its starters. */
export function starterProgram(q) {
  if (q.version !== 3) return STARTER;
  const starters = Object.fromEntries(q.template.filter(s => s.kind === "editable").map(s => [s.id, s.starter ?? ""]));
  return reconstructTemplateSource({ language: "csharp", segments: q.template }, starters);
}
/** The reference program (the solution card). */
export const referenceProgram = q => programOf(q, "reference");
