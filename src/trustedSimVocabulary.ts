// Phase 20A.1 — the VERSIONED, bounded vocabulary of the universal SmartSim contract (pure; compiled into the shared server build).
//
// These are METADATA names a code-owned plugin descriptor uses to declare what the repository's plugin can do (capabilities, tools,
// renderer families, scene kinds, …) and the small structural vocabularies of the universal scene (primitives, relation kinds) and of
// trusted assets (asset kinds). A name never implements behaviour: persisted exam JSON can only REFERENCE a name a plugin declared in
// code, never invent one that "switches on" code. Policy: names are namespaced and lowercase-dotted ("scene.3d", "camera.rotate");
// additions are ADDITIVE (a new name is a new capability; an existing name never changes meaning); a removal or a change of meaning
// is a new SMART_SIM_VOCABULARY_VERSION.
export const SMART_SIM_VOCABULARY_VERSION = 1;

/** Capabilities a plugin may DECLARE (what its repository code supports). */
export const SMART_SIM_CAPABILITIES: readonly string[] = Object.freeze([
  "scene.2d", "scene.3d",
  "camera.pan", "camera.zoom", "camera.rotate",
  "object.select", "object.drag", "object.label",
  "point.place", "line.draw", "region.select",
  "graph.2d", "graph.3d",
  "network.cli", "network.links", "network.hostConfig", "network.ping",
  "simulation.play", "simulation.pause", "simulation.scrub",
  "measure.distance", "measure.angle", "measure.elevation",
  "value.set", "sequence.order",
  "asset.image", "asset.mesh3d", "asset.texture", "asset.dataset", "asset.map", "asset.terrain", "asset.molecule", "asset.anatomy"
]);
/** Authoring domains (metadata for teachers and the future AI composer; zero grading authority). */
export const SMART_SIM_DOMAINS: readonly string[] = Object.freeze(["networking", "mathematics", "physics", "chemistry", "biology", "geography", "general"]);
/** Renderer FAMILIES (metadata). The code-owned UI registry alone maps a plugin identity to a component via a literal import. */
export const SMART_SIM_RENDERER_FAMILIES: readonly string[] = Object.freeze(["custom", "svg2d", "canvas2d", "graph2d", "webgl3d", "map2d", "table", "terminal", "form"]);
/** Scene spaces a plugin presents. */
export const SMART_SIM_SCENE_KINDS: readonly string[] = Object.freeze(["2d", "3d"]);
/** Interaction tools a plugin's UI exposes (metadata for authoring, the AI composer and accessibility descriptions). */
export const SMART_SIM_TOOLS: readonly string[] = Object.freeze([
  "select", "drag", "placePoint", "drawLine", "measureDistance", "measureAngle", "measureElevation",
  "rotateView", "zoomView", "panView", "play", "pause", "scrub", "connect", "terminal", "form", "probe", "label"
]);
/** Accessibility features a production visual plugin provides (a semantic, keyboard-reachable path besides pointing). */
export const SMART_SIM_ACCESSIBILITY_FEATURES: readonly string[] = Object.freeze(["keyboardAlternative", "semanticLabels", "objectList", "toolLabels", "textTranscript"]);
/** The small, presentation / interaction primitive vocabulary of the universal scene (never domain science). */
export const SMART_SIM_PRIMITIVES: readonly string[] = Object.freeze(["point", "line", "segment", "vector", "curve", "surface", "region", "node", "edge", "label", "image", "mesh", "body", "marker", "group"]);
/** Data-only scene relations (the plugin decides what they mean). */
export const SMART_SIM_RELATION_KINDS: readonly string[] = Object.freeze(["connectedTo", "contains", "parentOf", "labelFor"]);
/** Trusted asset kinds (never markup or code: no svg / html / script / shader / wasm). */
export const SMART_SIM_ASSET_KINDS: readonly string[] = Object.freeze(["image", "mesh3d", "texture", "dataset", "map", "terrain", "molecule", "anatomy"]);

const has = (list: readonly string[]) => { const set = new Set(list); return (v: unknown): v is string => typeof v === "string" && set.has(v); };
export const isSmartSimCapability = has(SMART_SIM_CAPABILITIES);
export const isSmartSimDomain = has(SMART_SIM_DOMAINS);
export const isSmartSimRendererFamily = has(SMART_SIM_RENDERER_FAMILIES);
export const isSmartSimSceneKind = has(SMART_SIM_SCENE_KINDS);
export const isSmartSimTool = has(SMART_SIM_TOOLS);
export const isSmartSimAccessibilityFeature = has(SMART_SIM_ACCESSIBILITY_FEATURES);
export const isSmartSimPrimitive = has(SMART_SIM_PRIMITIVES);
export const isSmartSimRelationKind = has(SMART_SIM_RELATION_KINDS);
export const isSmartSimAssetKind = has(SMART_SIM_ASSET_KINDS);

/** Action-type prefixes that are presentation / gesture (camera, view, pointer, wheel, hover, UI, render), never academic intent. */
export const SMART_SIM_PRESENTATION_ACTION_PREFIXES: readonly string[] = Object.freeze(["camera.", "view.", "pointer.", "mouse.", "wheel.", "hover.", "ui.", "render.", "touch.", "key."]);
export const isPresentationActionType = (t: unknown): boolean => typeof t === "string" && SMART_SIM_PRESENTATION_ACTION_PREFIXES.some(p => t.startsWith(p));
/** Semantic action-type names: one to four lowercase-initial segments ("object.select", "router.command", a plugin's own "setCoefficient"). */
export const SMART_SIM_ACTION_TYPE_PATTERN = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*){0,3}$/;

/** Prototype-sensitive names are never identities anywhere in the universal contract. */
const FORBIDDEN_NAMES: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);
export const isForbiddenName = (v: string): boolean => FORBIDDEN_NAMES.has(v);
/** Semantic identities (scene objects, relations, points, values): stable, bounded, never a path, a URL or a prototype name. */
export const SEMANTIC_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
export const isSemanticId = (v: unknown): v is string => typeof v === "string" && SEMANTIC_ID_PATTERN.test(v) && !FORBIDDEN_NAMES.has(v);
/** True when a string carries a control character (never allowed in labels). */
export function hasControlCharacter(s: string): boolean {
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c < 0x20 || c === 0x7f) return true; }
  return false;
}
/** A plain JSON object (not an array, not a class instance, not null). */
export const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
