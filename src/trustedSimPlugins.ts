// Phase 20A — the PRODUCTION set of trusted SmartSim plugins (pure; compiled into the shared server build). The ONE place the repository
// registers plugin CODE: every consumer of the smartSim@1 authority (finalization validator, student renderer, teacher editor, server
// ingest, grader, sanitizer, review) imports THIS module, so the client and the server always know exactly the same identities.
// Exam data can only name one of these identities; it can never add one. A future plugin (chemistryBalance@1, functionGraph@1,
// geometryWorkspace@1, physicsMotion@1 …) is added here as one more registration — nothing else in the platform changes.
import { listSmartSimPlugins, listSmartSimPluginDescriptors, registerSmartSimPlugin, resolveSmartSimDescriptor, resolveSmartSimPlugin } from "./trustedSimRegistry";
import { networkTopologyPluginV1 } from "./networkTopologyPlugin";
import { physicsFreeFallPluginV1 } from "./physicsFreeFallPlugin";
import { functionStudy2dPluginV1 } from "./functionStudyPlugin";
import { networkTopologyPluginV2 } from "./net2Plugin";

registerSmartSimPlugin(networkTopologyPluginV1);
// Phase 20A.2 — the two enterprise pilots: physics (free fall) and mathematics (rational function study).
registerSmartSimPlugin(physicsFreeFallPluginV1);
registerSmartSimPlugin(functionStudy2dPluginV1);
// Phase 20C — the curriculum network simulator: a NEW exact identity (networkTopology@2). networkTopology@1 above stays frozen.
registerSmartSimPlugin(networkTopologyPluginV2);

export { listSmartSimPlugins, listSmartSimPluginDescriptors, resolveSmartSimDescriptor, resolveSmartSimPlugin };
export * from "./trustedSimQuestion";
