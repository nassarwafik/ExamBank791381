// Number Conversion Challenge — the browser's thin transport to the SERVER-AUTHORITATIVE game API. It sends only
// the student's eight bits and never trusts a local score; grading, the task snapshot and the best record all live
// on the server. Injectable so components/tests can pass a fake client.
import type { ChallengePath, AssistanceLevel, ConversionDirection, Bit } from "./conversion";

export interface PublicTask {
  taskId: string;
  direction: ConversionDirection;
  sourceBase: number;
  targetBase: number;
  sourceDisplay: string;
  bitWidth: number;
}
export interface ActiveState {
  attemptId: string;
  path: ChallengePath;
  level: AssistanceLevel;
  total: number;
  index: number;
  taskNumber: number;
  currentTask: PublicTask | null;
  attemptsOnCurrent: number;
  resolved: number;
  correct: number;
  streak: number;
  bestStreak: number;
  startedAt: string;
  done: boolean;
}
export interface BestRecord { percentage: number; correct: number; total: number; bestStreak: number; elapsedMs: number; at: string }
export interface RoundResult { correct: number; total: number; percentage: number; bestStreak: number; elapsedMs: number; at: string }
export interface GameState { ok: boolean; active: ActiveState | null; best: BestRecord | null }
export interface AnswerResponse {
  ok: boolean;
  correct?: boolean;
  attempts?: number;
  hint?: string;
  revealed?: boolean;
  solutionBits?: Bit[];
  explanation?: string;
  taskId?: string;
  done?: boolean;
  result?: RoundResult;
  best?: BestRecord;
  state?: ActiveState;
  error?: string;
  expectedTaskId?: string;
}

export interface NumberConversionClient {
  getState(): Promise<GameState>;
  start(path: ChallengePath, level: AssistanceLevel): Promise<GameState>;
  answer(taskId: string, bits: Bit[]): Promise<AnswerResponse>;
}

const BASE = "/api/game-number-conversion";

export function createNumberConversionClient(token: string): NumberConversionClient {
  const headers = { "x-student-token": token, Authorization: "Bearer " + token, "content-type": "application/json" };
  const post = async (action: string, body: unknown) => {
    const r = await fetch(BASE + "/" + action, { method: "POST", headers, body: JSON.stringify(body) });
    return r.json();
  };
  return {
    async getState() {
      const r = await fetch(BASE, { headers });
      return r.json();
    },
    start(path, level) { return post("start", { path, level }); },
    answer(taskId, bits) { return post("answer", { taskId, bits }); },
  };
}
