// Phase 20F — the AI CAPABILITY CATALOG: the ONE place the composer learns what it may generate, DERIVED from the production registries
// (question-type catalog + exact versions, the registered SmartSim plugins and their code-owned curriculum scenarios, the presentation
// presets, the RichContentV1 block vocabulary, the coding languages). The model may only SELECT from it (strict enums in every provider
// schema); every normalizer re-checks membership; the catalog itself is verified against the registries by tests. Nothing here invents a
// type, a version, a plugin, a check kind, a preset, a block kind or a language — and "latest" never exists.
import { questionTypeDefinition, supportsQuestionTypeVersion, authoringQuestionTypeVersion } from "../questionTypeCatalog";
import { resolveSmartSimPlugin } from "../trustedSimRegistry";
import { PRESENTATION_PRESETS } from "../presentation/presentationModel";
import { RICH_BLOCK_TYPES, RICH_CODE_LANGUAGES, RICH_CALLOUT_VARIANTS } from "../richContent/richContentModel";
import { MATH_LANGUAGE_VERSION, MATH_ENVIRONMENTS, MATH_COMMANDS, MATH_GRID_LIMITS, MATH_LIMITS, parseMath } from "../richContent/richMath";
import { MATH_FEATURES } from "../richContent/mathFeatures";
import { CODING_LANGUAGES } from "../codingLanguages";
import { NET2_TEMPLATES } from "../networkTopology2/net2Templates";
import { FREE_FALL_LIMITS } from "../physicsFreeFallModel";
import { FUNCTION_STUDY_TASKS, FUNCTION_STUDY_LIMITS } from "../functionStudyModel";
import "../trustedSimPlugins";

// V2 (Phase 21A): the catalog gained the Scientific Math v2 capability (scientificMath + its prompt contract). Exams composed under V1 keep
// their recorded provenance; nothing validates or migrates it.
export const COMPOSER_CATALOG_VERSION = "AI_COMPOSER_CATALOG_V2";

/** The single-question families the composer generates through the 19A per-question normalizer (unchanged). */
export const COMPOSER_DRAFT_TYPES = Object.freeze(["multipleChoice", "trueFalse", "shortAnswer", "fillBlank", "inlineCloze", "parametricNumeric", "openResponse", "tableFill", "coding", "networkCli"] as const);
export type ComposerDraftType = (typeof COMPOSER_DRAFT_TYPES)[number];
/** Every item kind a plan / draft may name: a 19A family, a trusted SmartSim question, or a composite@1 question. */
export const COMPOSER_ITEM_KINDS = Object.freeze([...COMPOSER_DRAFT_TYPES, "smartSim", "composite"] as const);
export type ComposerItemKind = (typeof COMPOSER_ITEM_KINDS)[number];

/** The exact question identity each item kind is stored as (authoring version, never "latest"). */
export function composerItemIdentity(kind: ComposerItemKind): { key: string; version: number } {
  return { key: kind, version: authoringQuestionTypeVersion(kind) };
}

// ── SmartSim: the registered plugins the composer may use, by EXACT identity, and their code-owned curriculum scenarios ─────────────────
export const COMPOSER_SIM_PLUGINS = Object.freeze([
  { pluginKey: "networkTopology", pluginVersion: 2, subject: "networking" },
  { pluginKey: "physicsFreeFall", pluginVersion: 1, subject: "physics" },
  { pluginKey: "functionStudy2d", pluginVersion: 1, subject: "mathematics" }
] as const);
export type ComposerSimPluginKey = (typeof COMPOSER_SIM_PLUGINS)[number]["pluginKey"];
export const COMPOSER_SIM_PLUGIN_KEYS = Object.freeze(COMPOSER_SIM_PLUGINS.map(p => p.pluginKey)) as readonly ComposerSimPluginKey[];
export const composerSimVersion = (key: string): number | undefined => COMPOSER_SIM_PLUGINS.find(p => p.pluginKey === key)?.pluginVersion;

/** networkTopology@2 curriculum scenarios = the production templates (config + private checks are CODE-owned; the AI picks an id). */
const NET_TOPICS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  roas: ["VLAN", "Trunk", "Router-on-a-Stick", "IPv4"], dhcp: ["DHCP", "IPv4"], vtp: ["VTP", "VLAN", "Trunk"], portsec: ["Port Security"],
  wireless: ["Wireless", "WPA2", "DHCP"], capstone: ["VLAN", "Trunk", "Native VLAN", "VTP", "Router-on-a-Stick", "DHCP", "Port Security", "Wireless", "DNS", "HTTP"]
});
export const COMPOSER_NET_SCENARIOS = Object.freeze(NET2_TEMPLATES.map(t => t.id));
export function composerNetScenario(id: string) {
  const t = NET2_TEMPLATES.find(x => x.id === id);
  if (!t) return undefined;
  return { id: t.id, title: t.title, description: t.description, topics: NET_TOPICS[t.id] ?? [], checks: t.checks().map(c => ({ id: c.id, label: c.label, kind: c.kind })) };
}

