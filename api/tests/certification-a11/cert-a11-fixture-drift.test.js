import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMachineDesignAcceptanceExam, MACHINE_DESIGN_ACCEPTANCE_PATH, serializeExam } from "../../../scripts/machine-design-a11-exam.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// AUTO-A11a — the committed acceptance exam is exactly what its generator produces.
describe("A11 generated fixture drift", () => {
  it("the committed JSON is byte-for-byte generated from the source", () => {
    expect(fs.readFileSync(path.join(root, MACHINE_DESIGN_ACCEPTANCE_PATH), "utf8")).toBe(serializeExam(buildMachineDesignAcceptanceExam()));
  });
});
