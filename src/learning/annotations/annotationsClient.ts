// Phase L.5 — the student's PRIVATE reading annotations (bookmarks, one note per page, highlights). The host supplies the
// student's auth headers; the server is the authority (page index + publication gate + bounds). A read failure resolves to
// null (the Reader simply offers no annotations then); a write failure rejects with the server's message so the student is told.

export type ReaderBookmark = { pageId: string; at: string };
export type ReaderNote = { pageId: string; text: string; updatedAt: string };
export type ReaderHighlight = { pageId: string; id: string; quote: string; createdAt: string };
export type ReaderAnnotations = { bookmarks: ReaderBookmark[]; notes: ReaderNote[]; highlights: ReaderHighlight[] };

/** The bounds the server enforces (mirrored so the UI can say so before sending). */
export const NOTE_MAX = 1000;
export const QUOTE_MIN = 2;
export const QUOTE_MAX = 300;

export type AnnotationsClient = {
  get: (courseId: string) => Promise<ReaderAnnotations | null>;
  bookmark: (courseId: string, pageId: string, on: boolean) => Promise<ReaderAnnotations>;
  note: (courseId: string, pageId: string, text: string) => Promise<ReaderAnnotations>;
  highlight: (courseId: string, pageId: string, quote: string) => Promise<ReaderAnnotations>;
  unhighlight: (courseId: string, pageId: string, id: string) => Promise<ReaderAnnotations>;
};

export class AnnotationsError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const BASE = "/api/learning-annotations/";
const SAVE_FAILED = "تعذر حفظ التغيير الآن. حاول مرة أخرى.";
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** A safe copy of a server answer (anything malformed is dropped entry by entry). */
export function asAnnotations(j: unknown): ReaderAnnotations | null {
  if (!j || typeof j !== "object" || (j as { ok?: unknown }).ok !== true) return null;
  const v = j as Record<string, unknown>;
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((e): e is Record<string, unknown> => !!e && typeof e === "object" && typeof (e as { pageId?: unknown }).pageId === "string") : []);
  return {
    bookmarks: list(v.bookmarks).map(e => ({ pageId: str(e.pageId), at: str(e.at) })),
    notes: list(v.notes).filter(e => typeof e.text === "string").map(e => ({ pageId: str(e.pageId), text: str(e.text), updatedAt: str(e.updatedAt) })),
    highlights: list(v.highlights).filter(e => typeof e.id === "string" && typeof e.quote === "string").map(e => ({ pageId: str(e.pageId), id: str(e.id), quote: str(e.quote), createdAt: str(e.createdAt) })),
  };
}

export function createAnnotationsClient(headers: Record<string, string>): AnnotationsClient {
  async function write(courseId: string, action: string, body: Record<string, unknown>): Promise<ReaderAnnotations> {
    let r: Response;
    try {
      r = await fetch(BASE + encodeURIComponent(courseId) + "/" + action, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch {
      throw new AnnotationsError(0, SAVE_FAILED);
    }
    const j = (await r.json().catch(() => null)) as { error?: unknown } | null;
    const parsed = r.ok ? asAnnotations(j) : null;
    if (!parsed) throw new AnnotationsError(r.status, typeof j?.error === "string" && j.error ? j.error : SAVE_FAILED);
    return parsed;
  }
  return {
    async get(courseId) {
      try {
        const r = await fetch(BASE + encodeURIComponent(courseId), { headers });
        return r.ok ? asAnnotations(await r.json().catch(() => null)) : null;
      } catch { return null; }
    },
    bookmark: (courseId, pageId, on) => write(courseId, "bookmark", { pageId, on }),
    note: (courseId, pageId, text) => write(courseId, "note", { pageId, text }),
    highlight: (courseId, pageId, quote) => write(courseId, "highlight", { pageId, quote }),
    unhighlight: (courseId, pageId, id) => write(courseId, "unhighlight", { pageId, id }),
  };
}
