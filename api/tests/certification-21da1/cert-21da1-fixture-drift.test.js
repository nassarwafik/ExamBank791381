import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPhysicsMotionAcceptanceExam, PHYSICS_MOTION_ACCEPTANCE_PATH, serializeExam } from "./physicsMotionExam.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// Regenerate with WRITE_21DA1_FIXTURES=1 (then review the diff).
describe("21D-A.1 generated fixture drift", () => {
  it("the committed JSON is byte-for-byte generated from the source", () => {
    const file = path.join(root, PHYSICS_MOTION_ACCEPTANCE_PATH), text = serializeExam(buildPhysicsMotionAcceptanceExam());
    if (process.env.WRITE_21DA1_FIXTURES) fs.writeFileSync(file, text);
    expect(fs.readFileSync(file, "utf8")).toBe(text);
  });
});
