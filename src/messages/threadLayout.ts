import type { MessageView, UnreadCount } from "./messagesClient";
import type { Student } from "../students/types";

// Messages M.2 — PURE presentation helpers for the messaging pages (no state, no I/O). They decide how an already
// loaded thread / roster is DRAWN: day separators, grouping of consecutive messages, avatar initials, and the roster's
// search / "unread first" ordering. Nothing here changes which messages exist, what is acknowledged or who may send.

/** Consecutive messages from the same sender within this gap (same day) are drawn as one group. */
export const GROUP_GAP_MS = 5 * 60 * 1000;

const msOf = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : NaN; };
const pad = (n: number) => String(n).padStart(2, "0");

/** The LOCAL calendar day of a timestamp ("YYYY-MM-DD"), or "" when unparseable. */
export function localDayKey(iso: string): string {
  const t = msOf(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

/** «اليوم» / «أمس» / a long Arabic date (the year only when it is not the current year). */
export function dayLabel(iso: string, nowMs: number): string {
  const t = msOf(iso);
  if (Number.isNaN(t)) return "";
  const key = localDayKey(iso);
  const now = new Date(nowMs);
  const today = localDayKey(now.toISOString());
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterday = y.getFullYear() + "-" + pad(y.getMonth() + 1) + "-" + pad(y.getDate());
  if (key === today) return "اليوم";
  if (key === yesterday) return "أمس";
  const d = new Date(t);
  const opts: Intl.DateTimeFormatOptions = d.getFullYear() === now.getFullYear()
    ? { weekday: "long", day: "numeric", month: "long" }
    : { day: "numeric", month: "long", year: "numeric" };
  try { return d.toLocaleDateString("ar", opts); } catch { return key; }
}

/** The clock time shown inside a bubble (the day is carried by the separator above it). */
export function messageClock(iso: string): string {
  const t = msOf(iso);
  if (Number.isNaN(t)) return "";
  try { return new Date(t).toLocaleTimeString("ar", { hour: "numeric", minute: "2-digit" }); } catch { return new Date(t).toISOString().slice(11, 16); }
}

export type ThreadRow = { message: MessageView; day: string; continued: boolean };

/**
 * One row per message, in the given order: `day` is the separator label when this message starts a new local day
 * (else ""), `continued` when it directly follows a message of the SAME sender on the same day within GROUP_GAP_MS
 * (the sender label is then drawn only once for the group; it stays in the accessibility tree).
 */
export function layoutThread(messages: MessageView[], nowMs: number): ThreadRow[] {
  let prev: MessageView | null = null;
  let prevDay = "";
  return messages.map(m => {
    const dayKey = localDayKey(m.createdAt);
    const newDay = !prev || dayKey !== prevDay;
    const gap = prev ? Math.abs(msOf(m.createdAt) - msOf(prev.createdAt)) : Infinity;
    const continued = !!prev && !newDay && prev.senderRole === m.senderRole && prev.senderDisplayName === m.senderDisplayName && gap <= GROUP_GAP_MS;
    prev = m; prevDay = dayKey;
    return { message: m, day: newDay ? dayLabel(m.createdAt, nowMs) : "", continued };
  });
}

/** Up to two initials for an avatar; honorific tokens ending in "." (e.g. «أ.») are skipped. */
export function initialsOf(name: string): string {
  const words = String(name || "").trim().split(/\s+/).filter(w => w && !w.endsWith("."));
  const letters = words.slice(0, 2).map(w => Array.from(w)[0] || "");
  return letters.join("") || "؟";
}

/** A stable colour tone (0..4) for an identity, so the same student always gets the same avatar colour. */
export function avatarTone(id: string): number {
  let h = 0;
  for (const ch of String(id || "")) h = (h * 31 + (ch.codePointAt(0) || 0)) >>> 0;
  return h % 5;
}

/** Search folding: case, Arabic diacritics / tatweel, alef / yeh / teh-marbuta variants, Arabic-Indic digits. */
export function foldSearch(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .replace(/\s+/g, " ")
    .trim();
}

export type RosterFilter = "all" | "unread";

/**
 * The roster as drawn: students matching the search (folded, any part of the name), optionally only those with
 * unread replies, students with unread replies first (more unread first), everyone else in the server's order.
 */
export function rosterView(students: Student[], unread: Record<string, UnreadCount>, query: string, filter: RosterFilter): Student[] {
  const q = foldSearch(query);
  const count = (s: Student) => { const u = unread[s.userId]; return u ? (u.capped ? 100 : u.unread) : 0; };
  return students
    .map((s, i) => ({ s, i, n: count(s) }))
    .filter(x => (!q || foldSearch(x.s.displayName).includes(q)) && (filter === "all" || x.n > 0))
    .sort((a, b) => (Number(b.n > 0) - Number(a.n > 0)) || (b.n - a.n) || (a.i - b.i))
    .map(x => x.s);
}
