// Phase 21D-B.2 — the App-owned mesh asset service contract + the React context that carries it into the lazy MeshModelEditor
// (the same pattern as the SmartSim SimulationService). The editor never receives a token: App builds the service over its
// authenticated request helper (meshAssetClient.ts) and provides it; without a service the upload / "my models" actions are simply
// not offered and the reviewed library stays available.
import { createContext, useContext } from "react";
import type { MeshAssetIssue } from "./glbAsset";
import type { MeshUploadedAsset } from "./meshModelDraft";

export type MeshUploadResult =
  | { status: "created" | "exists"; asset: MeshUploadedAsset }
  | { status: "rejected"; issues: MeshAssetIssue[] }
  | { status: "error"; message: string };
export type MeshAssetService = {
  list: () => Promise<MeshUploadedAsset[]>;
  upload: (file: File, onProgress?: (fraction: number) => void) => Promise<MeshUploadResult>;
};

export const MeshAssetServiceContext = createContext<MeshAssetService | undefined>(undefined);
export const useMeshAssetService = (): MeshAssetService | undefined => useContext(MeshAssetServiceContext);
