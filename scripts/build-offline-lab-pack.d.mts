// Types for scripts/build-offline-lab-pack.mjs (visual lab V14, docs/enterprise-csharp-visual-lab-plan.md §24).
import type { Plugin } from "vite";

export type OfflineLabPack = { available: boolean; version: string; bytes: number; files: string[] };
type ManifestChunk = { file: string; css?: string[]; assets?: string[]; imports?: string[]; dynamicImports?: string[] };
export function labClosure(manifest: Record<string, ManifestChunk>): string[];
export function labRuntimeFiles(dist: string): string[] | null;
export function buildPack(dist: string): OfflineLabPack;
export function writePack(dist: string): OfflineLabPack;
export function offlineLabPackPlugin(): Plugin;
