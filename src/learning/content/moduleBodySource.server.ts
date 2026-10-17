// Phase L.6a — the deployed app's ONLY way to a module body: GET /api/learning-content/{courseId}/{moduleId} with the caller's
// session headers. The server is the authority: a student receives a module only when it is published to the student's
// persisted class (a hidden or unknown module is refused), a teacher receives any module of the book. Module bodies are therefore
// never public assets. The answer is revalidated on every open (ETag, `no-cache`), so a module hidden later is refused next time.
import type { ContentModule } from "./types";

export class ModuleBodyError extends Error {
  readonly status: number;
  readonly code: "unavailable" | "not-found" | "unauthorized" | "network" | "invalid";
  constructor(status: number, code: ModuleBodyError["code"], message: string) { super(message); this.name = "ModuleBodyError"; this.status = status; this.code = code; }
}

const BASE = "/api/learning-content/";

function isModuleFor(body: unknown, moduleId: string): body is ContentModule {
  if (!body || typeof body !== "object") return false;
  const m = body as { id?: unknown; lessons?: unknown };
  return m.id === moduleId && Array.isArray(m.lessons);
}

/** One module body from the API, or a typed ModuleBodyError (never a partial or foreign body). */
export async function loadModuleBody(courseId: string, moduleId: string, headers: Record<string, string> = {}): Promise<ContentModule> {
  let r: Response;
  try {
    r = await fetch(BASE + encodeURIComponent(courseId) + "/" + encodeURIComponent(moduleId), { headers, cache: "no-cache" });
  } catch {
    throw new ModuleBodyError(0, "network", "تعذر تحميل هذه الوحدة الآن. تحقق من الاتصال ثم أعد المحاولة.");
  }
  const j = (await r.json().catch(() => null)) as { ok?: unknown; module?: unknown; error?: unknown } | null;
  const message = typeof j?.error === "string" && j.error ? j.error : "تعذر تحميل هذه الوحدة الآن.";
  if (r.status === 401) throw new ModuleBodyError(401, "unauthorized", message);
  if (r.status === 403) throw new ModuleBodyError(403, "unavailable", message);
  if (r.status === 404) throw new ModuleBodyError(404, "not-found", message);
  if (!r.ok || j?.ok !== true || !isModuleFor(j.module, moduleId)) throw new ModuleBodyError(r.status, "invalid", message);
  return j.module;
}
