export type FakeLanguage = { key: string; languageVersion: number; [k: string]: unknown };
export type FakeProvider = {
  id: string;
  requests: Record<string, unknown>[];
  capabilities: () => { available: boolean; languages: FakeLanguage[] };
  execute: (request: Record<string, unknown>) => Promise<unknown>;
};
export function createFakeCodingExecutionProvider(options?: { languages?: FakeLanguage[]; respond?: (request: Record<string, unknown>) => unknown }): FakeProvider;
