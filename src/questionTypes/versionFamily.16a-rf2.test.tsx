// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { registerQuestionTypePlugin, type QuestionTypePlugin, type QuestionTypeVersionImplementation } from "./registerQuestionTypePlugin";
import { resolveAuthoringEditor, registerAuthoringEditor } from "./authoringRegistry";
import { resolveStudentRenderer, registerStudentRenderer } from "./studentRegistry";
import { validateQuestionTypeNode } from "../questionTypeValidation";
import { hasRegisteredTypeDefaults } from "../questionTypeDefaults";
import { newQuestion } from "../examBuilderState";
import { effectiveQuestionTypeVersion, isKnownQuestionType, listQuestionTypes, questionTypeDefinition, registerQuestionType, supportsQuestionTypeVersion, type QuestionTypeDefinition } from "../questionTypeCatalog";

// Phase 16A — Independent Review Fix 2: the COMPLETE version-family invariant. `definition.version = N` means the family ships
// executable implementations for EVERY version 1..N with no gaps — exactly what effectiveQuestionTypeVersion /
// supportsQuestionTypeVersion already promise to finalization. A family with a gap is refused BEFORE any registry is touched;
// nothing is ever filled from a neighbouring version. Fail-first on e58a461 (only the current version was required).

const caps: QuestionTypeDefinition["capabilities"] = { autoGrading: true, manualGrading: false, hybridGrading: false, partialCredit: true, compoundPart: true, interactive: true, requiresImage: false, offline: true };
const definition = (key: string, version: number): QuestionTypeDefinition => ({ key, version, label: "محاكاة " + key, category: "interactive", gradingMode: "auto", capabilities: caps, responseKinds: ["fields"], legacy: false });
/** One observably distinct implementation per version (editor text, renderer text, validator rule, defaults). */
const impl = (v: number): QuestionTypeVersionImplementation => ({
  defaults: ensure => { ensure("scenario", { rule: "v" + v }); },
  validate: node => ((node.scenario as { rule?: string } | undefined)?.rule === "v" + v ? [] : [{ code: "FAM_RULE_V" + v, message: "يتطلب rule=v" + v, severity: "error" as const }]),
  Editor: () => <div data-testid="fam-editor">محرر V{v}</div>,
  StudentRenderer: () => <div data-testid="fam-renderer">عرض V{v}</div>
});
const family = (key: string, current: number, versions: number[]): QuestionTypePlugin => ({ definition: definition(key, current), versions: Object.fromEntries(versions.map(v => [v, impl(v)])) });

/** Every registry must be empty for (key, 1..current) — the "no residue" oracle used after a refused registration. */
function expectNoResidue(key: string, upTo: number) {
  expect(isKnownQuestionType(key), key + " catalog residue").toBe(false);
  expect(listQuestionTypes().some(d => d.key === key)).toBe(false);
  for (let v = 1; v <= upTo; v++) {
    expect(resolveAuthoringEditor(key, v), key + "@" + v + " editor residue").toBeUndefined();
    expect(resolveStudentRenderer(key, v), key + "@" + v + " renderer residue").toBeUndefined();
    expect(hasRegisteredTypeDefaults(key, v), key + "@" + v + " defaults residue").toBe(false);
  }
  // the validator registry has no public "has": an unknown type yields exactly UNKNOWN_QUESTION_TYPE (no version-specific code)
  expect(validateQuestionTypeNode({ scenario: { rule: "zzz" } }, key, 1).map(i => i.code)).toEqual(["UNKNOWN_QUESTION_TYPE"]);
}

const undos: (() => void)[] = [];
afterEach(() => { for (const u of undos.splice(0).reverse()) u(); });

