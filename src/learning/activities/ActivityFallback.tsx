import { IconWarning } from "../../icons";
import { ACTIVITY_KIND_LABEL } from "./labels";
import type { ActivityBlock } from "../content/types";

/**
 * The faithful STATIC surface shown for an interactive-activity descriptor whenever no live renderer runs — which
 * in Phase 3A is ALWAYS for registry families (production registry is empty), and later also when the version is
 * unsupported or the live renderer throws. It shows the activity title + description + an optional already-vetted
 * image, plus a clear note that this is a static stand-in FOR THE INTERACTIVE ACTIVITY. Provenance wording matters:
 * every activity family is `origin:"teacher-enrichment"`, so this surface must never claim to be book content
 * ("من الكتاب") — a block-level book `source`, when present, only ASSOCIATES the enrichment with a book page; it
 * does not change its origin. Activities carry NO answer key, so none can leak here; `config` is never executed.
 */
export default function ActivityFallback({ block, reason = "pending" }: { block: ActivityBlock; reason?: "pending" | "error" }) {
  const fb = block.fallback;
  return (
    <div className={"learning-activity-fallback kind-" + block.type} role="group" aria-label={block.title}>
      <p className="learning-activity-kicker">{ACTIVITY_KIND_LABEL[block.type]}</p>
      <p className="learning-activity-title">{block.title}</p>
      {block.description && <p className="learning-activity-desc">{block.description}</p>}
      {fb?.text && <p className="learning-activity-fallback-text">{fb.text}</p>}
      {fb?.src && (
        <img
          className="learning-activity-fallback-img"
          src={fb.src}
          alt={fb.alt ?? ""}
          aria-hidden={fb.alt ? undefined : true}
          loading="lazy"
        />
      )}
      <p className="learning-activity-note" role="note">
        <IconWarning size={16} aria-hidden="true" />
        {reason === "error"
          ? "تعذّر تشغيل هذا النشاط التفاعلي؛ هذا عرض بديل ثابت للنشاط التفاعلي."
          : "سيتوفر هذا النشاط التفاعلي لاحقًا؛ هذا عرض بديل ثابت للنشاط التفاعلي."}
      </p>
    </div>
  );
}
