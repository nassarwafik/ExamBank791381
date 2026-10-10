import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMeshModelsAcceptanceExam, MESH_MODELS_ACCEPTANCE_PATH, serializeExam } from "../../../scripts/mesh-models-21db3-exam.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// Phase 21D-B.3 — the committed acceptance exam is exactly what its generator produces, and its persisted models carry no renderer,
// executable or external-reference key (models are referenced by reviewed library id + version + SHA-256 only).
describe("21DB3 generated fixture drift", () => {
  it("the committed JSON is byte-for-byte generated from the source", () => {
    const committed = fs.readFileSync(path.join(root, MESH_MODELS_ACCEPTANCE_PATH), "utf8");
    expect(committed).toBe(serializeExam(buildMeshModelsAcceptanceExam()));
  });
  it("persisted models contain no renderer / executable keys, URLs or embedded bytes", () => {
    const forbidden = new Set(["renderer", "three", "webgl", "html", "script", "callback", "url", "uri", "src", "buffer", "bytes", "data"]);
    const walk = value => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        expect(forbidden.has(key), "forbidden persisted key: " + key).toBe(false);
        if (typeof child === "string") expect(child).not.toMatch(/^(https?:|data:|blob:|file:)/i);
        walk(child);
      }
    };
    walk(buildMeshModelsAcceptanceExam().sections);
  });
});
