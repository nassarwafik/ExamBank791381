import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAutomatonDesignAcceptanceExam, AUTOMATON_DESIGN_ACCEPTANCE_PATH, serializeExam } from "../../../scripts/automaton-design-a8-exam.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// AUTO-A8 — the committed acceptance exam is exactly what its generator produces.
describe("A8 generated fixture drift", () => {
  it("the committed JSON is byte-for-byte generated from the source", () => {
    expect(fs.readFileSync(path.join(root, AUTOMATON_DESIGN_ACCEPTANCE_PATH), "utf8")).toBe(serializeExam(buildAutomatonDesignAcceptanceExam()));
  });
});
