// Phase 16B-A — the App-owned SimulationService contract + the React context that carries it into the lazy authoring editor.
// The Builder never receives a token: App builds the service over its authenticated request helper (see simulationClient.ts)
// and injects it as a prop; the editor reaches it through this context. Without a service the upload / library actions are
// simply not offered.
import { createContext, useContext } from "react";

export type SimulationPackageRecord = {
  packageId: string; packageVersion: number; packageHash: string; runtimeVersion: number;
  entry: string; title: string; description?: string;
  sizeBytes: number; fileCount: number; uploadedAt: string; status: "ready" | string;
};
export type SimulationValidationIssue = { code: string; severity: "error" | "warning"; message: string; path?: string };
export type SimulationValidationReport = { ok: boolean; issues: SimulationValidationIssue[]; fileCount?: number; compressedBytes?: number; uncompressedBytes?: number; selfContained?: boolean; externalResources?: unknown[]; ignoredPaths?: string[]; packageHash?: string | null };
export type SimulationUploadResult =
  | { status: "created" | "exists"; package: SimulationPackageRecord; report?: SimulationValidationReport }
  | { status: "rejected"; report: SimulationValidationReport }
  | { status: "conflict"; existing: { packageHash: string; uploadedAt?: string } | null; report?: SimulationValidationReport }
  | { status: "error"; message: string };
export type SimulationService = {
  list: () => Promise<SimulationPackageRecord[]>;
  versions: (packageId: string) => Promise<SimulationPackageRecord[]>;
  upload: (file: File, onProgress?: (fraction: number) => void) => Promise<SimulationUploadResult>;
};

export const SimulationServiceContext = createContext<SimulationService | undefined>(undefined);
export const useSimulationService = (): SimulationService | undefined => useContext(SimulationServiceContext);
