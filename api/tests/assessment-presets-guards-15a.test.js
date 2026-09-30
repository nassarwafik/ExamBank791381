import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Phase 15A §62 — architecture / security guards for Assessment Presets. They pin the SHAPE: allow-list extraction (no copy-then-
// strip), no question / stimulus / governance field in the model, pure model dependencies (no governance engine, bank fetch,
// grader, student state or React), the API's ownership from requireBuilderAuth only (never body.ownerId), server validation
// through the generated shared module (no third validator), CAS on update / delete, the legacy exam-template path untouched.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const strip = t => t.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s\/\/(?![^\n]*["'`]).*$/gm, "");
const read = f => strip(fs.readFileSync(path.join(repo, f), "utf8"));
const MODEL = read("src/assessmentPreset.ts");
const LIB = read("api/src/lib/assessment-presets.js");
const FN = read("api/src/functions/assessment-presets.js");
const ARTIFACT = read("api/src/functions/save-exam-artifact.js");
const PANEL = read("src/presets/PresetLibraryPanel.tsx");
const CLIENT = read("src/presets/assessmentPresetClient.ts");
const BUILDER = read("src/StructuredExamBuilder.tsx");
const SHARED = fs.readFileSync(path.join(repo, "api/src/lib/shared-finalization/assessmentPreset.js"), "utf8");
const BUILD = read("scripts/build-shared-finalization.mjs");
const CSS = fs.readFileSync(path.join(repo, "src/presets/presetLibrary.css"), "utf8");

describe("15A §62 — pure model guards", () => {
  it("the model depends only on assessment / exam / theme types, the canonical validators and genId — never on governance, the bank, the grader, student state or React", () => {
    const imports = [...MODEL.matchAll(/from "([^"]+)"/g)].map(m => m[1]).sort();
    expect(imports).toEqual(["./assessmentBlueprint", "./assessmentQualityPolicy", "./assessmentTypes", "./assessmentTypes", "./examBuilderState", "./examTheme", "./examTypes"]);
    expect(MODEL).not.toMatch(/react|examGovernance|bank|grader|student|fetch\(|localStorage|window\.|document\./i);
  });
  it("extraction is an ALLOW-LIST: the preset and its blueprint are constructed field by field; no spread of the exam / section / blueprint, no delete-after-copy", () => {
    const extract = MODEL.slice(MODEL.indexOf("function copyIdentity("), MODEL.indexOf("export type InstantiateOptions"));
    expect(extract).not.toMatch(/\.\.\.exam\b|\.\.\.s\b|\.\.\.bp\b|\.\.\.section\b|\.\.\.c\b(?!\.)|delete /);
    expect(extract).toMatch(/presetSectionId, title: String\(s\.title \?\? ""\), gradingPolicy: s\.gradingPolicy/);
    expect(extract).toMatch(/dimension === "section" \? sectionRef\(c\.ref\) : c\.ref/);
    // the model's key allow-lists are closed sets: questions / stimuli / governance / owner can never ride along
    expect(MODEL).toMatch(/const PRESET_KEYS: ReadonlySet<string> = new Set\(\["schemaVersion", "presetId", "title", "description", "blueprint", "sections", "presentationTheme"\]\)/);
    expect(MODEL).toMatch(/const SECTION_KEYS: ReadonlySet<string> = new Set\(\["presetSectionId", "title", "instructions", "gradingPolicy", "maxMarks", "requiredAnswers", "answerUnit"\]\)/);
    expect(MODEL).toMatch(/if \(!PRESET_KEYS\.has\(key\)\) add\("FORBIDDEN_FIELD"/); expect(MODEL).toMatch(/if \(!SECTION_KEYS\.has\(key\)\) add\("FORBIDDEN_FIELD"/);
  });
  it("Review Fix 1 — extraction is FAIL-CLOSED: validateSourceDesign (section identity → validateBlueprint with the SOURCE ids → validateAssessmentQualityPolicy) runs and returns BEFORE any copy; duplicates are refused, never repaired", () => {
    const extract = MODEL.slice(MODEL.indexOf("export function extractAssessmentPresetFromExam("), MODEL.indexOf("export function assessmentPresetFromExam("));
    const validateAt = extract.indexOf("validateSourceDesign(exam)"), returnAt = extract.indexOf("if (source.issues.length) return"), copyAt = extract.indexOf("copyBlueprintWithSectionRefs(");
    expect(validateAt).toBeGreaterThan(-1); expect(returnAt).toBeGreaterThan(validateAt); expect(copyAt).toBeGreaterThan(returnAt);
    expect(extract.indexOf("map.set(s.id, pid)")).toBeGreaterThan(returnAt);
    expect(extract).toMatch(/const check = validateAssessmentPreset\(preset\);/);
    const source = MODEL.slice(MODEL.indexOf("export function validateSourceDesign("), MODEL.indexOf("export function extractAssessmentPresetFromExam("));
    expect(source).not.toMatch(/copyBlueprintWithSectionRefs|copyPolicy|copyRule|presetSectionOf|\.map\(copy/);
    expect(source).toMatch(/validateBlueprint\(exam\.blueprint, \{ sectionIds \}\)/); expect(source).toMatch(/validateAssessmentQualityPolicy\(bp\.qualityPolicy/);
    expect(source).toMatch(/add\("DUPLICATE_SOURCE_SECTION_ID"/); expect(source).toMatch(/add\("INVALID_SOURCE_SECTION_ID"/);
    expect(source).not.toMatch(/first wins|seen\.has\(id\)\) \{ sectionIds/);
    // the null wrapper delegates to the fail-closed authority (no second copy path)
    expect(MODEL).toMatch(/return result\.ok \? result\.preset : null;/);
    // the panel never shows an internal runtime message: only PresetRequestError text or a fixed phrase reaches the alert
    expect(PANEL).not.toMatch(/e instanceof Error \? e\.message/);
    expect(PANEL).toMatch(/result\.reason === "no-blueprint"\) setError\(NO_BLUEPRINT_MESSAGE\)/);
  });
  it("instantiation always regenerates section ids and the exam id, starts as draft with empty questions / stimuli, and never copies a governance or owner field", () => {
    const inst = MODEL.slice(MODEL.indexOf("export function instantiateExamFromPreset("), MODEL.indexOf("export function presetSummary("));
    expect(inst).toMatch(/sectionIdFor \?\? \(\(\) => genId\("sec"\)\)/);
    expect(inst).toMatch(/examId: options\.examId \?\? newInstantiatedExamId\(\)/);
    expect(inst).toMatch(/status: "draft"/); expect(inst).toMatch(/stimuli: \{\}, questions: \[\]/);
    expect(inst).not.toMatch(/governance|lifecycleState|revision|ownerId|publishedRevisionId|history|autosave/);
    expect(inst).toMatch(/copyBlueprintWithSectionRefs\(preset\.blueprint, ref => map\.get\(ref\) \?\? ref\)/);
  });
  it("Blueprint / Quality Policy validation is REUSED (validateBlueprint with the preset section ids, validateAssessmentQualityPolicy) — no reimplemented math", () => {
    expect(MODEL).toMatch(/validateBlueprint\(input\.blueprint, \{ sectionIds \}\)/);
    expect(MODEL).toMatch(/validateAssessmentQualityPolicy\(bp\.qualityPolicy, bp as unknown as AssessmentBlueprintV1\)/);
    expect(MODEL).not.toMatch(/BLUEPRINT_DIMENSIONS|QUALITY_TRIGGER_RELATIONS|totalQuestions\s*[<>]/);
  });
});

describe("15A §62 — server guards", () => {
  it("ownership is ONLY the authenticated subject: the function uses requireBuilderAuth and never reads body.ownerId / owner / version / presetId-on-create", () => {
    expect(FN).toMatch(/requireBuilderAuth/); expect(FN).toMatch(/const ownerId = String\(auth\.user\.sub\);/);
    expect(FN).not.toMatch(/body\.(ownerId|owner|version|createdAt|updatedAt|role|capabilities|sub)\b/);
    expect(FN).not.toMatch(/student-auth|requireStudentAuth|verifyBuilderToken|BUILDER_USERS/);
    expect(LIB).not.toMatch(/\b(body|request|req|query)\b/);
    expect(LIB).toMatch(/const presetId = "apr-" \+ newId\(deps\);/);                                    // server-minted id
    expect(LIB).toMatch(/version: 1, createdAt: at, updatedAt: at/);
    expect(LIB).toMatch(/createHash\("sha256"\)\.update\("assessment-preset:" \+ String\(actorId \|\| ""\)\)/);
  });
  it("the server validates through the generated shared module (one validator, drift-guarded) — no third implementation; the shared build lists the preset entry", () => {
    expect(LIB).toMatch(/require\("\.\/shared-finalization\/assessmentPreset"\)/);
    expect(LIB).toMatch(/shared\.validateAssessmentPreset\(candidate\)/);
    expect(LIB).not.toMatch(/gradingPolicy|BLUEPRINT|schemaVersion !== 1 \|\| !Array\.isArray\(input\.sections/);
    expect(BUILD).toMatch(/SHARED_ENTRIES = \[SHARED_ENTRY, "src\/assessmentPreset\.ts"\]/);
    expect(SHARED).toMatch(/^\/\/ GENERATED by scripts\/build-shared-finalization\.mjs/);
    expect(SHARED).toMatch(/validateAssessmentPreset/);
  });
  it("create is create-only; update and delete are ETag compare-and-set gated by expectedVersion — no unconditional overwrite, no plain delete", () => {
    expect(LIB).toMatch(/uploadJsonConditional\(container, presetName\(ownerId, presetId\), record, null\)/);
    expect(LIB).toMatch(/if \(record\.version !== expectedVersion\) throw new PresetError\(409, "STALE_VERSION"/);
    expect(LIB).toMatch(/uploadJsonConditional\(container, name, next, etag\)/);
    expect(LIB).toMatch(/deleteBlobConditional\(container, name, etag\)/);
    expect(LIB).not.toMatch(/storage\.uploadJson\(|storage\.deleteBlob\(|mutateJsonWithRetry/);
    expect(LIB).toMatch(/value\.ownerId !== ownerId \|\| value\.presetId !== presetId/);            // a foreign record is the same not-found
  });
  it("presets live in their own namespace; the legacy exam-template path of save-exam-artifact is untouched and never reinterpreted", () => {
    expect(LIB).toMatch(/const PRESET_PREFIX = "assessment-presets\/";/);
    expect(LIB).not.toMatch(/templates\/|exam-template/);
    expect(ARTIFACT).toMatch(/kind:\s*"exam-template"/); expect(ARTIFACT).toMatch(/"templates\/"/);
    expect(ARTIFACT).not.toMatch(/assessment-preset|assessmentPreset|blueprint:/);
    expect(FN).not.toMatch(/save-exam-artifact|exam-template/);
  });
});

describe("15A §62 — UI guards", () => {
  it("the panel creates exams only through the pure authority and hands them to the owner; it never mutates the current exam or calls the exam save path", () => {
    expect(PANEL).toMatch(/instantiateExamFromPreset\(rec\.preset\)/); expect(PANEL).toMatch(/extractAssessmentPresetFromExam\(latest\(\)/); expect(PANEL).not.toMatch(/[^t]assessmentPresetFromExam\(/);
    expect(PANEL).not.toMatch(/onChange\(|onSave\(|save-exam-artifact|examGovernance|structuredHistory/);
    expect(PANEL).not.toMatch(/dangerouslySetInnerHTML/);
    expect(CLIENT).not.toMatch(/ownerId|version:|createdAt/);                                              // the client sends preset content and expectedVersion only
    expect(CLIENT).toMatch(/action: "update", presetId, expectedVersion, preset/); expect(CLIENT).toMatch(/action: "delete", presetId, expectedVersion/);
  });
  it("the Builder reuses the ONE 13A unsaved-work confirmation for preset instantiation and lazy-loads the library", () => {
    expect(BUILDER).toMatch(/const confirmLeaveUnsaved = async/);
    expect(BUILDER).toMatch(/if \(!\(await confirmLeaveUnsaved\("الخروج دون حفظ"\)\)\) return;/);
    expect(BUILDER).toMatch(/if \(!\(await confirmLeaveUnsaved\("فتح الامتحان الجديد دون حفظ"\)\)\) return false;/);
    expect(BUILDER).toMatch(/const PresetLibraryPanel = lazy\(\(\) => import\("\.\/presets\/PresetLibraryPanel"\)\);/);
    expect((BUILDER.match(/title: "تغييرات غير محفوظة"/g) || []).length).toBe(1);                    // ONE unsaved-work confirmation text, shared
  });
  it("mobile / RTL: the stylesheet has a narrow-screen rule and 44px targets, no fixed widths", () => {
    expect(CSS).toMatch(/@media \(max-width:640px\)/); expect(CSS).toMatch(/min-height:44px/); expect(CSS).not.toMatch(/(^|[^-])width:\s*\d{3,}px/);
  });
});
