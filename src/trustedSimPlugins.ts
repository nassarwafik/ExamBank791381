// Phase 20A — the PRODUCTION set of trusted SmartSim plugins (pure; compiled into the shared server build). The ONE place the repository
// registers plugin CODE: every consumer of the smartSim@1 authority (finalization validator, student renderer, teacher editor, server
// ingest, grader, sanitizer, review) imports THIS module, so the client and the server always know exactly the same identities.
// Exam data can only name one of these identities; it can never add one. A future plugin (chemistryBalance@1, functionGraph@1,
// geometryWorkspace@1, physicsMotion@1 …) is added here as one more registration — nothing else in the platform changes.
import { listSmartSimPlugins, registerSmartSimPlugin, resolveSmartSimPlugin } from "./trustedSimRegistry";
import { networkTopologyPluginV1 } from "./networkTopologyPlugin";

registerSmartSimPlugin(networkTopologyPluginV1);

export { listSmartSimPlugins, resolveSmartSimPlugin };
export * from "./trustedSimQuestion";
