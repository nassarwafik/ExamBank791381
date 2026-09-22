import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "../../ui/usePrefersReducedMotion";
import type { VisualBlock } from "../content/types";
import { resolveVisual } from "./registry";
import { IconWarning } from "../../icons";
import "./visuals.css";

/**
 * Restart the SMIL timeline of every animated inline SVG inside `frame` from t=0. Many educational visuals play a
 * ONE-SHOT sequence (a packet travels, a DORA exchange, an encapsulation build-up) whose `begin` is a fixed offset
 * from MOUNT. The reader mounts a whole page on navigation, so a one-shot low on the page can finish (fill="freeze")
 * before the learner scrolls to it — arriving to a frozen final frame that reads as a static picture. Replaying the
 * timeline once the figure is actually visible makes the sequence noticeable after render. Looping animations restart
 * seamlessly, so it is safe to apply uniformly. Fully guarded: `setCurrentTime` exists only on real SVG SMIL engines
 * (a no-op/throw-safe elsewhere), so the still frame always stands when SMIL is unavailable.
 */
function restartVisualMotion(frame: HTMLElement): void {
  const svgs = frame.querySelectorAll<SVGSVGElement>("svg");
  svgs.forEach(svg => {
    if (typeof svg.setCurrentTime !== "function") return;
    if (!svg.querySelector("animate, animateMotion, animateTransform")) return;
    try { svg.setCurrentTime(0); } catch { /* SMIL not driveable here — the authored still frame stands */ }
  });
}

/**
 * Renders a `visual` block: a trusted, registry-resolved SVG illustration wrapped in a semantic <figure>. The
 * component supplies the accessible name on its root <svg role="img">; the optional `title`/`caption` are quiet
 * chrome around it. A semantic <figure> holds at most ONE <figcaption> — so the optional `title` renders as a plain
 * <p> heading above the figure, and the single <figcaption> is reserved for the bottom explanatory `caption`. The
 * SVG's role="img" + aria-label={alt} remains the illustration's accessible name (never duplicated by the caption).
 * An unknown `visualId` renders a faithful "قيد الإعداد" fallback (never blank, never a guess). Motion is decided by
 * the shared prefers-reduced-motion hook and passed to the SVG (still frame under reduced motion); visuals.css
 * additionally neutralizes CSS motion under the media query as defense-in-depth.
 */
export default function VisualBlockView({ block }: { block: VisualBlock }) {
  const reducedMotion = usePrefersReducedMotion();
  const entry = resolveVisual(block.visualId);
  const frameRef = useRef<HTMLDivElement | null>(null);

  // Start the visual's motion when it is actually on screen (see restartVisualMotion). One trigger on first
  // visibility keeps it calm — no perpetual re-runs while scrolling — and revisiting the page naturally replays it
  // through the component remount. Never runs under reduced motion (the components render no animation at all), and
  // it degrades to nothing where IntersectionObserver is unavailable (SSR/tests): the animation then simply plays at
  // mount as before, and the still frame is always correct.
  useEffect(() => {
    if (reducedMotion || !entry) return;
    const frame = frameRef.current;
    if (!frame || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries, obs) => {
      for (const e of entries) {
        if (e.isIntersecting) { restartVisualMotion(frame); obs.disconnect(); return; }
      }
    }, { threshold: 0.25 });
    io.observe(frame);
    return () => io.disconnect();
  }, [reducedMotion, entry, block.visualId]);

  return (
    <figure className="eb-visual-figure">
      {block.title && <p className="eb-visual-title">{block.title}</p>}
      <div className="eb-visual-frame" ref={frameRef}>
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
