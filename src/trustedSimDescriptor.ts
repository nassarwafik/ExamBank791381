// Phase 20A.1 — the code-owned PLUGIN DESCRIPTOR (pure; compiled into the shared server build).
//
// Every trusted SmartSim plugin ships, next to its code, an immutable, exactly versioned METADATA descriptor: its domain, the scene kinds,
// renderer families, capabilities, semantic action kinds, check kinds, opt-in generic rules, trusted asset kinds, tools, accessibility
// features and supported behaviours. The descriptor is DATA ONLY (strings, booleans, one integer version), validated strictly against the
// versioned vocabulary, deep-frozen and checked against the plugin's own code at registration (identity, label and check kinds must agree).
// It is never read from exam JSON, never chooses an import path, and never enables behaviour by itself: it lets the platform, teacher
// authoring, diagnostics and a future AI composer understand what each repository plugin supports.
import {
  isPlainObject, isForbiddenName, isSmartSimCapability, isSmartSimDomain, isSmartSimRendererFamily, isSmartSimSceneKind, isSmartSimTool,
  isSmartSimAccessibilityFeature, isSmartSimAssetKind, hasControlCharacter, isPresentationActionType, SMART_SIM_ACTION_TYPE_PATTERN
} from "./trustedSimVocabulary";
import { resolveSmartSimRule } from "./trustedSimRules";

export const SMART_SIM_DESCRIPTOR_VERSION = 1;
export const SMART_SIM_DESCRIPTOR_LIMITS = Object.freeze({ listItems: 64, labelChars: 120, nameChars: 48 });
export type SmartSimSupports = { autosave: boolean; restore: boolean; reset: boolean; partialCredit: boolean; offline: boolean; twoDimensional: boolean; threeDimensional: boolean };
export type SmartSimPluginDescriptorV1 = {
  descriptorVersion: 1;
  key: string;
  version: number;
  label: string;
  domain: string;
  sceneKinds: string[];
  rendererFamilies: string[];
  capabilities: string[];
  actionKinds: string[];
  checkKinds: string[];
  genericRules: string[];
  assetKinds: string[];
  tools: string[];
  accessibility: string[];
  supports: SmartSimSupports;
};
export type SmartSimDescriptorIssue = { code: string; message: string; path?: string };

const KEYS = ["descriptorVersion", "key", "version", "label", "domain", "sceneKinds", "rendererFamilies", "capabilities", "actionKinds", "checkKinds", "genericRules", "assetKinds", "tools", "accessibility", "supports"] as const;
const SUPPORTS = ["autosave", "restore", "reset", "partialCredit", "offline", "twoDimensional", "threeDimensional"] as const;
const PLUGIN_KEY = /^[a-z][A-Za-z0-9]{1,47}$/;
const CHECK_KIND = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*){0,3}$/;
const L = SMART_SIM_DESCRIPTOR_LIMITS;