/** physicsFreeFall@1: the measurement / point task vocabulary the composer turns into PRIVATE checks with code-computed expected values. */
export const COMPOSER_PHYSICS_MEASUREMENTS = Object.freeze(["impactTime", "impactSpeed", "maxHeight", "apexTime", "heightAtTime", "velocityAtTime"] as const);
export const COMPOSER_PHYSICS_POINTS = Object.freeze(["impactPoint", "apexPoint", "trajectoryPoint"] as const);
export const COMPOSER_PHYSICS_BOUNDS = Object.freeze({ heightMax: FREE_FALL_LIMITS.heightMax, velocityAbsMax: FREE_FALL_LIMITS.velocityAbsMax, gravityMin: FREE_FALL_LIMITS.gravityMin, gravityMax: FREE_FALL_LIMITS.gravityMax, maxTimeMax: FREE_FALL_LIMITS.maxTimeMax });
/** functionStudy2d@1: safe expression language 2 only (the shared parametric engine), the 7 task groups, the window bounds. */
export const COMPOSER_FUNCTION_TASKS = FUNCTION_STUDY_TASKS;
export const COMPOSER_FUNCTION_BOUNDS = Object.freeze({ xAbsMax: FUNCTION_STUDY_LIMITS.xAbsMax, yAbsMax: FUNCTION_STUDY_LIMITS.yAbsMax, sampleMin: FUNCTION_STUDY_LIMITS.sampleMin, sampleMax: FUNCTION_STUDY_LIMITS.sampleMax, sourceChars: FUNCTION_STUDY_LIMITS.sourceChars });

// ── capabilities the platform does NOT have: detected in the teacher's request and in the AI's own declaration, never fabricated ─────────
export const COMPOSER_UNSUPPORTED = Object.freeze([
  { id: "ospf", label: "OSPF", pattern: /\bospf\b/i }, { id: "rip", label: "RIP", pattern: /\bripv?2?\b/i }, { id: "eigrp", label: "EIGRP", pattern: /\beigrp\b/i },
  { id: "bgp", label: "BGP", pattern: /\bbgp\b/i }, { id: "staticRouting", label: "Static Routing", pattern: /static\s*rout|ip\s+route\b|التوجيه\s*الثابت/i },
  { id: "acl", label: "ACL", pattern: /\bacls?\b|access-list|قوائم\s*التحكم\s*بالوصول/i }, { id: "nat", label: "NAT / PAT", pattern: /\bnat\b|\bpat\b/i },
  { id: "stp", label: "Spanning Tree", pattern: /spanning[-\s]?tree|\bstp\b/i }, { id: "etherchannel", label: "EtherChannel", pattern: /etherchannel|port[-\s]?channel/i },
  { id: "ipv6", label: "IPv6", pattern: /ipv6/i }, { id: "vpn", label: "VPN", pattern: /\bvpn\b|ipsec/i }, { id: "metro", label: "Metro Ethernet", pattern: /metro\s*ethernet/i }
] as const);
export type UnsupportedCapability = { id: string; label: string };
/** Advisory detection (teacher text) — feeds the prompt and the structured warning; generation never depends on it alone. */
export function detectUnsupportedCapabilities(text: string): UnsupportedCapability[] {
  const t = String(text || "");
  return COMPOSER_UNSUPPORTED.filter(u => u.pattern.test(t)).map(u => ({ id: u.id, label: u.label }));
}
export const isUnsupportedCapabilityId = (id: unknown): boolean => typeof id === "string" && COMPOSER_UNSUPPORTED.some(u => u.id === id);

// ── presentation, rich content, coding: the 20D.1 / 19F vocabularies, exactly ─────────────────────────────────────────────────────────
export const COMPOSER_PRESETS = Object.freeze(Object.keys(PRESENTATION_PRESETS)) as readonly (keyof typeof PRESENTATION_PRESETS)[];
/** The rich blocks the AI may emit (images / figures / columns are never AI-authored: no URL, no data URL, no layout nesting). */
export const COMPOSER_RICH_BLOCKS = Object.freeze(["heading", "paragraph", "unorderedList", "orderedList", "table", "code", "cli", "quote", "callout", "divider", "keyValueGrid", "math"] as const);
export type ComposerRichBlockType = (typeof COMPOSER_RICH_BLOCKS)[number];
export const COMPOSER_RICH_CODE_LANGUAGES = RICH_CODE_LANGUAGES;
export const COMPOSER_CALLOUT_VARIANTS = RICH_CALLOUT_VARIANTS;
export const COMPOSER_TABLE_VARIANTS = Object.freeze(["bordered", "striped", "minimal"] as const);
export const COMPOSER_CODING_LANGUAGES = Object.freeze(CODING_LANGUAGES.map(l => l.key));
/** Phase 21A — the Scientific Math v2 capability, DERIVED from the ONE parser (richMath.ts) and its proven feature catalog (mathFeatures.ts):
 *  the AI may write a `math` block whose source uses ONLY these commands / environments within these bounds; the canonical validator
 *  (validateRichContent → parseMath) decides, and a refused formula makes the section invalid (bounded repair, never a raw fallback). */
