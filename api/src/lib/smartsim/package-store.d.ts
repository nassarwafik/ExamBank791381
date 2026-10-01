// Type declarations for the immutable simulator package store (runtime in package-store.js).
export const PACKAGES_PREFIX: string;
export const OWNERS_PREFIX: string;
export function ownerHashOf(sub: string): string;
export function packageAvailabilityIssues(container: unknown, refs: unknown[]): Promise<Array<{ code: string; message: string; packageId?: string; packageVersion?: number }>>;
export function collectSimulationReferences(exam: unknown): unknown[];
export function loadPackageRecordByHash(container: unknown, hash: string): Promise<Record<string, unknown> | null>;
