import { describe, expect, it } from "vitest";
import { COMPOSER_DRAFT_TYPES, COMPOSER_ITEM_KINDS, buildComposerCatalog, catalogForPrompt } from "./composerCatalog";
import { buildItemSchema, normalizeComposerItem } from "./composerDraft";
import { buildRichBlockSchema } from "./composerRich";

// Phase 21D-B.3 — the AI Exam Composer has NO path to a realistic 3D model: meshPartSelection@1 is not a composer kind, no schema names a
// mesh model, a GLB asset or a hash, and an item that claims the kind is refused as malformed (fail closed). Models are chosen by the teacher
// from the reviewed library or a server-validated upload only.
describe("21D-B.3 AI composer — mesh models are not AI-authorable (fail closed)", () => {
  it("neither the draft types, the item kinds, the item / rich schemas nor the prompt catalog mention mesh models or assets", () => {
    expect(COMPOSER_DRAFT_TYPES as readonly string[]).not.toContain("meshPartSelection");
    expect(COMPOSER_ITEM_KINDS as readonly string[]).not.toContain("meshPartSelection");
    for (const text of [JSON.stringify(buildItemSchema()), JSON.stringify(buildRichBlockSchema()), catalogForPrompt(buildComposerCatalog())]) {
      expect(text).not.toMatch(/meshPartSelection|meshModel|mesh-assets|\.glb|gltf|sha256|bodyparts/i);
    }
  });
  it("an AI item claiming the meshPartSelection kind (with a model and a key) is refused before any mapping", () => {
    const item = {
      kind: "meshPartSelection", topic: "القلب", difficulty: "medium", rationale: "اختيار حجرة", stem: [], assetRequest: null,
      question: { meshPartSelection: { v: 1, model: { asset: { source: "upload", sha256: "a".repeat(64), byteLength: 100 } }, mode: "single", maxSelections: 1 }, answer: { scoring: "allOrNothing", correct: ["leftVentricle"] } },
      smartSim: null, compositeText: null, compositeContext: null, compositeGroups: null, compositeParts: null
    };
    const r = normalizeComposerItem(item, { marks: 2, qid: "q1", request: "اكتب سؤالًا عن القلب", path: "items[0]" });
    expect(r).toMatchObject({ ok: false, issues: [{ code: "AI_ITEM_MALFORMED" }] });
  });
});
