// Live Challenge — LIVE SESSION transports (Phase 4A lobby + Phase 4B round engine). Two server surfaces, matching the
// two roles:
//   • Teacher (x-builder-token + Bearer): create a room, poll the runtime view, start / next / finish / close the round;
//     plus the EXISTING /api/classrooms and /api/students?classId as the participant picker source.
//   • Student (x-student-token + Bearer): join a room, poll a SAFE view (no answer keys), toggle ready, and submit ONE
//     authoritative answer per round.
// The server is authoritative for everything (membership, snapshot, state, current question, grading); these are thin,
// injectable transports and NEVER decide correctness / score / the current question.

import type { Answer, Question } from "../../StudentQuestionCard";

export type LiveStatus = "lobby" | "active" | "finished" | "closed";

// The safe, sanitized current question a round carries (answer-key-free — the client never sees a key).
export interface LiveRound {
  roundVersion: number;
  questionNumber: number | null;
  questionCount: number;
  questionStartedAt: string | null;
  question: Question | null;
}

export interface TeacherLobbyParticipant { studentId: string; displayName: string; joined: boolean; ready: boolean; answered: boolean; joinedAt: string | null; readyAt: string | null }
export interface TeacherLobby {
  sessionId: string; joinCode: string; challengeId: string; challengeTitle: string; classId: string;
  status: LiveStatus; counts: { total: number; joined: number; ready: number };
  roundVersion: number; questionCount: number; playing: number;
  participants: TeacherLobbyParticipant[];
  round?: LiveRound & { answered: number; playing: number };
  startedAt: string | null; createdAt: string; updatedAt: string; finishedAt: string | null; closedAt: string | null;
}
export interface StudentLobbyParticipant { displayName: string; joined: boolean; ready: boolean }
export interface StudentSubmission { response: Answer; submittedAt: string }
export interface StudentLobby {
  sessionId: string; joinCode: string; challengeTitle: string; status: LiveStatus;
  you: { joined: boolean; ready: boolean; answered: boolean; submission?: StudentSubmission };
  counts: { total: number; joined: number; ready: number };
  round?: LiveRound;
  participants: StudentLobbyParticipant[]; updatedAt: string; closedAt: string | null;
}
export interface ClassOption { classId: string; name: string; status?: string }
export interface StudentOption { userId: string; displayName: string; active: boolean; archived: boolean }

export interface TeacherActionResult { ok: boolean; status: number; session?: TeacherLobby; error?: string; code?: string }
export interface TeacherLiveSessionClient {
  create(input: { challengeId: string; classId: string; studentIds: string[] }): Promise<{ ok: boolean; session?: TeacherLobby; error?: string }>;
  get(joinCode: string): Promise<TeacherLobby | null>;
  start(joinCode: string): Promise<TeacherActionResult>;
  next(joinCode: string, roundVersion: number): Promise<TeacherActionResult>;
  finish(joinCode: string, roundVersion: number): Promise<TeacherActionResult>;
  close(joinCode: string): Promise<{ ok: boolean; session?: TeacherLobby }>;
  listClasses(): Promise<ClassOption[]>;
  listStudents(classId: string): Promise<StudentOption[]>;
}
export interface StudentLiveSessionResult { ok: boolean; status: number; session?: StudentLobby; error?: string; code?: string }
export interface StudentLiveSessionClient {
  join(joinCode: string): Promise<StudentLiveSessionResult>;
  get(joinCode: string): Promise<StudentLiveSessionResult>;
  ready(joinCode: string, ready: boolean): Promise<StudentLiveSessionResult>;
  answer(joinCode: string, roundVersion: number, response: Answer): Promise<StudentLiveSessionResult>;
}

const TEACHER_BASE = "/api/game-live-session";
const STUDENT_BASE = "/api/game-live-session-student";

export function createTeacherLiveSessionClient(token: string): TeacherLiveSessionClient {
  const headers = { "x-builder-token": token, Authorization: "Bearer " + token, "content-type": "application/json" };
  const post = async (action: string, body: unknown) => {
    const r = await fetch(TEACHER_BASE + "/" + action, { method: "POST", headers, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { r, j };
  };
  const action = async (name: string, body: unknown): Promise<TeacherActionResult> => {
    const { r, j } = await post(name, body);
    return { ok: !!(r.ok && j && j.ok), status: r.status, session: j && j.session, error: j && j.error, code: j && j.code };
  };
  return {
    async create(input) {
      const { r, j } = await post("create", input);
      return { ok: !!(r.ok && j && j.ok), session: j && j.session, error: j && j.error };
    },
    async get(joinCode) {
      const { r, j } = await post("get", { joinCode });
      return r.ok && j && j.ok && j.session ? j.session : null;
    },
    start(joinCode) { return action("start", { joinCode }); },
    next(joinCode, roundVersion) { return action("next", { joinCode, roundVersion }); },
    finish(joinCode, roundVersion) { return action("finish", { joinCode, roundVersion }); },
    async close(joinCode) {
      const { r, j } = await post("close", { joinCode });
      return { ok: !!(r.ok && j && j.ok), session: j && j.session };
    },
    async listClasses() {
      const r = await fetch("/api/classrooms", { headers });
      const j = await r.json().catch(() => ({}));
      return Array.isArray(j.classes) ? j.classes : [];
    },
    async listStudents(classId) {
      const r = await fetch("/api/students?classId=" + encodeURIComponent(classId), { headers });
      const j = await r.json().catch(() => ({}));
      return Array.isArray(j.students) ? j.students : [];
    },
  };
}

export function createStudentLiveSessionClient(token: string): StudentLiveSessionClient {
  const headers = { "x-student-token": token, Authorization: "Bearer " + token, "content-type": "application/json" };
  const post = async (action: string, body: unknown): Promise<StudentLiveSessionResult> => {
    const r = await fetch(STUDENT_BASE + "/" + action, { method: "POST", headers, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { ok: !!(r.ok && j && j.ok), status: r.status, session: j && j.session, error: j && j.error, code: j && j.code };
  };
  return {
    join(joinCode) { return post("join", { joinCode }); },
    get(joinCode) { return post("get", { joinCode }); },
    ready(joinCode, ready) { return post("ready", { joinCode, ready }); },
    // The server derives the current question + grade; the client only forwards the local response for this round.
    answer(joinCode, roundVersion, response) { return post("answer", { joinCode, roundVersion, response }); },
  };
}
