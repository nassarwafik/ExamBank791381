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
  }],
  // Phase 20A.2 — the enterprise pilots (each in its own lazy chunks).
  ["physicsFreeFall@1", {
    Workspace: lazy(() => import("../physicsFreeFall/FreeFallWorkspace")),
    Editor: lazy(() => import("../physicsFreeFall/FreeFallEditor")),
    ReviewDetails: lazy(() => import("../physicsFreeFall/FreeFallReview"))
  }],
  ["functionStudy2d@1", {
    Workspace: lazy(() => import("../functionStudy/FunctionStudyWorkspace")),
    Editor: lazy(() => import("../functionStudy/FunctionStudyEditor")),
    ReviewDetails: lazy(() => import("../functionStudy/FunctionStudyReview"))
  }],
  // Phase 20C — the curriculum network simulator: a NEW exact identity with its own lazy chunks (networkTopology@1 above is unchanged).
  ["networkTopology@2", {
    Workspace: lazy(() => import("../networkTopology2/Net2Workspace")),
    Editor: lazy(() => import("../networkTopology2/Net2Editor")),
    ReviewDetails: lazy(() => import("../networkTopology2/Net2Review"))
  }],
  // Phase 21D-A.1 — the motion simulators (free fall, projectile, Newton's second law, inclined plane): a NEW exact identity with its own
  // lazy chunks (physicsFreeFall@1 above is unchanged).
  ["physicsMotion@1", {
    Workspace: lazy(() => import("../physicsMotion/MotionWorkspace")),
    Editor: lazy(() => import("../physicsMotion/MotionEditor")),
    ReviewDetails: lazy(() => import("../physicsMotion/MotionReview"))
  }]
]);
/** The UI registered for EXACTLY (key, version) — undefined for anything else. */
export function resolveSmartSimUi(key: unknown, version: unknown): SmartSimUi | undefined {
  if (typeof key !== "string" || typeof version !== "number" || !Number.isInteger(version)) return undefined;
  return entries.get(key + "@" + version);
}
