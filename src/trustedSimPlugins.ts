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
import { physicsMotionPluginV1 } from "./physicsMotionPlugin";
import { physicsLabPluginV1 } from "./physicsLabPlugin";
import { chemistryStructurePluginV1 } from "./chemistryStructurePlugin";
import { chemistryReactionsPluginV1 } from "./chemistryReactionsPlugin";
import { chemistryLabPluginV1 } from "./chemistryLabPlugin";

registerSmartSimPlugin(networkTopologyPluginV1);
// Phase 20A.2 — the two enterprise pilots: physics (free fall) and mathematics (rational function study).
registerSmartSimPlugin(physicsFreeFallPluginV1);
registerSmartSimPlugin(functionStudy2dPluginV1);
// Phase 20C — the curriculum network simulator: a NEW exact identity (networkTopology@2). networkTopology@1 above stays frozen.
registerSmartSimPlugin(networkTopologyPluginV2);
// Phase 21D-A.1 — the motion experiments (free fall with student exploration, projectile, Newton's second law, inclined plane) on the
// shared physics core: a NEW exact identity (physicsMotion@1). physicsFreeFall@1 above stays frozen.
registerSmartSimPlugin(physicsMotionPluginV1);
// Phase 21D-A.2 — physicsLab@1: pendulum, spring (Hooke), mechanical energy and DC circuits (a NEW exact identity; the existing plugins unchanged).
registerSmartSimPlugin(physicsLabPluginV1);
// Phase 21D-D.1 — chemistryStructure@1: atoms and simple ions, electron shells, the periodic table, formulas / composition and catalog
// molecules in 3D, on the trusted chemistry core (a NEW exact identity; the existing plugins unchanged).
registerSmartSimPlugin(chemistryStructurePluginV1);
// Phase 21D-D.2 — chemistryReactions@1: balancing equations by exact atom and charge conservation, the curated reaction catalog, reaction
// families and substance roles (a NEW exact identity; chemistryStructure@1 and every other plugin unchanged).
registerSmartSimPlugin(chemistryReactionsPluginV1);
// Phase 21D-D.3 — chemistryLab@1: the virtual chemistry laboratory (solutions and dilution, pH and indicators, strong acid / strong base
// titration, reaction rate) on exact, cited models (a NEW exact identity; every other plugin unchanged).
registerSmartSimPlugin(chemistryLabPluginV1);

export { listSmartSimPlugins, listSmartSimPluginDescriptors, resolveSmartSimDescriptor, resolveSmartSimPlugin };
export * from "./trustedSimQuestion";
