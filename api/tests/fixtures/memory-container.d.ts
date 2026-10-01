// Type declarations so frontend (strict TypeScript) integration tests can drive the real server handlers against the
// in-memory container fixture without suppressions. Runtime behaviour lives in memory-container.js.
export type MemoryContainerApi = {
  container: unknown;
  store: Map<string, { content: Buffer; etag: string; contentType: string }>;
  setJson(name: string, value: unknown): void;
  getJson(name: string): unknown;
  getBinary(name: string): { buffer: Buffer; contentType: string } | null;
  has(name: string): boolean;
  names(prefix?: string): string[];
};
export function createMemoryContainer(seed?: Record<string, unknown>, hooks?: Record<string, unknown>): MemoryContainerApi;
