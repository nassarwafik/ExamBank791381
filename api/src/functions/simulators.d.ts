// Type declarations for the simulator package handlers (runtime in simulators.js) so the frontend vertical-proof test can
// drive the REAL upload / runtime handlers under strict TypeScript.
export type SimulatorDeps = { getContainer: () => unknown | Promise<unknown>; requireBuilderAuth: (request: unknown) => unknown };
export type HandlerResponse = { status: number; headers?: Record<string, string>; jsonBody?: Record<string, unknown> & { package?: Record<string, unknown> & { packageId: string; packageVersion: number; packageHash: string; entry: string; title: string } }; body?: Buffer };
export function uploadHandler(request: unknown, deps?: SimulatorDeps, obs?: unknown): Promise<HandlerResponse>;
export function listHandler(request: unknown, deps?: SimulatorDeps): Promise<HandlerResponse>;
export function versionsHandler(request: unknown, deps?: SimulatorDeps): Promise<HandlerResponse>;
export function runtimeHandler(request: unknown, deps?: SimulatorDeps, obs?: unknown): Promise<HandlerResponse>;
