import { describe, it, expect } from "vitest";
import {
  GENERAL_INSTRUCTION_TEMPLATES, SECTION_INSTRUCTION_TEMPLATES,
  findGeneralInstructionTemplate, findSectionInstructionTemplate
} from "./instructionTemplates";

// Roadmap #17 — instruction templates are plain-text starting points for existing instruction fields.
describe("R17 instruction templates (pure)", () => {
  it("U: general and section templates provide non-empty plain text, looked up by id", () => {
    expect(GENERAL_INSTRUCTION_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    expect(SECTION_INSTRUCTION_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    expect(findGeneralInstructionTemplate("computerized")?.text).toMatch(/حفظ إجاباتك/);
    expect(findSectionInstructionTemplate("answer-all")?.text).toMatch(/جميع الأسئلة/);
    expect(findGeneralInstructionTemplate("nope")).toBeUndefined();
  });

  it("Y: no template text contains HTML markup (plain text only)", () => {
    for (const t of [...GENERAL_INSTRUCTION_TEMPLATES, ...SECTION_INSTRUCTION_TEMPLATES]) {
      expect(t.text).not.toMatch(/[<>]/);
      expect(t.label).not.toMatch(/[<>]/);
    }
  });
});
