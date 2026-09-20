import { usePrefersReducedMotion } from "../../ui/usePrefersReducedMotion";
import type { VisualBlock } from "../content/types";
import { resolveVisual } from "./registry";
import { IconWarning } from "../../icons";
import "./visuals.css";

/**
 * Renders a `visual` block: a trusted, registry-resolved SVG illustration wrapped in a semantic <figure>. The
 * component supplies the accessible name on its root <svg role="img">; the optional `title`/`caption` are quiet
 * chrome around it. An unknown `visualId` renders a faithful "قيد الإعداد" fallback (never blank, never a guess).
 * Motion is decided by the shared prefers-reduced-motion hook and passed to the SVG (still frame under reduced
 * motion); visuals.css additionally neutralizes CSS motion under the media query as defense-in-depth.
 */
export default function VisualBlockView({ block }: { block: VisualBlock }) {
  const reducedMotion = usePrefersReducedMotion();
  const entry = resolveVisual(block.visualId);

  return (
    <figure className="eb-visual-figure">
      {block.title && <figcaption className="eb-visual-title">{block.title}</figcaption>}
      <div className="eb-visual-frame">
        {entry
          ? <entry.component ariaLabel={block.alt} reducedMotion={reducedMotion} />
          : (
            <div className="eb-visual-missing" role="img" aria-label={block.alt}>
              <IconWarning size={18} aria-hidden="true" />
              <span>الرسم التوضيحي قيد الإعداد</span>
            </div>
          )}
      </div>
      {block.caption && <figcaption className="eb-visual-caption">{block.caption}</figcaption>}
    </figure>
  );
}
