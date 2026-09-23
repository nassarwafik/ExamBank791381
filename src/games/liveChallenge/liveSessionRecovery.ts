// Live Challenge — reconnect HINT storage (Phase 4B). A tiny centralization of the sessionStorage keys + safe
// read/write/clear helpers shared by the teacher (LiveChallengeGenerator home + TeacherLiveLobby) and student
// (StudentLiveLobby) surfaces. It is ONLY a reconnect hint: the server `get` remains the sole authority on whether a
// remembered room is still valid / owned / open. Every accessor is wrapped in try/catch so a private window or blocked
// storage never throws (recovery just won't persist). No behavior change vs. the per-component helpers it replaces.

export const TEACHER_ROOM_KEY = "eb-lc-teacher-room";
export const STUDENT_ROOM_KEY = "eb-lc-student-room";

function read(key: string): string { try { return sessionStorage.getItem(key) || ""; } catch { return ""; } }
function write(key: string, code: string): void { try { sessionStorage.setItem(key, code); } catch { /* private mode / blocked: hint just won't persist */ } }
function clear(key: string): void { try { sessionStorage.removeItem(key); } catch { /* ignore */ } }

export const readTeacherRoom = (): string => read(TEACHER_ROOM_KEY);
export const writeTeacherRoom = (code: string): void => write(TEACHER_ROOM_KEY, code);
export const clearTeacherRoom = (): void => clear(TEACHER_ROOM_KEY);

export const readStudentRoom = (): string => read(STUDENT_ROOM_KEY);
export const writeStudentRoom = (code: string): void => write(STUDENT_ROOM_KEY, code);
export const clearStudentRoom = (): void => clear(STUDENT_ROOM_KEY);
