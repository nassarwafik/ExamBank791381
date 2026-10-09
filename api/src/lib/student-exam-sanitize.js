// Student-safe exam sanitization.
//
// SECURITY: the exam snapshot stored on an assignment contains answer keys and teacher-side data
// (question.answer, field.correct, part.answer, hints, AI instructions, edit history). The student
// browser must NEVER receive any of it. This module is the single, recursive sanitizer used before an
// exam is sent to a student — it covers BOTH legacy flat exams (exam.questions[]) and structured
// exams (exam.sections[].questions[] with compound parts and generalized fields). It is pure and
// operates on a deep copy, so the caller's snapshot is never mutated.
//
// Design: a denylist of secret keys is stripped at every level (question, part, option, field), and
// the sanitizer recurses into options/fields/parts. Everything else — the data a student needs to
// render and answer the question (text, options text, field labels/options, wordBank, cli templates,
// table headers/rows, marks, images, stimuli, section rules, groupId, presentation metadata,
// displayNumber) — is preserved untouched, EXCEPT question media the teacher has hidden, which is removed from the
// student copy (see applyStudentMediaVisibility).

// Answer-key / solution flags that may appear on options and fields.
const FLAG_SECRET_KEYS = ["correct", "isCorrect", "correctText", "correctOptionIndex", "correctOptionValue", "correctOptionLabel", "solution", "expectedAnswer", "answerKey"];
// Teacher-side / secret keys that may appear on a question or a compound part.
// Phase 17C / 17E-A — official coding grading data (mode, scoring policy, hidden tests, reference solutions, grading intent / keys) is teacher / server
// data; it lives under the private answer key, and should any path ever copy it onto a node it is removed here (defense in depth).
const GRADING_SECRET_KEYS = ["gradingMode", "hiddenTests", "referenceSolutions", "codingGrading", "gradingKey", "answerHash", "questionFingerprint", "scoringPolicy", "compileErrorPolicy", "targetState", "modelAnswer", "rubric", "rubricAwards"];   // 19E: a rubric / model answer / awards live under `answer`; stripped here too if ever top-level (defense in depth)   // 17F-C2: the compile-error policy is teacher data too; 18C: the network CLI target state
const NODE_SECRET_KEYS = ["teacherNote", "aiInstruction", "hint", "history", "redoStack", "explanation", "rationale", ...FLAG_SECRET_KEYS, ...GRADING_SECRET_KEYS];
// Phase 13C-A — TEACHER PLANNING DATA: the assessment blueprint (exam level) and a question's / part's pedagogical
// classification are authoring data and never reach a student.
const PLANNING_KEYS = ["assessmentMeta"];
// Phase 13C-B — the live Blueprint intelligence (coverage report / evidence index) is runtime-derived teacher data and is
// never persisted on the exam; should any future path ever do so, it is removed here (defense in depth).
const TEACHER_ANALYTICS_KEYS = ["coverageReport", "blueprintCoverage", "assessmentIntelligence", "evidenceIndex",
  // Phase 13C-C — quality policy / gate results / finalization data are teacher governance data (the policy itself lives
  // inside the blueprint, which is already removed; these root keys are defense in depth)
  "qualityPolicy", "qualityGateReport", "finalizationDecision", "qualityBlockers", "qualityWarnings"];
// Phase 13C-A — an interactive-context descriptor IS student-visible, but only as DATA: these are the only fields kept.
// Anything content might use to name code (component / module / src / html …) or to claim trust (assessmentSafe …) is
// dropped here (the client registry ignores it anyway — defense in depth), and secret-looking keys are removed from the
// config recursively because the config is rendered in the student's browser.
const ACTIVITY_FIELDS = ["id", "kind", "key", "version", "title", "description", "config", "placement"];
// Review Fix 1 / R3: config keys are judged by the CANONICAL secret-key policy (case-insensitive, separators removed,
// semantic families), mirrored from src/secretKeyPolicy.ts and pinned by src/secretKeyPolicy.parity.test.ts — never an
// exact-spelling denylist that `correct_answer` / `CorrectAnswer` / `teacherAnswer` could walk past.
const { isSecretConfigKey } = require("./secret-key-policy.js");
// Import-only / teacher-only image keys that must never reach a student: the original URL of an external
// image the importer refused to embed, and the AI-generation `prompt` (Phase 5B never persists it on a
// structured question, but the legacy builder stores it on image objects — strip it here so it can never
// reach a student). Stripped from every image object AND asset (defense in depth).
const IMPORT_ONLY_IMAGE_KEYS = ["externalUrl", "prompt"];

