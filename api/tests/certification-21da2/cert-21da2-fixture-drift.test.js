import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPhysicsLabAcceptanceExam, PHYSICS_LAB_ACCEPTANCE_PATH, serializeExam } from "./physicsLabExam.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// Regenerate with WRITE_21DA2_FIXTURES=1 (then review the diff).
describe("21D-A.2 generated fixture drift", () => {
  it("the committed JSON is byte-for-byte generated from the source", () => {
    const file = path.join(root, PHYSICS_LAB_ACCEPTANCE_PATH), text = serializeExam(buildPhysicsLabAcceptanceExam());
    if (process.env.WRITE_21DA2_FIXTURES) fs.writeFileSync(file, text);
    expect(fs.readFileSync(file, "utf8")).toBe(text);
  });
});
