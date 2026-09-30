// Type declarations for the dependency-free SmartSim ZIP fixture writer (runtime in smartsim-zip.js).
export type ZipEntry = { name: string; data: Buffer | string; method?: 0 | 8; symlink?: boolean; uncompressedSizeOverride?: number; compressedOverride?: Buffer; crcOverride?: number };
export function crc32(buf: Uint8Array): number;
export function writeZip(entries: ZipEntry[], options?: { prefix?: string }): Buffer;
export function manifestOf(over?: Record<string, unknown>): Record<string, unknown>;
export const VANILLA_INDEX: string;
export function vanillaPackage(manifestOver?: Record<string, unknown>, extra?: ZipEntry[]): Buffer;
export function reactDistPackage(manifestOver?: Record<string, unknown>): Buffer;
export function sourceOnlyPackage(): Buffer;
