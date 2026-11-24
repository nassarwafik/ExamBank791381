// AUTO-A4 — «مختبر الآلات»: one small starting machine per kind, written for the tool (not taken from the book: the book's content
// reaches the browser through the API only). Each is checked by the A4 suite: it builds, and it accepts exactly the language its title
// names (every word up to length 6).
import { BOTTOM, BLANK, initialDraft, type AutomatonKind, type LabDraft } from "./automataLab";

export type LabExample = { title: string; draft: LabDraft };

export const LAB_EXAMPLES: Record<AutomatonKind, LabExample> = {
  DFA: {
    title: "عدد a زوجي (أوتومات كامل)",
    draft: { ...initialDraft("DFA"), states: ["q0", "q1"], accept: ["q0"], cells: { "q0|a": ["q1"], "q0|b": ["q0"], "q1|a": ["q0"], "q1|b": ["q1"] } },
  },
  NFA: {
    title: "تنتهي بـ ab",
    draft: { ...initialDraft("NFA"), states: ["q0", "q1", "q2"], accept: ["q2"], cells: { "q0|a": ["q0", "q1"], "q0|b": ["q0"], "q1|b": ["q2"] } },
  },
  PDA: {
    title: "aⁿbⁿ (n ≥ 1)",
    // the course's way: the first a pushes S (the bottom of the a's), the others push A; each b pops one; the b that pops S accepts
    draft: {
      ...initialDraft("PDA"), states: ["q0", "q1", "q2"], accept: ["q2"],
      pda: [
        { from: "q0", read: "a", top: BOTTOM, op: "push", write: "S", to: "q0" },
        { from: "q0", read: "a", top: "S", op: "push", write: "A", to: "q0" },
        { from: "q0", read: "a", top: "A", op: "push", write: "A", to: "q0" },
        { from: "q0", read: "b", top: "A", op: "pop", write: "A", to: "q1" },
        { from: "q0", read: "b", top: "S", op: "pop", write: "S", to: "q2" },
        { from: "q1", read: "b", top: "A", op: "pop", write: "A", to: "q1" },
        { from: "q1", read: "b", top: "S", op: "pop", write: "S", to: "q2" },
      ],
    },
  },
  TM: {
    title: "كلمات من a طولها زوجي",
    draft: {
      ...initialDraft("TM"), alphabet: ["a"], states: ["q0", "q1", "q2"], accept: ["q2"], leftEnd: true,
      tm: [
        { from: "q0", read: "a", write: "a", move: "R", to: "q1" },
        { from: "q1", read: "a", write: "a", move: "R", to: "q0" },
        { from: "q0", read: BLANK, write: BLANK, move: "S", to: "q2" },
      ],
    },
  },
};