describe("RF2 — complete version-family invariant at registration", () => {
  it("RF2-1 — current V2 with only a V2 implementation is REFUSED before any registry mutation (no catalog / editor / renderer / defaults / validator residue)", () => {
    expect(() => registerQuestionTypePlugin(family("futureSimulation", 2, [2]))).toThrow(/missing implementation for version 1/);
    expectNoResidue("futureSimulation", 2);
    expect(effectiveQuestionTypeVersion("futureSimulation", 1)).toBeUndefined();                             // never "supported" without a family
  });
  it("RF2-2 — current V3 with {1, 3} is REFUSED because V2 is missing; nothing is filled from V1 or V3", () => {
    expect(() => registerQuestionTypePlugin(family("gapSimulation", 3, [1, 3]))).toThrow(/missing implementation for version 2/);
    expectNoResidue("gapSimulation", 3);
    expect(() => registerQuestionTypePlugin(family("gapSimulation", 4, [1, 2, 4]))).toThrow(/missing implementation for version 3/);
    expectNoResidue("gapSimulation", 4);
  });
  it("RF2-3 — a complete {1, 2, 3} family registers; @1 → V1, @2 → V2, @3 → V3 for editor, renderer, validator and defaults (exact, never a neighbour)", () => {
    undos.push(registerQuestionTypePlugin(family("fullSimulation", 3, [1, 2, 3])));
    expect(questionTypeDefinition("fullSimulation")?.version).toBe(3);
    const editors = [1, 2, 3].map(v => resolveAuthoringEditor("fullSimulation", v));
    const renderers = [1, 2, 3].map(v => resolveStudentRenderer("fullSimulation", v));
    for (let i = 0; i < 3; i++) {
      expect(editors[i], "editor @" + (i + 1)).toBeTruthy(); expect(renderers[i]?.version).toBe(i + 1);
      for (let j = 0; j < 3; j++) if (i !== j) { expect(editors[i]).not.toBe(editors[j]); expect(renderers[i]!.Renderer).not.toBe(renderers[j]!.Renderer); }
      // the V(i+1) validator accepts only its own rule
      expect(validateQuestionTypeNode({ scenario: { rule: "v" + (i + 1) } }, "fullSimulation", i + 1)).toEqual([]);
      expect(validateQuestionTypeNode({ scenario: { rule: "v" + (((i + 1) % 3) + 1) } }, "fullSimulation", i + 1).map(x => x.code)).toEqual(["FAM_RULE_V" + (i + 1)]);
      // defaults of exactly that version
      expect(hasRegisteredTypeDefaults("fullSimulation", i + 1)).toBe(true);
      expect((newQuestion("fullSimulation" as never, { examQuestionId: "q" + i, questionTypeVersion: i + 1 }) as unknown as { scenario: { rule: string } }).scenario.rule).toBe("v" + (i + 1));
    }
    expect(hasRegisteredTypeDefaults("fullSimulation", 4)).toBe(false);
    // Exact resolution at the registry level: with a catalog entry at version 3 and implementations registered DIRECTLY for
    // 1 and 3 only (the plugin seam would refuse such a family — this pins the registries themselves), @2 resolves to NOTHING:
    // never forward to V3, never back to V1.
    const E1 = () => null, E3 = () => null, R1 = () => null, R3 = () => null;
    undos.push(registerQuestionType(definition("gapRegistry", 3)));
    undos.push(registerAuthoringEditor("gapRegistry", 1, E1)); undos.push(registerAuthoringEditor("gapRegistry", 3, E3));
    undos.push(registerStudentRenderer("gapRegistry", 1, R1)); undos.push(registerStudentRenderer("gapRegistry", 3, R3));
    expect(resolveAuthoringEditor("gapRegistry", 1)).toBe(E1); expect(resolveAuthoringEditor("gapRegistry", 3)).toBe(E3);
    expect(resolveAuthoringEditor("gapRegistry", 2)).toBeUndefined();
    expect(resolveStudentRenderer("gapRegistry", 1)?.Renderer).toBe(R1); expect(resolveStudentRenderer("gapRegistry", 3)?.Renderer).toBe(R3);
    expect(resolveStudentRenderer("gapRegistry", 2)).toBeUndefined();
  });
  it("RF2-4 — with current = 3 an ABSENT stored version still resolves V1 everywhere (never current / latest)", () => {
    undos.push(registerQuestionTypePlugin(family("fullSimulation", 3, [1, 2, 3])));
    expect(effectiveQuestionTypeVersion("fullSimulation", undefined)).toBe(1);
    expect(resolveAuthoringEditor("fullSimulation", undefined)).toBe(resolveAuthoringEditor("fullSimulation", 1));
    expect(resolveStudentRenderer("fullSimulation", undefined)?.version).toBe(1);
    expect(validateQuestionTypeNode({ scenario: { rule: "v1" } }, "fullSimulation", undefined)).toEqual([]);
    expect(validateQuestionTypeNode({ scenario: { rule: "v3" } }, "fullSimulation", undefined).map(x => x.code)).toEqual(["FAM_RULE_V1"]);
    // a NEW question (no stored version) is created at the current version — that is creation, not reinterpretation
    expect(newQuestion("fullSimulation" as never, { examQuestionId: "n" }).questionTypeVersion).toBe(3);
  });
  it("RF2-5 — with current = 3 a stored V4 stays fail closed on every surface", () => {
    undos.push(registerQuestionTypePlugin(family("fullSimulation", 3, [1, 2, 3])));
    expect(effectiveQuestionTypeVersion("fullSimulation", 4)).toBeUndefined(); expect(supportsQuestionTypeVersion("fullSimulation", 4)).toBe(false);
    expect(resolveAuthoringEditor("fullSimulation", 4)).toBeUndefined(); expect(resolveStudentRenderer("fullSimulation", 4)).toBeUndefined();
    expect(validateQuestionTypeNode({ scenario: { rule: "v3" } }, "fullSimulation", 4).map(x => x.code)).toEqual(["UNSUPPORTED_QUESTION_TYPE_VERSION"]);
    expect(hasRegisteredTypeDefaults("fullSimulation", 4)).toBe(false);
  });
  it("RF2-6 — a gapped family fails BEFORE registerQuestionType() and before any executable registry is modified (all registries clean; a later complete registration of the same key succeeds)", () => {
    expect(() => registerQuestionTypePlugin(family("txSimulation", 3, [1, 3]))).toThrow(/missing implementation for version 2/);
    expectNoResidue("txSimulation", 3);
    expect(() => registerQuestionTypePlugin(family("txSimulation", 2, [2]))).toThrow(/missing implementation for version 1/);
    expectNoResidue("txSimulation", 2);
    undos.push(registerQuestionTypePlugin(family("txSimulation", 3, [1, 2, 3])));                       // nothing blocked it
    expect(isKnownQuestionType("txSimulation")).toBe(true); expect(resolveStudentRenderer("txSimulation", 2)?.version).toBe(2);
  });
});

describe("RF2 — validation / finalization invariant: a version the catalog calls supported always has its mandatory runtime", () => {
  it("for EVERY registered (production and plugin) type and every version 1..current: supportsQuestionTypeVersion ⇔ an authoring editor AND a student renderer exist — for non-legacy types (legacy types render through the inline adapters)", () => {
    undos.push(registerQuestionTypePlugin(family("fullSimulation", 3, [1, 2, 3])));
    undos.push(registerQuestionTypePlugin(family("singleSimulation", 1, [1])));
    for (const d of listQuestionTypes()) {
      for (let v = 1; v <= d.version + 1; v++) {
        const supported = supportsQuestionTypeVersion(d.key, v);
        expect(supported, d.key + "@" + v).toBe(v <= d.version);
        expect(effectiveQuestionTypeVersion(d.key, v)).toBe(supported ? v : undefined);
        if (d.legacy) continue;
        expect(!!resolveAuthoringEditor(d.key, v), d.key + "@" + v + " editor").toBe(supported);
        expect(!!resolveStudentRenderer(d.key, v), d.key + "@" + v + " renderer").toBe(supported);
      }
    }
  });
});
