import type { StudentRendererProps } from "../registryTypes";
import SimulationSandboxHost from "../../smartsim/SimulationSandboxHost";
import type { SimulationQuestionConfig } from "../../smartsimManifest";

// Phase 16B-A — simulation@1 student renderer (lazy): renders the ONE sandbox host with the question's exact package
// reference and the student's saved state; every state change becomes { kind: "simulation", state } through the generic
// onAnswer seam (autosave / restore / submit flow untouched). `disabled` (submitted / ended / review) reaches the simulator
// as SMARTSIM_SET_DISABLED. The renderer never sees the student identity or other answers — neither does the simulator.
export default function SimulationResponse({ q, answer, onAnswer, disabled, labelPrefix }: StudentRendererProps) {
  const reference = (q as { simulation?: SimulationQuestionConfig }).simulation;
  const savedState = answer?.kind === "simulation" ? answer.state : undefined;
  return <div className="iex-simulation" aria-label={labelPrefix + " — محاكاة تفاعلية"}>
    <SimulationSandboxHost reference={reference} savedState={savedState} disabled={disabled} mode="student" onStateChange={state => onAnswer({ kind: "simulation", state })} />
  </div>;
}