export const COMPOSER_SCIENTIFIC_MATH = Object.freeze({
  version: MATH_LANGUAGE_VERSION,
  environments: MATH_ENVIRONMENTS,
  commands: MATH_COMMANDS,
  features: MATH_FEATURES,
  limits: Object.freeze({ chars: MATH_LIMITS.chars, nodes: MATH_LIMITS.nodes, depth: MATH_LIMITS.depth, rows: MATH_GRID_LIMITS.rows, cols: MATH_GRID_LIMITS.cols, cells: MATH_GRID_LIMITS.cells, casesCols: MATH_GRID_LIMITS.casesCols, alignedCols: MATH_GRID_LIMITS.alignedCols })
});

export type ComposerCatalog = {
  version: string;
  questionTypes: { kind: ComposerItemKind; key: string; version: number; label: string; autoGraded: boolean; compositeChild: boolean; note: string }[];
  smartSim: { pluginKey: string; pluginVersion: number; subject: string }[];
  networkScenarios: { id: string; title: string; topics: readonly string[]; checks: { id: string; label: string }[] }[];
  physics: { measurements: readonly string[]; points: readonly string[]; bounds: typeof COMPOSER_PHYSICS_BOUNDS };
  functionStudy: { language: 2; tasks: readonly string[]; bounds: typeof COMPOSER_FUNCTION_BOUNDS };
  presets: readonly string[];
  richBlocks: readonly string[];
  codingLanguages: readonly string[];
  scientificMath: typeof COMPOSER_SCIENTIFIC_MATH;
  unsupported: UnsupportedCapability[];
};

const NOTES: Readonly<Partial<Record<ComposerItemKind, string>>> = Object.freeze({
  coding: "public material only (statement, language, starter code, public examples); hidden tests are never AI-authored — graded manually until the teacher adds verified hidden tests",
  networkCli: "networkCli@1 managed SWITCH only (VLANs, access / trunk ports, native VLAN, SVI address); no routing",
  smartSim: "trusted simulator: networkTopology@2 curriculum scenario, physicsFreeFall@1 bounded model, or functionStudy2d@1 safe expression",
  composite: "one question with shared context (one SmartSim or one source) and groups of child parts; never nested",
  parametricNumeric: "safe expression language only; {{var}} placeholders in the stem",
  openResponse: "rubric with 1-12 criteria, 2-8 levels, a 0-point and a full-points level per criterion; manual grading"
});

/** The catalog, derived from the live registries (throws only if a production registry disagrees — a programming error, caught by tests). */
export function buildComposerCatalog(): ComposerCatalog {
  const questionTypes = COMPOSER_ITEM_KINDS.map(kind => {
    const id = composerItemIdentity(kind);
    const def = questionTypeDefinition(id.key);
    if (!def || !supportsQuestionTypeVersion(id.key, id.version)) throw new Error("composer catalog: unsupported production type " + id.key + "@" + id.version);
    return { kind, key: id.key, version: id.version, label: def.label, autoGraded: def.gradingMode === "auto" && kind !== "coding", compositeChild: kind !== "composite", note: NOTES[kind] ?? "" };
  });
  const smartSim = COMPOSER_SIM_PLUGINS.map(p => {
    if (!resolveSmartSimPlugin(p.pluginKey, p.pluginVersion)) throw new Error("composer catalog: SmartSim plugin not registered " + p.pluginKey + "@" + p.pluginVersion);
    return { pluginKey: p.pluginKey, pluginVersion: p.pluginVersion, subject: p.subject };
  });
  for (const b of COMPOSER_RICH_BLOCKS) if (!(RICH_BLOCK_TYPES as readonly string[]).includes(b)) throw new Error("composer catalog: rich block not in 20D.1 vocabulary " + b);
  for (const f of COMPOSER_SCIENTIFIC_MATH.features) if (!parseMath(f.example).ok) throw new Error("composer catalog: math feature example refused by the parser " + f.id);
  return {
    version: COMPOSER_CATALOG_VERSION,
    questionTypes,
    smartSim,
    networkScenarios: COMPOSER_NET_SCENARIOS.map(id => { const s = composerNetScenario(id)!; return { id: s.id, title: s.title, topics: s.topics, checks: s.checks.map(c => ({ id: c.id, label: c.label })) }; }),
    physics: { measurements: COMPOSER_PHYSICS_MEASUREMENTS, points: COMPOSER_PHYSICS_POINTS, bounds: COMPOSER_PHYSICS_BOUNDS },
    functionStudy: { language: 2, tasks: COMPOSER_FUNCTION_TASKS, bounds: COMPOSER_FUNCTION_BOUNDS },
    presets: COMPOSER_PRESETS,
    richBlocks: COMPOSER_RICH_BLOCKS,
    codingLanguages: COMPOSER_CODING_LANGUAGES,
    scientificMath: COMPOSER_SCIENTIFIC_MATH,
    unsupported: COMPOSER_UNSUPPORTED.map(u => ({ id: u.id, label: u.label }))
  };
}

