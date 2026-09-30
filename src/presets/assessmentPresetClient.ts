// Phase 15A — the App-owned AssessmentPresetService over /api/assessment-presets. Loaded on demand (never in the initial
// graph) and handed to the Builder, which never sees the token (same pattern as the bank picker / governance services). The
// transport performs an authenticated POST and resolves with the parsed body, or rejects with { status, payload } for a non-2xx
// response (App.apiRequest); 400 (validation issues), 404 (not the caller's preset) and 409 (stale version, with the
// authoritative record) become a PresetRequestError so the UI can show issues / reload instead of retrying blindly.
import type { AssessmentPresetV1, AssessmentPresetRecordV1, AssessmentPresetSummary, PresetIssue } from "../assessmentPreset";

export type Transport = (body: Record<string, unknown>) => Promise<unknown>;
export type PresetPage = { items: AssessmentPresetSummary[]; nextCursor: number | null; total: number };
export type AssessmentPresetService = {
  list: (q?: string, cursor?: number | null) => Promise<PresetPage>;
  load: (presetId: string) => Promise<AssessmentPresetRecordV1>;
  create: (preset: AssessmentPresetV1) => Promise<AssessmentPresetRecordV1>;
  update: (presetId: string, expectedVersion: number, preset: AssessmentPresetV1) => Promise<AssessmentPresetRecordV1>;
  remove: (presetId: string, expectedVersion: number) => Promise<void>;
};
export class PresetRequestError extends Error {
  status: number; code: string; issues?: PresetIssue[]; record?: AssessmentPresetRecordV1;
  constructor(status: number, code: string, message: string, extra?: { issues?: PresetIssue[]; record?: AssessmentPresetRecordV1 }) {
    super(message); this.name = "PresetRequestError"; this.status = status; this.code = code; this.issues = extra?.issues; this.record = extra?.record;
  }
}
type ErrorLike = { status?: number; payload?: { code?: string; error?: string; issues?: PresetIssue[]; record?: AssessmentPresetRecordV1 }; message?: string };
async function call<T>(post: Transport, body: Record<string, unknown>): Promise<T> {
  try { return (await post(body)) as T; }
  catch (e) {
    if (e instanceof PresetRequestError) throw e;
    const err = (e ?? {}) as ErrorLike; const payload = err.payload ?? {};
    throw new PresetRequestError(typeof err.status === "number" ? err.status : 0, String(payload.code ?? ""), String(payload.error ?? err.message ?? "تعذر تنفيذ إجراء القوالب الأكاديمية."), { issues: payload.issues, record: payload.record });
  }
}
export function createAssessmentPresetService(post: Transport): AssessmentPresetService {
  return {
    list: (q, cursor) => call<PresetPage>(post, { action: "list", ...(q ? { q } : {}), ...(cursor != null ? { cursor } : {}), limit: 20 }).then(p => ({ items: p.items ?? [], nextCursor: p.nextCursor ?? null, total: p.total ?? (p.items ?? []).length })),
    load: presetId => call<{ record: AssessmentPresetRecordV1 }>(post, { action: "load", presetId }).then(r => r.record),
    create: preset => call<{ record: AssessmentPresetRecordV1 }>(post, { action: "create", preset }).then(r => r.record),
    update: (presetId, expectedVersion, preset) => call<{ record: AssessmentPresetRecordV1 }>(post, { action: "update", presetId, expectedVersion, preset }).then(r => r.record),
    remove: (presetId, expectedVersion) => call<{ deleted: boolean }>(post, { action: "delete", presetId, expectedVersion }).then(() => undefined)
  };
}
