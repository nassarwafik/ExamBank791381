// Phase 20A.1 — the SAFE authoring / AI-composer CATALOG of trusted SmartSim plugins (pure; compiled into the shared server build).
//
// A metadata-only projection of the code-owned plugin descriptors, the generic trusted rules and the capability vocabulary: what a teacher
// UI, diagnostics or a future AI composer may CHOOSE from. It contains plain data only — no function, no module path, no component name,
// no grader, no secret and nothing from any question (no private check, weight or answer). A future AI-assisted workflow therefore picks
// an EXISTING plugin and proposes JSON config + private checks that the canonical validators then judge; it never generates runtime code,
// registers a plugin, creates a grader or bypasses validation.
import "./trustedSimPlugins";
import { listSmartSimPluginDescriptors } from "./trustedSimRegistry";
import { listSmartSimRules } from "./trustedSimRules";
import { SMART_SIM_CAPABILITIES, SMART_SIM_VOCABULARY_VERSION } from "./trustedSimVocabulary";
import { SMART_SIM_DESCRIPTOR_VERSION, type SmartSimSupports } from "./trustedSimDescriptor";

export const SMART_SIM_CATALOG_VERSION = 1;
export type SmartSimCatalogPlugin = {
  key: string; version: number; label: string; domain: string; sceneKinds: string[]; rendererFamilies: string[]; capabilities: string[];
  actionKinds: string[]; checkKinds: string[]; genericRules: string[]; assetKinds: string[]; tools: string[]; accessibility: string[]; supports: SmartSimSupports;
};
export type SmartSimAuthoringCatalog = {
  catalogVersion: number; vocabularyVersion: number; descriptorVersion: number;
  plugins: SmartSimCatalogPlugin[];
  genericRules: { id: string; kind: string; version: number; params: string[] }[];
  capabilities: string[];
};
/** Builds the catalog from the registered descriptors: an explicit field-by-field copy (never a spread of a plugin object). */
export function smartSimAuthoringCatalog(): SmartSimAuthoringCatalog {
  const plugins = listSmartSimPluginDescriptors().map(d => ({
    key: d.key, version: d.version, label: d.label, domain: d.domain, sceneKinds: [...d.sceneKinds], rendererFamilies: [...d.rendererFamilies],
    capabilities: [...d.capabilities], actionKinds: [...d.actionKinds], checkKinds: [...d.checkKinds], genericRules: [...d.genericRules],
    assetKinds: [...d.assetKinds], tools: [...d.tools], accessibility: [...d.accessibility], supports: { ...d.supports }
  }));
  return { catalogVersion: SMART_SIM_CATALOG_VERSION, vocabularyVersion: SMART_SIM_VOCABULARY_VERSION, descriptorVersion: SMART_SIM_DESCRIPTOR_VERSION, plugins, genericRules: listSmartSimRules(), capabilities: [...SMART_SIM_CAPABILITIES] };
}
