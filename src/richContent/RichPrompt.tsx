import type { ReactNode } from "react";
import { promptText } from "../questionContent";
import type { Question } from "../studentQuestionTypes";
import { validateRichContent, type RichContentV1 } from "./richContentModel";
import RichContentRenderer from "./RichContentRenderer";

// Phase 20D.1 — the LAZY rich-stem boundary. The initial graph (StudentQuestionCard, the cover, the preview) only checks "is there an
// object" and lazily loads this module; HERE the strict authority (validateRichContent) decides. A valid document renders through the
// trusted renderer; anything else (malformed, unknown version, refused content) renders the EXACT baseline plain-text element.
const cache = new WeakMap<object, RichContentV1 | null>();
/** The canonical document of a raw value, or null. Memoized per object identity (validation runs once per stored document). */
function validRich(raw: unknown): RichContentV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const hit = cache.get(raw);
  if (hit !== undefined) return hit;
  const r = validateRichContent(raw);
  const value = r.ok && r.value ? r.value : null;
  cache.set(raw, value);
  return value;
}

/** Generic rich-or-plain slot (section / cover instructions, composite part prompts, scenario sources). */
export function RichText({ raw, id, className, fallback }: { raw: unknown; id?: string; className: string; fallback: ReactNode }) {
  const rc = validRich(raw);
  if (!rc) return <>{fallback}</>;
  return <div className={className + " xp-rich-stem"} id={id}><RichContentRenderer content={rc} /></div>;
}

/** A question stem: valid q.richContent → rich stem (same id, so every aria-labelledby keeps working); else the baseline prompt. */
export default function RichPrompt({ q, textId }: { q: Question; textId: string }) {
  return <RichText raw={q.richContent} id={textId} className="iex-qtext" fallback={<p className="iex-qtext" id={textId}>{promptText(q.text)}</p>} />;
}
