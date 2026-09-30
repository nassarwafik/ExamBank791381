// Phase 16B-A — the ONLY way the client builds a simulator asset URL: from a VALIDATED exact package reference, on the same
// origin, through the content-addressed runtime route. Nothing from exam JSON is ever placed into an iframe `src` verbatim.
import { validateSimulationReference, isSafePackagePath, type SimulationQuestionConfig } from "../smartsimManifest";

export const SMARTSIM_RUNTIME_ROUTE = "/api/simulators/runtime/";

/** `/api/simulators/runtime/<packageId>/<version>/<sha256 hex>/<assetPath>` — throws on any invalid input. */
export function runtimeAssetUrl(reference: SimulationQuestionConfig, assetPath: string): string {
  const issues = validateSimulationReference(reference);
  if (issues.length) throw new Error("invalid simulation reference: " + issues.map(i => i.code).join(","));
  if (!isSafePackagePath(assetPath) || assetPath.endsWith("/")) throw new Error("unsafe simulation asset path");
  return SMARTSIM_RUNTIME_ROUTE + reference.packageId + "/" + reference.packageVersion + "/" + reference.packageHash.slice(7) + "/" + assetPath;
}
/** The entry document URL (manifest entry relative to dist/, default index.html). */
export const runtimeEntryUrl = (reference: SimulationQuestionConfig): string => runtimeAssetUrl(reference, reference.entry || "index.html");
