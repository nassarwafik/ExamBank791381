// Live Challenge — LIVE SESSION transports (Phase 4A: lobby only). Two server surfaces, matching the two roles:
//   • Teacher (x-builder-token + Bearer, like liveChallengeClient): create a room from a SAVED challenge, poll the
//     lobby, close it; plus the EXISTING /api/classrooms and /api/students?classId as the participant picker source.
//   • Student (x-student-token + Bearer, like numberConversionClient): join a room the teacher listed them in, poll a
//     SAFE lobby view (no questions/answers), toggle ready.
// The server is authoritative for everything (membership, snapshot, state); these are thin, injectable transports.

export type LiveStatus = "lobby" | "closed";

export interface TeacherLobbyParticipant { studentId: string; displayName: string; joined: boolean; ready: boolean; joinedAt: string | null; readyAt: string | null }
export interface TeacherLobby {
  sessionId: string; joinCode: string; challengeId: string; challengeTitle: string; classId: string;
  status: LiveStatus; counts: { total: number; joined: number; ready: number };
  participants: TeacherLobbyParticipant[]; createdAt: string; updatedAt: string; closedAt: string | null;
}
export interface StudentLobbyParticipant { displayName: string; joined: boolean; ready: boolean }
export interface StudentLobby {
  sessionId: string; joinCode: string; challengeTitle: string; status: LiveStatus;
  you: { joined: boolean; ready: boolean }; counts: { total: number; joined: number; ready: number };
  participants: StudentLobbyParticipant[]; updatedAt: string; closedAt: string | null;
}
export interface ClassOption { classId: string; name: string; status?: string }
export interface StudentOption { userId: string; displayName: string; active: boolean; archived: boolean }

export interface TeacherLiveSessionClient {
  create(input: { challengeId: string; classId: string; studentIds: string[] }): Promise<{ ok: boolean; session?: TeacherLobby; error?: string }>;
  get(joinCode: string): Promise<TeacherLobby | null>;
  close(joinCode: string): Promise<{ ok: boolean; session?: TeacherLobby }>;
  listClasses(): Promise<ClassOption[]>;
  listStudents(classId: string): Promise<StudentOption[]>;
}
export interface StudentLiveSessionResult { ok: boolean; status: number; session?: StudentLobby; error?: string }
export interface StudentLiveSessionClient {
  join(joinCode: string): Promise<StudentLiveSessionResult>;
  get(joinCode: string): Promise<StudentLiveSessionResult>;
  ready(joinCode: string, ready: boolean): Promise<StudentLiveSessionResult>;
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
  return {
    async create(input) {
      const { r, j } = await post("create", input);
      return { ok: !!(r.ok && j && j.ok), session: j && j.session, error: j && j.error };
    },
    async get(joinCode) {
      const { r, j } = await post("get", { joinCode });
      return r.ok && j && j.ok && j.session ? j.session : null;
    },
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
    return { ok: !!(r.ok && j && j.ok), status: r.status, session: j && j.session, error: j && j.error };
  };
  return {
    join(joinCode) { return post("join", { joinCode }); },
    get(joinCode) { return post("get", { joinCode }); },
    ready(joinCode, ready) { return post("ready", { joinCode, ready }); },
  };
}
