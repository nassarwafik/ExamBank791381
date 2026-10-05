import { lazy, type ComponentType } from "react";

// Phase 20A — the CODE-OWNED UI registry of trusted SmartSim plugins: (pluginKey, pluginVersion) → the repository's lazy workspace (student
// AND teacher preview), authoring editor and review-details components. Exam data only NAMES an identity; every dynamic import below is a literal
// repository path — never a module, a path or a component name taken from data. An identity with no entry resolves to nothing and the
// hosts render an explicit "unavailable" state (never another plugin, never the latest version).
export type SmartSimWorkspaceProps = {
  /** The plugin's CANONICAL public config (already validated by the strict envelope authority). */
  config: unknown;
  actions: readonly unknown[];
  /** Emits the full next action list and the canonical state derived by replay (restore cache only — the server re-derives it). */
  onChange: (actions: unknown[], state: unknown) => void;
  disabled?: boolean;
  label: string;
  preview?: boolean;
};
export type SmartSimEditorProps = {
  config: unknown;
  checks: readonly unknown[];
  scoring: unknown;
  onChange: (next: { config?: unknown; checks?: unknown[]; scoring?: unknown }) => void;
  disabled?: boolean;
};
export type SmartSimReviewDetailsProps = { config: unknown; state: unknown; details: Record<string, unknown> };
export type SmartSimUi = { Workspace: ComponentType<SmartSimWorkspaceProps>; Editor: ComponentType<SmartSimEditorProps>; ReviewDetails: ComponentType<SmartSimReviewDetailsProps> };

const entries = new Map<string, SmartSimUi>([
  ["networkTopology@1", {
    Workspace: lazy(() => import("../networkTopology/NetworkTopologyWorkspace")),
    Editor: lazy(() => import("../networkTopology/NetworkTopologyEditor")),
    ReviewDetails: lazy(() => import("../networkTopology/NetworkTopologyReview"))
  }]
]);
/** The UI registered for EXACTLY (key, version) — undefined for anything else. */
export function resolveSmartSimUi(key: unknown, version: unknown): SmartSimUi | undefined {
  if (typeof key !== "string" || typeof version !== "number" || !Number.isInteger(version)) return undefined;
  return entries.get(key + "@" + version);
}
