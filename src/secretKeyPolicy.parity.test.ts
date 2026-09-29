import { describe, it, expect } from "vitest";
import { isSecretConfigKey, normalizeConfigKey, SECRET_KEY_FAMILIES } from "./secretKeyPolicy";
// @ts-expect-error — CommonJS server module without type declarations (the sanitizer's policy).
import * as server from "../api/src/lib/secret-key-policy.js";

// Phase 13C-A — Independent Review Fix 1 / R3: the frontend descriptor validator and the server student sanitizer must
// apply the SAME canonical secret-key policy. The two runtimes cannot share a module (ESM/TS app vs CJS Azure Functions
// deployment), so this test pins them to each other: same normalization, same families, same verdict on every probe.
const secret = ["answer", "answers", "answerKey", "answer_key", "ANSWER-KEY", "expectedAnswer", "Expected Answer", "correct", "isCorrect", "Is_Correct", "correctOptionIndex", "correct-option-value", "CorrectAnswer", "correct_answer", "teacherAnswer", "teacher_note", "teacherSolution", "solution", "Solutions", "solution steps", "hint", "hints", "hint_text", "scoringKey", "scoring_key", "gradingKey", "grading rubric", "secret", "secretSeed", "rationale", "explanation", "aiInstruction", "ai_instruction", "modelAnswer", "expected", "Expected", "apiKey", "api_key", "token", "accessToken", "password", "credential", "history", "redoStack", "markScheme", "rubric", "key", "KEY"];
const safe = ["start", "labels", "speed", "angle", "initialState", "steps", "mode", "seed", "range", "min", "max", "unit", "color", "width", "items", "nodes", "showGrid", "keyframes", "keyboard", "hotkeys", "title", "description", "id", "label", "options", "layout", "theme", "duration", "loop", "autoplay", "monkey"];

describe("R3 — frontend / server secret-key policy parity", () => {
  it("normalization is identical (case-insensitive, separators removed)", () => {
    for (const k of [...secret, ...safe, "  Correct  Answer ", "a.b-c_d e"]) expect(normalizeConfigKey(k), k).toBe(server.normalizeConfigKey(k));
    expect(normalizeConfigKey("Correct_Answer-Key")).toBe("correctanswerkey");
  });
  it("the family lists are identical and every probe gets the same verdict on both sides", () => {
    expect(SECRET_KEY_FAMILIES).toEqual(server.SECRET_KEY_FAMILIES);
    for (const k of secret) { expect(isSecretConfigKey(k), "frontend " + k).toBe(true); expect(server.isSecretConfigKey(k), "server " + k).toBe(true); }
    for (const k of safe) { expect(isSecretConfigKey(k), "frontend " + k).toBe(false); expect(server.isSecretConfigKey(k), "server " + k).toBe(false); }
  });
  it("non-string / empty keys are never secrets (no throw)", () => {
    for (const k of ["", "   ", 5, null, undefined]) { expect(isSecretConfigKey(k as never)).toBe(false); expect(server.isSecretConfigKey(k)).toBe(false); }
  });
});