/** Strictly validates a descriptor and returns a deep-frozen canonical copy (lists keep their declared order). */
export function validateSmartSimDescriptor(raw: unknown): { ok: true; descriptor: Readonly<SmartSimPluginDescriptorV1> } | { ok: false; issues: SmartSimDescriptorIssue[] } {
  const issues: SmartSimDescriptorIssue[] = [];
  const err = (code: string, message: string, path?: string) => { issues.push(path ? { code, message, path } : { code, message }); };
  if (!isPlainObject(raw)) return { ok: false, issues: [{ code: "SMARTSIM_DESCRIPTOR_INVALID", message: "descriptor must be a plain object" }] };
  for (const k of Object.keys(raw)) if (!(KEYS as readonly string[]).includes(k)) err("SMARTSIM_DESCRIPTOR_UNKNOWN_KEY", "unknown descriptor key: " + k, k);
  for (const k of KEYS) if (!Object.prototype.hasOwnProperty.call(raw, k)) err("SMARTSIM_DESCRIPTOR_INVALID", "missing descriptor key: " + k, k);
  if (raw.descriptorVersion !== SMART_SIM_DESCRIPTOR_VERSION) err("SMARTSIM_DESCRIPTOR_VERSION_UNSUPPORTED", "descriptorVersion must be 1", "descriptorVersion");
  if (typeof raw.key !== "string" || !PLUGIN_KEY.test(raw.key) || isForbiddenName(raw.key) || typeof raw.version !== "number" || !Number.isInteger(raw.version) || raw.version < 1)
    err("SMARTSIM_DESCRIPTOR_IDENTITY_INVALID", "invalid descriptor identity", "key");
  if (typeof raw.label !== "string" || !raw.label.trim() || raw.label.length > L.labelChars || hasControlCharacter(raw.label)) err("SMARTSIM_DESCRIPTOR_LABEL_INVALID", "label must be a short text", "label");
  if (!isSmartSimDomain(raw.domain)) err("SMARTSIM_DESCRIPTOR_DOMAIN_UNKNOWN", "unknown domain: " + String(raw.domain), "domain");

  /** A bounded, duplicate-free list whose items pass `ok` (else `unknownCode`). */
  const list = (k: string, ok: (v: unknown) => boolean, unknownCode: string, min = 0): string[] => {
    const v = raw[k];
    if (!Array.isArray(v)) { err(unknownCode, k + " must be a list", k); return []; }
    if (v.length > L.listItems) err("SMARTSIM_DESCRIPTOR_TOO_MANY", k + " has more than " + L.listItems + " items", k);
    if (v.length < min) err(k === "actionKinds" ? "SMARTSIM_DESCRIPTOR_ACTIONS_EMPTY" : k === "checkKinds" ? "SMARTSIM_DESCRIPTOR_CHECKS_EMPTY" : unknownCode, k + " must not be empty", k);
    const out: string[] = [], seen = new Set<string>();
    for (const item of v) {
      if (!ok(item)) { err(unknownCode, "invalid " + k + " entry: " + (typeof item === "string" ? item : typeof item), k); continue; }
      if (seen.has(item as string)) { err("SMARTSIM_DESCRIPTOR_DUPLICATE", "duplicate " + k + " entry: " + String(item), k); continue; }
      seen.add(item as string); out.push(item as string);
    }
    return out;
  };
  const sceneKinds = list("sceneKinds", isSmartSimSceneKind, "SMARTSIM_DESCRIPTOR_SCENE_KIND_UNKNOWN", 1);
  const rendererFamilies = list("rendererFamilies", isSmartSimRendererFamily, "SMARTSIM_DESCRIPTOR_RENDERER_UNKNOWN", 1);
  const capabilities = list("capabilities", isSmartSimCapability, "SMARTSIM_DESCRIPTOR_CAPABILITY_UNKNOWN");
  const actionKinds = list("actionKinds", v => typeof v === "string" && v.length <= L.nameChars && SMART_SIM_ACTION_TYPE_PATTERN.test(v), "SMARTSIM_DESCRIPTOR_ACTION_KIND_INVALID", 1);
  for (const a of actionKinds) if (isPresentationActionType(a)) err("SMARTSIM_DESCRIPTOR_ACTION_PRESENTATION_ONLY", "a presentation gesture is never an academic action: " + a, "actionKinds");
  const checkKinds = list("checkKinds", v => typeof v === "string" && v.length <= L.nameChars && CHECK_KIND.test(v) && !isForbiddenName(v), "SMARTSIM_DESCRIPTOR_CHECK_KIND_INVALID", 1);
  const genericRules = list("genericRules", v => resolveSmartSimRule(v) !== undefined, "SMARTSIM_DESCRIPTOR_RULE_UNKNOWN");
  for (const r of genericRules) if (Array.isArray(raw.checkKinds) && raw.checkKinds.includes(r)) err("SMARTSIM_DESCRIPTOR_DUPLICATE", "a generic rule cannot also be a plugin check kind: " + r, "genericRules");
  const assetKinds = list("assetKinds", isSmartSimAssetKind, "SMARTSIM_DESCRIPTOR_ASSET_KIND_UNKNOWN");
  const tools = list("tools", isSmartSimTool, "SMARTSIM_DESCRIPTOR_TOOL_UNKNOWN");
  const accessibility = list("accessibility", isSmartSimAccessibilityFeature, "SMARTSIM_DESCRIPTOR_ACCESSIBILITY_UNKNOWN");

  let supports: SmartSimSupports | undefined;
  const s = raw.supports;
  if (!isPlainObject(s) || Object.keys(s).sort().join(",") !== [...SUPPORTS].sort().join(",") || !SUPPORTS.every(k => typeof s[k] === "boolean")) err("SMARTSIM_DESCRIPTOR_SUPPORTS_INVALID", "supports must hold exactly the seven booleans", "supports");
  else supports = { autosave: s.autosave as boolean, restore: s.restore as boolean, reset: s.reset as boolean, partialCredit: s.partialCredit as boolean, offline: s.offline as boolean, twoDimensional: s.twoDimensional as boolean, threeDimensional: s.threeDimensional as boolean };
  // consistency: scene kinds ⇔ scene capabilities ⇔ supports flags
  if (supports) for (const [kind, flag] of [["2d", "twoDimensional"], ["3d", "threeDimensional"]] as const) {
    const declared = sceneKinds.includes(kind), cap = capabilities.includes("scene." + kind), sup = supports[flag];
    if (declared !== cap || declared !== sup) err("SMARTSIM_DESCRIPTOR_INCONSISTENT", "sceneKinds / capabilities / supports disagree about " + kind, "sceneKinds");
  }
  if (issues.length || !supports) return { ok: false, issues };
  const d: SmartSimPluginDescriptorV1 = {
    descriptorVersion: 1, key: raw.key as string, version: raw.version as number, label: raw.label as string, domain: raw.domain as string,
    sceneKinds, rendererFamilies, capabilities, actionKinds, checkKinds, genericRules, assetKinds, tools, accessibility, supports
  };
  return { ok: true, descriptor: deepFreeze(d) };
}
function deepFreeze<T>(o: T): Readonly<T> {
  if (o && typeof o === "object") { for (const v of Object.values(o)) deepFreeze(v); Object.freeze(o); }
  return o;
}
/** A plain, mutable, data-only copy of a descriptor (what listings and catalogs expose). */
export const descriptorData = (d: Readonly<SmartSimPluginDescriptorV1>): SmartSimPluginDescriptorV1 => JSON.parse(JSON.stringify(d));
