import { describe, it, expect } from "vitest";
import { evaluateStudyResponse, structuredKeyMap } from "../src/lib/learning-study.js";
import { checkResponse, revealOf } from "../src/lib/learning-check.js";

// 791381s Phase 3 — the server's judgement of the STRUCTURED kinds (wordBank / matching / ordering / classify): right only when
// EVERY part is right; malformed or other-kind responses are simply wrong; the per-part verdict (`parts`) says right / wrong for
// the answered parts and never the key; a REVEAL block returns the key only for a response of the same kind that answers EVERY
// part (an empty or partial answer cannot fish for it).

const WB = { kind: "wordBank", answers: { b1: "الحجم", b2: "المسافة" } };
const MT = { kind: "matching", pairs: { pan: "r2", lan: "r3", wan: "r1" } };
const OR = { kind: "ordering", order: ["pan", "lan", "wan"] };
const CL = { kind: "classify", assign: { i1: "use", i2: "admin" } };

describe("evaluateStudyResponse — structured kinds", () => {
  it("right only when every part is right", () => {
    expect(evaluateStudyResponse(WB, { kind: "wordBank", choices: { b1: "الحجم", b2: "المسافة" } })).toBe(true);
    expect(evaluateStudyResponse(WB, { kind: "wordBank", choices: { b1: "الحجم", b2: "السرعة" } })).toBe(false);
    expect(evaluateStudyResponse(WB, { kind: "wordBank", choices: { b1: "الحجم" } })).toBe(false);                      // a part missing
    expect(evaluateStudyResponse(MT, { kind: "matching", choices: { pan: "r2", lan: "r3", wan: "r1" } })).toBe(true);
    expect(evaluateStudyResponse(MT, { kind: "matching", choices: { pan: "r3", lan: "r2", wan: "r1" } })).toBe(false);
    expect(evaluateStudyResponse(CL, { kind: "classify", choices: { i1: "use", i2: "admin" } })).toBe(true);
    expect(evaluateStudyResponse(CL, { kind: "classify", choices: { i1: "admin", i2: "admin" } })).toBe(false);
    expect(evaluateStudyResponse(OR, { kind: "ordering", order: ["pan", "lan", "wan"] })).toBe(true);
    expect(evaluateStudyResponse(OR, { kind: "ordering", order: ["lan", "pan", "wan"] })).toBe(false);
    expect(evaluateStudyResponse(OR, { kind: "ordering", order: ["pan", "lan"] })).toBe(false);
  });

  it("malformed or other-kind responses are wrong (never a crash)", () => {
    for (const bad of [null, {}, "x", { kind: "wordBank" }, { kind: "wordBank", choices: [] }, { kind: "matching", choices: { b1: "الحجم", b2: "المسافة" } }, { kind: "ordering", order: "pan,lan,wan" }]) {
      expect(evaluateStudyResponse(WB, bad), JSON.stringify(bad)).toBe(false);
      expect(evaluateStudyResponse(OR, bad), JSON.stringify(bad)).toBe(false);
    }
    expect(evaluateStudyResponse({ kind: "wordBank", answers: {} }, { kind: "wordBank", choices: {} })).toBe(false);   // an empty key is never "all right"
    expect(structuredKeyMap({ kind: "ordering", order: [] })).toBeNull();
  });
});

describe("checkResponse — parts and reveal", () => {
  const act = (key, reveal = false) => ({ key, feedback: { explanation: "شرح", hints: ["تلميح"] }, reveal });

  it("parts: right / wrong per answered part, never the expected value", () => {
    const r = checkResponse(act(MT), { kind: "matching", choices: { pan: "r2", lan: "r1" } });
    expect(r.correct).toBe(false);
    expect(r.parts).toEqual({ pan: true, lan: false });
    expect(JSON.stringify(r)).not.toContain("r3");
    expect(checkResponse(act(OR), { kind: "ordering", order: ["lan", "pan", "wan"] }).parts).toEqual({ lan: false, pan: false, wan: true });
    expect(checkResponse(act(WB), { kind: "matching", choices: { b1: "x" } }).parts).toBeUndefined();               // other kind
  });

  it("reveal: the full key for a complete answer of the same kind — right or wrong — with the explanation and no hints", () => {
    const w = checkResponse(act(WB, true), { kind: "wordBank", choices: { b1: "المسافة", b2: "الحجم" } });
    expect(w.correct).toBe(false);
    expect(w.reveal).toEqual({ kind: "wordBank", answers: WB.answers });
    expect(w.feedback).toEqual({ explanation: "شرح" });
    expect(checkResponse(act(MT, true), { kind: "matching", choices: MT.pairs }).reveal).toEqual({ kind: "matching", pairs: MT.pairs });
    expect(checkResponse(act(CL, true), { kind: "classify", choices: { i1: "admin", i2: "use" } }).reveal).toEqual({ kind: "classify", assign: CL.assign });
    expect(checkResponse(act(OR, true), { kind: "ordering", order: ["wan", "lan", "pan"] }).reveal).toEqual({ kind: "ordering", order: OR.order });
  });

  it("no key for an empty, partial or other-kind answer (cannot fish for it)", () => {
    expect(revealOf(WB, { kind: "wordBank", choices: {} })).toBeNull();
    expect(revealOf(WB, { kind: "wordBank", choices: { b1: "الحجم" } })).toBeNull();
    expect(revealOf(MT, { kind: "matching", choices: { pan: "r2", lan: "r3", wan: "" } })).toBeNull();
    expect(revealOf(OR, { kind: "ordering", order: [] })).toBeNull();
    expect(revealOf(OR, { kind: "ordering", order: ["pan", "pan", "wan"] })).toBeNull();
    expect(revealOf(CL, { kind: "wordBank", choices: { i1: "use", i2: "admin" } })).toBeNull();
    const partial = checkResponse(act(WB, true), { kind: "wordBank", choices: { b1: "الحجم" } });
    expect(partial.reveal).toBeUndefined();
    expect(partial.feedback.explanation).toBeUndefined();
  });
});