/** A compact, model-facing text of the catalog (the provider sees exactly this vocabulary; enums enforce it). */
export function catalogForPrompt(catalog: ComposerCatalog = buildComposerCatalog()): string {
  const lines = [
    "CAPABILITY CATALOG " + catalog.version + " (select ONLY from this list; exact versions; never invent a type, plugin, scenario, preset, block or language):",
    "Item kinds: " + catalog.questionTypes.map(t => t.kind + " (" + t.key + "@" + t.version + (t.autoGraded ? ", auto" : ", manual/hybrid") + (t.note ? "; " + t.note : "") + ")").join(" | "),
    "SmartSim plugins: " + catalog.smartSim.map(p => p.pluginKey + "@" + p.pluginVersion + " (" + p.subject + ")").join(", "),
    "networkTopology@2 scenarios: " + catalog.networkScenarios.map(s => s.id + " = " + s.title + " [" + s.topics.join(", ") + "] checks: " + s.checks.map(c => c.id + " " + c.label).join("; ")).join(" || "),
    "physicsFreeFall@1: model initialHeight 0.." + catalog.physics.bounds.heightMax + " m, initialVelocity ±" + catalog.physics.bounds.velocityAbsMax + " m/s (up positive), gravity " + catalog.physics.bounds.gravityMin + ".." + catalog.physics.bounds.gravityMax + " m/s²; measurements: " + catalog.physics.measurements.join(", ") + "; points: " + catalog.physics.points.join(", ") + ". Expected values are computed by code, never by you.",
    "functionStudy2d@1: expression language 2 in the single variable x (numbers, + - * / % ^, parentheses, abs, round, floor, ceil, min, max, sqrt, pow, log (natural), log10, exp; nothing else); tasks: " + catalog.functionStudy.tasks.join(", ") + "; |x| <= " + catalog.functionStudy.bounds.xAbsMax + ". Your expected answers are checked numerically against the expression.",
    "Presentation presets: " + catalog.presets.join(", "),
    "Rich blocks: " + catalog.richBlocks.join(", ") + " (no images, no HTML, no CSS, no URLs).",
    "Coding languages: " + catalog.codingLanguages.join(", "),
    scientificMathForPrompt(catalog.scientificMath),
    "NOT supported (never simulate; propose a theory question or omit and report it): " + catalog.unsupported.map(u => u.label).join(", ")
  ];
  return lines.join("\n");
}
/** The bounded math contract line (21A): the exact command and environment vocabulary, the bounds, and the proven examples. */
function scientificMathForPrompt(m: ComposerCatalog["scientificMath"]): string {
  const L = m.limits;
  return "Math blocks (scientific notation language v" + m.version + "): type math, the formula in source WITHOUT $ delimiters; commands ONLY \\" + m.commands.join(" \\") +
    "; environments ONLY " + m.environments.join(", ") + " as \\begin{name}…\\end{name} (cells separated by &, rows by \\\\, never nested, at most " + L.rows + " rows, " + L.cols + " columns, " + L.cells + " cells; cases and aligned at most " + L.casesCols + " columns; & and \\\\ only inside an environment)" +
    "; \\mathbb only N Z Q R C; words in \\text{…} (Arabic allowed); units and chemical symbols in \\mathrm{…}; at most " + L.chars + " characters, " + L.nodes + " nodes, nesting depth " + L.depth +
    ". Examples: " + m.features.map(f => f.example).join(" ; ") + ". Anything else (\\href, \\url, \\def, \\newcommand, \\color, \\begin{array}, HTML, CSS, scripts, macros) is refused and the section is regenerated.";
}