function stripKeys(obj, keys) {
  for (const k of keys) if (k in obj) delete obj[k];
}
function stripSecretsDeep(value, depth = 0) {
  if (depth > 12) return undefined;
  if (Array.isArray(value)) return value.map(v => stripSecretsDeep(v, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (!isSecretConfigKey(k)) out[k] = stripSecretsDeep(v, depth + 1);
    return out;
  }
  return value;
}
// Student copy of an interactive-context descriptor (see ACTIVITY_FIELDS). Returns undefined for anything that is not a
// plain object, so a malformed value is dropped rather than forwarded.
function sanitizeActivityForStudent(activity) {
  if (!activity || typeof activity !== "object" || Array.isArray(activity)) return undefined;
  const out = {};
  for (const k of ACTIVITY_FIELDS) if (k in activity && activity[k] !== undefined) out[k] = activity[k];
  if (out.config && typeof out.config === "object") out.config = stripSecretsDeep(out.config);
  return out;
}
function applyActivityForStudent(node) {
  if (!("activity" in node)) return;
  const clean = sanitizeActivityForStudent(node.activity);
  if (clean) node.activity = clean; else delete node.activity;
}

// Optional cover/start page: keep ONLY known, safe display fields for the student, and only a banner
// that is a safe embedded raster data URL (no external URL / SVG / HTML). The cover never contains
// student identity or answer keys; this drops any teacher-only or foreign keys defensively. Returns
// undefined when there is no cover, so exams without one are unchanged.
const SAFE_BANNER_DATA_URL = /^data:image\/(png|jpe?g|webp|gif)\b/i;
function sanitizeCoverForStudent(cover) {
  if (!cover || typeof cover !== "object") return undefined;
  const bool = (v, d) => (typeof v === "boolean" ? v : d);
  const str = v => (typeof v === "string" ? v : undefined);
  const bannerUrl = cover.banner && typeof cover.banner === "object" ? cover.banner.dataUrl : undefined;
  const out = {
    enabled: bool(cover.enabled, false),
    activityType: cover.activityType === "training" ? "training" : cover.activityType === "exam" ? "exam" : undefined,
    subtitle: str(cover.subtitle),
    instructions: str(cover.instructions),
    allowedMaterials: str(cover.allowedMaterials),
    showStudentName: bool(cover.showStudentName, true),
    showClassName: bool(cover.showClassName, true),
    showExamDate: bool(cover.showExamDate, true),
    showDuration: bool(cover.showDuration, false),
    showTotalMarks: bool(cover.showTotalMarks, true),
    showMarksDistribution: bool(cover.showMarksDistribution, true)
  };
  if (typeof bannerUrl === "string" && SAFE_BANNER_DATA_URL.test(bannerUrl)) out.banner = { dataUrl: bannerUrl };
  const rich = projectRichContentForStudent(cover.instructionsRichContent);    // 20D.1: strict canonical rebuild or nothing
  if (rich) out.instructionsRichContent = rich;
  return out;
}

// Removes import-only keys from an image object ({ dataUrl, assets: [...] }) and its assets.
function sanitizeImageForStudent(image) {
  if (!image || typeof image !== "object") return image;
  if (Array.isArray(image)) return image.map(sanitizeImageAssetForStudent);
  const out = { ...image };
  stripKeys(out, IMPORT_ONLY_IMAGE_KEYS);
  if (Array.isArray(out.assets)) out.assets = out.assets.map(sanitizeImageAssetForStudent);
  return out;
}
function sanitizeImageAssetForStudent(asset) {
  if (!asset || typeof asset !== "object") return asset;
  const out = { ...asset };
  stripKeys(out, IMPORT_ONLY_IMAGE_KEYS);
  return out;
}

// STUDENT-VISIBLE MEDIA — the one visibility rule (hiding is a teacher choice; the student browser is student-
// controlled, so anything returned here is visible to the student even if the renderer never draws it).
// A question/part carries the canonical image { exists, visible, assets[] } and a legacy images[] fallback that
// the student renderer shows only when the canonical image is not shown:
//   • canonical SHOWN  (exists && visible)                              → its assets; images[] is never rendered → []
//   • canonical HIDDEN (exists && assets non-empty && visible === false) → nothing: its assets AND images[] are removed,
//     so the fallback can never re-show what the teacher hid (the teacher editor's isImageHidden, exactly)
//   • otherwise (no canonical image, e.g. a legacy images[]-only question) → images[] unchanged
// Canonical asset bytes are only ever sent when the canonical image is shown; otherwise only { exists, visible }
// remain (no assets key, so the renderer's image-vs-images[] precedence is exactly what it was). Only the student
// copy changes — the teacher's stored exam keeps the bytes, so "show" restores the same image.
function applyStudentMediaVisibility(node) {
  const img = node.image && typeof node.image === "object" && !Array.isArray(node.image) ? node.image : null;
  if (!img) return;
  const shown = !!(img.exists && img.visible && Array.isArray(img.assets));
  const hidden = !!(img.exists && Array.isArray(img.assets) && img.assets.length && img.visible === false);
  if (!shown) node.image = { exists: img.exists, visible: img.visible };   // flags only: no assets / bytes
  if ((shown || hidden) && "images" in node) node.images = [];
}

function sanitizeOptionForStudent(option) {
  if (!option || typeof option !== "object") return option;
  const out = { ...option }; // keeps value / label / text / order / number
  stripKeys(out, FLAG_SECRET_KEYS);
  return out;
}

function sanitizeFieldForStudent(field) {
  if (!field || typeof field !== "object") return field;
  const out = { ...field }; // keeps id / number / label / kind / row / column / statement / options
  stripKeys(out, FLAG_SECRET_KEYS); // remove field.correct etc.
  if (Array.isArray(out.options)) out.options = out.options.map(sanitizeOptionForStudent);
  return out;
}

// Phase 16A / Review Fix 1 — the UNIVERSAL student projection contract for registered question types (Wave 1 today; every
// simulation / interactive runtime profile of Phase 16B tomorrow): a type's student-visible data is PUBLIC configuration
// carried under type-owned object fields (numeric / matrix / categorization / scenario / publicConfig / …); every answer key,
// expected state, scoring assertion or solution lives ONLY under `answer` (removed above) or another teacher-only field the
// sanitizer always strips. This function never names a domain: EVERY object-valued field of a node that is not one of the
// structural fields with a dedicated sanitizer below is passed through the canonical secret-key policy (recursive), so a
// smuggled `correctColumn` / `expectedState` / `answerKey` inside any plugin object never reaches a student (defense in
// depth) while public structure (ids, labels, values) passes byte-for-byte. Persisted exam JSON can never name this code.
const STRUCTURAL_NODE_KEYS = new Set(["answer", "options", "fields", "parts", "image", "images", "activity", "stimulus", "openResponse", "codeStimulus", "smartSim"]);   // 20A: smartSim is REBUILT by its strict plugin projection below   // 19E: openResponse is REBUILT by its strict allow-list projection below · 19F: codeStimulus too
// Phase 17A — the coding config is additionally REBUILT through its allow-list projection (shared with the client renderer):
// only allowed / default languages, starter code, public sample tests (id / title / input / sampleOutput) and limits survive,
// so hidden tests, reference solutions, weights or notes smuggled into the public object never reach a student; a malformed
// config is dropped (fail closed). Hidden tests / comparator / reference solutions live under `answer`, blanked above.
const { projectCodingConfigForStudent } = require("./shared-finalization/codingQuestion");
function applyCodingProjection(node) {
  if (!("coding" in node)) return;
  const projected = projectCodingConfigForStudent(node.coding);
  if (projected) node.coding = projected; else delete node.coding;
}
// Phase 18C — the network CLI config is REBUILT through its allow-list projection (shared with the client renderer and the grader):
// only the device and the strictly normalized initial state survive; the target state lives under `answer`, blanked above.
const { projectNetworkCliConfigForStudent } = require("./shared-finalization/networkCliQuestion");
function applyNetworkCliProjection(node) {
  if (!("networkCli" in node)) return;
  const projected = projectNetworkCliConfigForStudent(node.networkCli);
  if (projected) node.networkCli = projected; else delete node.networkCli;
}
// Phase 19A — the inline cloze passage is REBUILT through its STRICT projection (shared with the renderer and the grader): only the
// passage text, blank ids / controls and dropdown option ids / labels survive; a config with ANY unknown field (e.g. a smuggled
// accepted answer or correct-option marker) is withheld entirely (fail closed). The per-blank key lives under `answer`, blanked above.
const { projectInlineClozeConfigForStudent } = require("./shared-finalization/inlineClozeQuestion");
function applyInlineClozeProjection(node) {
  if (!("inlineCloze" in node)) return;
  const projected = projectInlineClozeConfigForStudent(node.inlineCloze);
  if (projected) node.inlineCloze = projected; else delete node.inlineCloze;
}
// Phase 19B — parametricNumeric@1 is PER ATTEMPT: the authored config (variables, constraints, generator version) and the {{id}} stem
// template never reach a student. The node's `parametric` is REPLACED by the strict projection of the official instance of THIS
// attempt (rendered stem + the values it shows + the response presentation), generated from the server-owned identity the delivery
// passes in and the SAME section-scoped question key the grader uses (sectionQuestionId). No identity (live challenge, practice, a
// structured exam's stray flat list) or an invalid public contract ⇒ an explicit UNAVAILABLE projection. The private answer
// expression lives under `answer`, blanked like every key.
const { projectParametricNumericForStudent } = require("./shared-finalization/parametricNumericQuestion");
const { sectionQuestionId } = require("./exam-structure");
function parametricContext(ctx) {
  return ctx && typeof ctx === "object" && !Array.isArray(ctx) && ctx.generation && typeof ctx.generation === "object" && typeof ctx.questionKey === "string" ? { ...ctx.generation, questionKey: ctx.questionKey } : null;
}
function applyParametricProjection(out, source, ctx) {
  if (!(source && (source.presentationType === "parametricNumeric" || "parametric" in source))) return;
  const projected = projectParametricNumericForStudent(source, parametricContext(ctx));
  out.text = projected.text;
  out.parametric = projected.parametric;
  delete out.textHtml;                                                         // an HTML twin of the template would carry {{id}} syntax
}
// Phase 19D — the visual configs are REBUILT through their STRICT projections (shared with the renderers and the graders): only the
// public hotspot settings (mode, selections, image description) and the public labelDiagram zones / labels survive; a config smuggling
// ANY other field (targets, a correct mapping) is withheld entirely (fail closed). Target regions and the correct mapping live under
// `answer`, blanked like every key. The image is the question's canonical `image`, delivered by the existing media path.
const { projectHotspotConfigForStudent } = require("./shared-finalization/hotspotQuestion");
const { projectLabelDiagramConfigForStudent } = require("./shared-finalization/labelDiagramQuestion");
// Phase 21A.1 — chartSelection: the public config (the declarative chart + target kind + mode + bound) is REBUILT through its strict
// projection (the chart through the ONE ChartSpecV1 authority); a config smuggling any other field (a correct target) is withheld whole.
const { projectChartSelectionConfigForStudent } = require("./shared-finalization/chartSelectionQuestion");
// Phase 21A.2 — functionGraphSelection: the public config is REBUILT through its strict projection (the graph through the ONE
// FunctionGraphSpecV1 authority, without teacher-only semantics: roles, on-curve claims, derivative relations, authored slopes); a config
// smuggling any other field (a correct target) is withheld whole.
const { projectFunctionGraphSelectionConfigForStudent } = require("./shared-finalization/functionGraphSelectionQuestion");
// Phase 21C — strict allow-list rebuild of public 3D scene-selection configuration; private correctness remains under answer.
const { projectScene3DSelectionConfigForStudent } = require("./shared-finalization/scene3DSelectionQuestion");
function applyVisualProjection(node) {
  if ("chartSelection" in node) { const p = projectChartSelectionConfigForStudent(node.chartSelection); if (p) node.chartSelection = p; else delete node.chartSelection; }
  if ("functionGraphSelection" in node) { const p = projectFunctionGraphSelectionConfigForStudent(node.functionGraphSelection); if (p) node.functionGraphSelection = p; else delete node.functionGraphSelection; }
  if ("scene3DSelection" in node) { const p = projectScene3DSelectionConfigForStudent(node.scene3DSelection); if (p) node.scene3DSelection = p; else delete node.scene3DSelection; }
  if ("hotspot" in node) { const p = projectHotspotConfigForStudent(node.hotspot); if (p) node.hotspot = p; else delete node.hotspot; }
  if ("labelDiagram" in node) { const p = projectLabelDiagramConfigForStudent(node.labelDiagram); if (p) node.labelDiagram = p; else delete node.labelDiagram; }
}
// Phase 19E — the openResponse config is REBUILT through its STRICT projection (shared with the renderer): only the canonical public
// settings survive, plus — when the teacher chose a `visible` rubric — the canonical public rubric (titles, public descriptions, max
// points, level labels / points / descriptions) derived from the VALID private rubric. A config with ANY other field (a smuggled
// rubric, public rubric or model answer) is withheld entirely; criterion guidance, ids, flags and the model answer never leave `answer`
// (blanked like every key). Being a full allow-list rebuild, it is a structural key (not re-filtered by the secret-key denylist).
const { projectOpenResponseForStudent } = require("./shared-finalization/openResponseQuestion");
function applyOpenResponseProjection(node, source) {
  if (!("openResponse" in node)) return;
  const p = projectOpenResponseForStudent(node.openResponse, source && typeof source === "object" ? source.answer : undefined);
  if (p) node.openResponse = p; else delete node.openResponse;
}
// Phase 19F — the read-only code stimulus is REBUILT through its STRICT projection (shared with the renderer and the finalization gate):
// exactly { language, source, label? }; anything else in it (a smuggled answer / expected value) withholds the whole stimulus. A part
// never carries one (finalization refuses it), so a part's is always removed.
const { projectCodeStimulusForStudent } = require("./shared-finalization/codeStimulus");
function applyCodeStimulusProjection(node, part) {
  if (!("codeStimulus" in node)) return;
  const p = part ? null : projectCodeStimulusForStudent(node.codeStimulus);
  if (p) node.codeStimulus = p; else delete node.codeStimulus;
}
// Phase 19G — the section-owned SCENARIOS (shared sources + the ids of the same section's questions) are REBUILT through the ONE strict
// shared projection: canonical copies of the scenarios that pass EVERY rule (structure, source contract, same-section membership, one
// scenario per question, contiguity). A scenario that fails any rule — a source smuggling an answer, a future version, an unknown source
// kind, a missing / shared / cross-section reference — is withheld whole (fail closed); the stored object is never spread.
const { projectSectionScenariosForStudent } = require("./shared-finalization/scenarioSource");
function applyScenariosForStudent(out, section) {
  if (!("scenarios" in out)) return;
  const projected = projectSectionScenariosForStudent(section);
  if (projected === undefined) delete out.scenarios; else out.scenarios = projected.map(s => ({ ...s, sources: projectStudentSources(s.sources) }));
}
// Phase 19G — the LEGACY shared stimulus (section.stimuli[groupId] and the per-question / per-part `stimulus` fallback the renderer reads)
// is rebuilt through its allow-list — exactly what StructuredExamSection.StimulusBlock renders: title / text (strings only), image →
// { dataUrl } (string only), activity → the canonical activity projection. Any other key (an answer or solution stored next to the
// passage) never reaches the student. Narrowest safe fix: nothing a student could see before is lost; the legacy model is not reinterpreted.
function sanitizeStimulusForStudent(stim) {
  if (!stim || typeof stim !== "object" || Array.isArray(stim)) return undefined;
  const out = {};
  if (typeof stim.title === "string") out.title = stim.title;
  if (typeof stim.text === "string") out.text = stim.text;
  if (stim.image && typeof stim.image === "object" && !Array.isArray(stim.image) && typeof stim.image.dataUrl === "string") out.image = { dataUrl: stim.image.dataUrl };
  if ("activity" in stim) { const a = sanitizeActivityForStudent(stim.activity); if (a) out.activity = a; }
  return out;
}
function applyStimulusForStudent(node) {
  if (!("stimulus" in node)) return;
  const clean = sanitizeStimulusForStudent(node.stimulus);
  if (clean) node.stimulus = clean; else delete node.stimulus;
}
// Phase 20A — the trusted SmartSim envelope is REBUILT through the ONE strict authority shared with the renderer and the grader: exactly
// { schemaVersion, pluginKey, pluginVersion, config } with the plugin's canonical public config (topology, initial states). An unknown plugin
// identity / version, an unknown envelope key or ANY field outside the plugin's config contract (a smuggled expected value) withholds the whole
// envelope (fail closed). The private weighted checks live under `answer`, blanked like every key; a part never carries one (not compound).
const { projectSmartSimForStudent } = require("./shared-finalization/trustedSimPlugins");
function applySmartSimProjection(node, part) {
  if (!("smartSim" in node)) return;
  const p = part ? undefined : projectSmartSimForStudent(node.smartSim);
  if (p) node.smartSim = p; else delete node.smartSim;
}
// Phase 20D — composite@1 is REBUILT through its STRICT projection (never spread, never only deny-listed): the ONE structure authority
// (shared build) validates the whole composite first — any broken authority (unknown key, smuggled field, malformed / future context, invalid
// source or envelope, nested composite, mark mismatch …) withholds it as an explicit UNAVAILABLE object, so the student never receives a
// partial or repaired composite. Otherwise: each shared SOURCE context → its canonical SourceStimulusV1 copies; each shared SMARTSIM context →
// its canonical PUBLIC envelope (private checks live on the parts' `answer`, never on the context); each group → id / title / instructions /
// rule; each CHILD → the SAME per-type projection a standalone question of its type receives (sanitizeQuestionForStudent on the child node:
// coding allow-list, open-response public rubric, inline-cloze / visual strict configs, SmartSim envelope, parametric per-attempt instance
// generated from the SERVER-owned child key <questionId>::part::<partId>). The structure authority already admits on a child ONLY the common
// part keys + its OWN type's config keys (exact keys, a foreign / unknown key withholds the whole composite), so this function never names a
// domain: after the per-type projection it removes the private key and the legacy blank teacher fields structurally. A SmartSim part linked
// to a shared context carries no envelope of its own (identity + text + marks only). sanitizePartForStudent (legacy compound) is untouched.
const { compositeStructure, compositeChildNode, compositeChildKey, projectCompositeContextForStudent, isCompositeQuestionNode } = require("./shared-finalization/compositeQuestion");
// Phase 20D.1 — presentation-only fields are PROJECTED, never spread and never passed through the generic deep secret stripper: the rich
// stem / rich instructions are the strict canonical RichContentV1 rebuild (malformed → omitted → the plain text fallback), the question /
// section / exam presentation is the strict canonical copy (malformed → omitted → the default design). A parametric stem never carries
// rich content (the generated instance replaces `text`; a rich twin would leak the {{id}} template). Academically inert.
const { projectRichContentForStudent } = require("./shared-finalization/richContent/richContentModel");
// 21A.2 SECURITY: rich SOURCE stimuli are strictly validated by the source authority, but their
// function-graph annotations remain teacher-only. Apply the SAME public rich-block projection
// as question stems before returning shared sources (both scenario and composite pathways).
function projectStudentSources(sources) {
  return sources.map(s => s.kind === "rich" ? { ...s, richContent: projectRichContentForStudent(s.richContent) } : s);
}
const { projectPresentationForStudent, projectSectionPresentationForStudent, projectQuestionPresentationForStudent } = require("./shared-finalization/presentation/presentationModel");
function takePresentationFields(out) {
  const taken = { richContent: out.richContent, presentation: out.presentation };
  delete out.richContent; delete out.presentation;
  return taken;
}
function applyPresentationFields(out, taken, source) {
  // ONE parametric predicate (review fix 1) — the same one applyParametricProjection uses: the authored {{id}} template must never ride
  // along as a rich stem on any node that is generated per attempt.
  const parametric = !!source && (String(source.presentationType ?? source.type ?? "") === "parametricNumeric" || "parametric" in source);
  const rich = parametric ? undefined : projectRichContentForStudent(taken.richContent);
  if (rich) out.richContent = rich;
  const pres = projectQuestionPresentationForStudent(taken.presentation);
  if (pres && taken.presentation !== undefined) out.presentation = pres;
}
const COMPOSITE_CHILD_DROP_KEYS = ["answer", "hint", "teacherNote", "aiInstruction", "history", "redoStack", "presentationType", "textHtml", "assessmentMeta"];
function applyCompositeProjection(out, source, ctx) {
  if (!isCompositeQuestionNode(source)) return;
  delete out.parts;                                                                                   // a composite never carries legacy parts
  const st = compositeStructure(source);
  if (!st.ok) { out.composite = { v: 1, status: "unavailable" }; return; }
  const qkey = ctx && typeof ctx === "object" && typeof ctx.questionKey === "string" ? ctx.questionKey : null;
  const generation = ctx && typeof ctx === "object" && ctx.generation && typeof ctx.generation === "object" ? ctx.generation : null;
  const child = p => {
    if (p.linkedSmartSim) { const rich = projectRichContentForStudent(p.raw.richContent); return { id: p.id, ...(typeof p.raw.label === "string" ? { label: p.raw.label } : {}), type: p.type, ...(p.raw.questionTypeVersion !== undefined ? { questionTypeVersion: p.raw.questionTypeVersion } : {}), ...(typeof p.raw.text === "string" ? { text: p.raw.text } : {}), ...(rich ? { richContent: rich } : {}), marks: p.marks, contextId: p.contextId }; }
    const s = sanitizeQuestionForStudent(compositeChildNode(p.raw), generation && qkey ? { generation, questionKey: compositeChildKey(qkey, p.id) } : null);
    const o = { ...s };
    stripKeys(o, COMPOSITE_CHILD_DROP_KEYS);
    for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
    o.type = p.type;
    if (p.contextId !== undefined) o.contextId = p.contextId;
    return o;
  };
  out.composite = {
    v: 1,
    contexts: st.model.contexts.map(c => {
      const projected = projectCompositeContextForStudent(c);
      return c.kind === "source" ? { ...projected, sources: projectStudentSources(c.sources) } : projected;
    }),
    groups: st.model.groups.map(g => ({ id: g.id, ...(g.title !== undefined ? { title: g.title } : {}), ...(g.instructions !== undefined ? { instructions: g.instructions } : {}), gradingPolicy: g.gradingPolicy, requiredAnswers: g.requiredAnswers, maxMarks: g.maxMarks, parts: g.parts.map(child) }))
  };
}
function applyTypeConfigForStudent(node) {
  for (const k of Object.keys(node)) {
    if (STRUCTURAL_NODE_KEYS.has(k)) continue;
    const v = node[k];
    if (v && typeof v === "object") node[k] = stripSecretsDeep(v);
  }
}

function sanitizePartForStudent(part) {
  if (!part || typeof part !== "object") return part;
  const out = { ...part }; // keeps id / label / text / textHtml / marks / type / questionTypeVersion / wordBank / cli / tableHeaders / tableRows / image(s) / groupId
  delete out.answer; // remove part.answer (grading key)
  delete out.richContent; delete out.presentation;                          // 20D.1: compound@1 parts never carry presentation fields
  applyVisualProjection(out);          // 19D: strict projection of the RAW config first (a smuggled field withholds it)
  applyOpenResponseProjection(out, part);                                       // 19E: never compound-capable; defense in depth
  applyCodeStimulusProjection(out, true);                                       // 19F: a part never carries a stimulus
  applyStimulusForStudent(out);                                                 // 19G: the legacy stimulus fallback is allow-listed
  applySmartSimProjection(out, true);                                           // 20A: never compound-capable; defense in depth
  applyTypeConfigForStudent(out);
  applyCodingProjection(out);
  applyNetworkCliProjection(out);
  applyInlineClozeProjection(out);
  applyParametricProjection(out, part, null);                                  // never compound-capable: no identity ⇒ unavailable
  stripKeys(out, NODE_SECRET_KEYS);
  stripKeys(out, PLANNING_KEYS);
  applyActivityForStudent(out);
  if (out.image) out.image = sanitizeImageForStudent(out.image);
  if (Array.isArray(out.images)) out.images = out.images.map(sanitizeImageAssetForStudent);
  applyStudentMediaVisibility(out);
  if (Array.isArray(out.options)) out.options = out.options.map(sanitizeOptionForStudent);
  if (Array.isArray(out.fields)) out.fields = out.fields.map(sanitizeFieldForStudent);
  if (Array.isArray(out.parts)) out.parts = out.parts.map(sanitizePartForStudent); // defensive: nested parts
  return out;
}

function sanitizeQuestionForStudent(question, ctx) {
  if (!question || typeof question !== "object") return question;
  // Legacy-identical blanking (answer:{}, hint:"", …) so existing behaviour/tests are unchanged,
  // then strip any additional secret flags and recurse into the new structured children.
  const out = { ...question, answer: {}, hint: "", teacherNote: "", aiInstruction: "", history: [], redoStack: [] };
  delete out.assetRequest;                                                      // 20F: a teacher-only AI composer image request
  const presentationFields = takePresentationFields(out);                    // 20D.1: projected below, never deep-stripped / spread
  applyVisualProjection(out);          // 19D: strict projection of the RAW config first (a smuggled field withholds it)
  applyOpenResponseProjection(out, question);                                   // 19E: the public rubric is derived from the ORIGINAL private key
  applyCodeStimulusProjection(out, false);                                      // 19F: strict read-only code stimulus
  applyStimulusForStudent(out);                                                 // 19G: the legacy stimulus fallback is allow-listed
  applySmartSimProjection(out, false);                                          // 20A: strict trusted-plugin envelope
  applyTypeConfigForStudent(out);
  applyCodingProjection(out);
  applyNetworkCliProjection(out);
  applyInlineClozeProjection(out);
  applyParametricProjection(out, question, ctx);
  applyCompositeProjection(out, question, ctx);                                 // 20D: strict composite rebuild (after the generic deep strip)
  stripKeys(out, ["explanation", "rationale", ...FLAG_SECRET_KEYS, ...GRADING_SECRET_KEYS]);
  stripKeys(out, PLANNING_KEYS);
  applyActivityForStudent(out);
  if (out.image) out.image = sanitizeImageForStudent(out.image);
  if (Array.isArray(out.images)) out.images = out.images.map(sanitizeImageAssetForStudent);
  applyStudentMediaVisibility(out);
  if (Array.isArray(out.options)) out.options = out.options.map(sanitizeOptionForStudent);
  if (Array.isArray(out.fields)) out.fields = out.fields.map(sanitizeFieldForStudent);
  if (Array.isArray(out.parts)) out.parts = out.parts.map(sanitizePartForStudent);
  applyPresentationFields(out, presentationFields, question);
  return out;
}

function sanitizeSectionForStudent(section, ctx) {
  if (!section || typeof section !== "object") return section;
  const out = { ...section }; // keeps id / title / instructions / gradingPolicy / maxMarks / requiredAnswers / answerUnit / stimuli
  const gen = ctx && typeof ctx === "object" && !Array.isArray(ctx) ? ctx.generation : null, sid = ctx && typeof ctx === "object" && typeof ctx.sectionId === "string" ? ctx.sectionId : String(section.id ?? "");
  if (Array.isArray(out.questions)) out.questions = out.questions.map((q, i) => sanitizeQuestionForStudent(q, gen ? { generation: gen, questionKey: sectionQuestionId({ id: sid }, q, i) } : null));
  if (out.stimuli && typeof out.stimuli === "object" && !Array.isArray(out.stimuli)) {
    const stimuli = {};
    for (const [key, stim] of Object.entries(out.stimuli)) {
      const clean = sanitizeStimulusForStudent(stim);                           // 19G: allow-list rebuild (title / text / image.dataUrl / activity)
      if (clean) stimuli[key] = clean;
    }
    out.stimuli = stimuli;
  }
  applyScenariosForStudent(out, section);                                       // 19G: strict shared projection, never a spread
  const rich = projectRichContentForStudent(section.instructionsRichContent), pres = projectSectionPresentationForStudent(section.presentation);   // 20D.1
  delete out.instructionsRichContent; delete out.presentation;
  if (rich) out.instructionsRichContent = rich;
  if (pres && section.presentation !== undefined) out.presentation = pres;
  return out;
}

// The one entry point. Deep-copies, drops revisionHistory, and sanitizes both legacy questions[] and
// structured sections[].questions[]. Top-level presentation fields (presentationTheme, metadata, …)
// pass through unchanged (Phase 20D.1: the versioned `presentation` object is a strict canonical projection) EXCEPT teacher/import-only provenance (metadata.import), which is removed so
// import details (source file name, original examId, …) never reach a student.
// Phase 19B — `options.parametric` = the server-owned { assignmentId, studentId, attemptNumber } of the attempt being delivered.
function sanitizeExamForStudent(exam, options) {
  const x = JSON.parse(JSON.stringify(exam || {}));
  const generation = options && typeof options === "object" && options.parametric && typeof options.parametric === "object" ? options.parametric : null;
  const structured = Array.isArray(x.sections) && x.sections.length > 0;          // exactly normalizeExamStructure's choice
  x.revisionHistory = [];
  if (x.metadata && typeof x.metadata === "object" && "import" in x.metadata) delete x.metadata.import;
  if (x.metadata && typeof x.metadata === "object" && "aiComposer" in x.metadata) delete x.metadata.aiComposer;   // 20F: teacher-only authoring history / coverage
  if ("blueprint" in x) delete x.blueprint;                                   // Phase 13C-A: teacher planning data
  for (const k of TEACHER_ANALYTICS_KEYS) if (k in x) delete x[k];             // Phase 13C-B: live intelligence is never student data
  if ("coverPage" in x) x.coverPage = sanitizeCoverForStudent(x.coverPage);
  if ("presentation" in x) { const p = projectPresentationForStudent(x.presentation); if (p) x.presentation = p; else delete x.presentation; }   // 20D.1: canonical or nothing
  if (Array.isArray(x.questions)) x.questions = x.questions.map((q, i) => sanitizeQuestionForStudent(q, generation && !structured ? { generation, questionKey: sectionQuestionId({ id: "__default__" }, q, i) } : null));
  if (Array.isArray(x.sections)) x.sections = x.sections.map((s, si) => sanitizeSectionForStudent(s, { generation, sectionId: String(s?.id ?? "section-" + (si + 1)) }));
  return x;
}

module.exports = {
  sanitizeExamForStudent,
  applyStudentMediaVisibility,
  sanitizeCoverForStudent,
  sanitizeSectionForStudent,
  sanitizeQuestionForStudent,
  sanitizePartForStudent,
  sanitizeFieldForStudent,
  sanitizeOptionForStudent
};
