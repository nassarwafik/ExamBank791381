// Phase 19A — the App-owned AI authoring service contract. The Builder never receives a token: App.tsx owns one POST to
// /api/ai-question-author and hands the builder this function. Without a service the «سؤال بالذكاء الاصطناعي» action is not offered.
import type { ComposerTransport } from "../aiComposer/composerRun";
export type AiAuthorRequest = { request: string; preferredType?: string };
export type AiAuthorIssueView = { code: string; message: string };
export type AiAuthorResponse =
  | { ok: true; intent: string; question: unknown; notes?: string[] }
  | { ok: false; code?: string; message?: string; error?: string; intent?: string; issues?: AiAuthorIssueView[] };
// Phase 19G — the optional scenario authoring call (POST /api/ai-scenario-author): one request → ONE canonical scenario + its questions.
export type AiScenarioRequest = { request: string };
export type AiScenarioResponse =
  | { ok: true; scenario: unknown; questions: unknown[]; notes?: string[] }
  | { ok: false; code?: string; message?: string; error?: string; issues?: AiAuthorIssueView[] };
// Phase 20F — the optional AI Full Exam Composer transport (POST /api/ai-exam-composer, one bounded stage per call). Resolves with the
// JSON body; a 4xx / 5xx rejection carrying its JSON body (`payload`) is read by the composer itself. Without it «المؤلف الذكي للامتحان» is not offered.
export type AiAuthorService = { author(input: AiAuthorRequest): Promise<AiAuthorResponse>; authorScenario?(input: AiScenarioRequest): Promise<AiScenarioResponse>; composeExam?: ComposerTransport };
