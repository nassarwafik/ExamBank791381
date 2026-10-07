// @vitest-environment happy-dom
// Phase 20G.2 (O1) — RENDERER PARITY. The server now refuses (ingest) and fails closed (grading) any legacy answer whose kind the question
// authority does not admit (legacyAnswerKindAllowed, the ONE shared rule). That is only safe if the official client can never produce
// such an answer: here every legacy renderer (StudentQuestionCard, CompoundPartControl) is rendered for every legacy type spelling (canonical,
// alias, odd case, flat `type`, typeless, unknown) × every content shape, EVERY control is operated, and every kind it emits must be admitted.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import StudentQuestionCard, { type Question, type QuestionPart, type Answer } from "./StudentQuestionCard";
import CompoundPartControl from "./CompoundPartControl";
import { legacyAnswerKindAllowed, LEGACY_TYPE_ALIASES } from "./questionTypeAliases";
import { LEGACY_QUESTION_TYPE_KEYS } from "./questionTypeCatalog";

afterEach(() => cleanup());

const SPELLINGS = [...new Set([...LEGACY_QUESTION_TYPE_KEYS.filter(k => k !== "compound"), ...Object.keys(LEGACY_TYPE_ALIASES).filter(k => k !== "compound"), "MCQ", "TrueFalse", "FILL", "Ordering", "", "sequence", "weirdLegacy"])];
const TABLE_TEXT = "املأ\n| المصطلح | الإجابة |\n|---|---|\n| DNS | |\n| DHCP | |";
const CONTENT: Record<string, Record<string, unknown>> = {
  bare: { text: "سؤال" },
  options: { text: "سؤال", options: [{ text: "أ" }, { text: "ب" }, { text: "ج" }] },
  fields: { text: "سؤال", fields: [{ id: "f1", label: "الأول", options: ["x", "y"], statement: "s1" }, { id: "f2", label: "الثاني", statement: "s2" }] },
  wordBank: { text: "سؤال", wordBank: ["x", "y"], fields: [{ id: "f1", label: "الأول" }, { id: "f2", label: "الثاني" }] },
  tableText: { text: TABLE_TEXT },
  tableGrid: { text: "سؤال", tableHeaders: ["المصطلح", "الإجابة"], tableRows: [["DNS", ""], ["DHCP", ""]] }
};

// operate every control the renderer drew: radios / checkboxes clicked, selects set to their last option, text inputs / textareas typed
function operateAll(container: HTMLElement) {
  container.querySelectorAll<HTMLInputElement>("input[type=radio], input[type=checkbox]").forEach(el => fireEvent.click(el));
  container.querySelectorAll<HTMLSelectElement>("select").forEach(el => { const opts = [...el.options].filter(o => o.value !== ""); if (opts.length) fireEvent.change(el, { target: { value: opts[opts.length - 1].value } }); });
  container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("textarea, input:not([type]), input[type=text]").forEach(el => fireEvent.change(el, { target: { value: "إجابة" } }));
}

function cardKinds(q: Question): Set<string> {
  const kinds = new Set<string>();
  const { container } = render(<StudentQuestionCard q={q} index={0} id="q1" answer={undefined}
    onChoice={() => kinds.add("choice")} onSeq={() => kinds.add("sequence")} onTable={() => kinds.add("table")} onText={() => kinds.add("text")}
    onField={() => kinds.add("fields")} onAnswer={(a: Answer) => kinds.add("registered:" + a.kind)} />);
  operateAll(container);
  cleanup();
  return kinds;
}
function partKinds(p: QuestionPart): Set<string> {
  const kinds = new Set<string>();
  const { container } = render(<CompoundPartControl p={p} idBase="q1-p1" answer={undefined} onAnswer={(a: Answer) => kinds.add(a.kind)} name="البند 1" />);
  operateAll(container);
  cleanup();
  return kinds;
}

describe("20G.2 O1 — renderer parity: every kind a legacy renderer emits is admitted by the shared question authority", () => {
  it("StudentQuestionCard (presentationType and flat `type` placement) never emits a kind the binding refuses", () => {
    const seen = new Set<string>();
    for (const spelling of SPELLINGS) for (const [name, content] of Object.entries(CONTENT)) for (const placement of ["presentationType", "type"] as const) {
      const q = { examQuestionId: "q1", marks: 2, ...content, ...(spelling ? { [placement]: spelling } : {}) } as unknown as Question;
      for (const kind of cardKinds(q)) {
        seen.add(kind);
        expect(kind.startsWith("registered:"), spelling + "/" + name + " rendered through the registry").toBe(false);
        expect(legacyAnswerKindAllowed(q, kind), `${placement}=${JSON.stringify(spelling)} ${name} → ${kind}`).toBe(true);
      }
    }
    // the sweep is not vacuous: every legacy answer kind was actually produced somewhere
    expect([...seen].sort()).toEqual(["choice", "fields", "sequence", "table", "text"]);
  });

  it("CompoundPartControl (compound@1 parts and composite@1 legacy children) never emits a kind the binding refuses on the part node the server builds", () => {
    const seen = new Set<string>();
    for (const spelling of SPELLINGS) for (const [name, content] of Object.entries(CONTENT)) {
      const p = { id: "p1", marks: 1, ...content, ...(spelling ? { type: spelling } : {}) } as unknown as QuestionPart;
      const raw = p as unknown as Record<string, unknown>;
      // the exact nodes the server grades / binds: gradeCompound's { ...p, presentationType: p.type || p.presentationType } and composite's
      // compositeChildNode(raw) = { ...raw, presentationType: raw.type }
      const compoundNode = { ...raw, presentationType: raw.type || raw.presentationType }, compositeNode = { ...raw, presentationType: raw.type };
      for (const kind of partKinds(p)) {
        seen.add(kind);
        expect(legacyAnswerKindAllowed(compoundNode, kind), `part ${JSON.stringify(spelling)} ${name} → ${kind}`).toBe(true);
        expect(legacyAnswerKindAllowed(compositeNode, kind), `child ${JSON.stringify(spelling)} ${name} → ${kind}`).toBe(true);
      }
    }
    expect([...seen].sort()).toEqual(["choice", "fields", "text"]);
  });

  it("the choice kind is emitted ONLY by the literal choice renderers — exactly the questions the binding admits a choice on", () => {
    for (const spelling of SPELLINGS) for (const [name, content] of Object.entries(CONTENT)) {
      const q = { examQuestionId: "q1", marks: 2, ...content, ...(spelling ? { presentationType: spelling } : {}) } as unknown as Question;
      const emitsChoice = cardKinds(q).has("choice");
      if (emitsChoice) expect(["multiplechoice", "truefalse"], spelling + "/" + name).toContain(spelling.toLowerCase());
    }
  });
});
