import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildChemistryAcceptanceExam, CHEMISTRY_ACCEPTANCE_PATH, serializeExam } from "./chemistryExam.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// Regenerate with WRITE_21DD1_FIXTURES=1 (then review the diff).
describe("21D-D.1 generated fixture drift", () => {
  it("the committed JSON is byte-for-byte generated from the source", () => {
    const file = path.join(root, CHEMISTRY_ACCEPTANCE_PATH), text = serializeExam(buildChemistryAcceptanceExam());
    if (process.env.WRITE_21DD1_FIXTURES) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }
    expect(fs.readFileSync(file, "utf8")).toBe(text);
  });
});
