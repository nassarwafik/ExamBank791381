import { Suspense, useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "../../ui/usePrefersReducedMotion";
import type { VisualBlock } from "../content/types";
import { resolveVisual } from "./registry";
import { IconWarning } from "../../icons";
import "./visuals.css";

/** A visual must be at least this fraction on screen before its one-shot motion is (re)started — a bare edge (a
 *  1px sliver) must NOT count, or a one-shot would replay before the learner can meaningfully see it. */
const VISIBLE_RATIO = 0.25;

/**
 * Restart the SMIL timeline of every animated inline SVG inside `frame` from t=0. Many educational visuals play a
 * ONE-SHOT sequence (a packet travels, a DORA exchange, an encapsulation build-up) whose `begin` is a fixed offset
 * from MOUNT. The reader mounts a whole page on navigation, so a one-shot low on the page can finish (fill="freeze")
 * before the learner scrolls to it — arriving to a frozen final frame that reads as a static picture. Replaying the
 * timeline once the figure is actually visible makes the sequence noticeable after render. Looping animations restart
 * seamlessly, so it is safe to apply uniformly. Fully guarded: `setCurrentTime` exists only on real SVG SMIL engines
 * (a no-op/throw-safe elsewhere), so the still frame always stands when SMIL is unavailable.
 */
function restartVisualMotion(frame: HTMLElement): boolean {
  const svgs = frame.querySelectorAll<SVGSVGElement>("svg");
  svgs.forEach(svg => {
    if (typeof svg.setCurrentTime !== "function") return;
    if (!svg.querySelector("animate, animateMotion, animateTransform")) return;
    try { svg.setCurrentTime(0); } catch { /* SMIL not driveable here — the authored still frame stands */ }
  });
  // Phase 8E-6: the visual is a LAZY chunk — while it is still loading the frame holds only the status line and there is
  // no SVG to restart. Report whether the illustration was present so the observer knows the one-shot was delivered.
  return svgs.length > 0;
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

  // Start the visual's motion when it is MEANINGFULLY on screen (see restartVisualMotion). We only observe a visual
  // the audited registry marks as animated (entry.motion) — an intentionally static visual gets no observer at all.
  // A trigger requires BOTH isIntersecting AND intersectionRatio >= VISIBLE_RATIO: `isIntersecting` alone fires when
  // a 1px edge touches the viewport, which would replay a one-shot far too early (the very "finishes before it is
  // seen" bug we are fixing), so a sub-threshold sliver never restarts and never disconnects. One trigger on first
  // qualifying visibility keeps it calm — no perpetual re-runs while scrolling — and revisiting replays through the
  // component remount. Never runs under reduced motion (the components render no animation at all), and it degrades to
  // nothing where IntersectionObserver is unavailable (SSR/tests): the animation then plays at mount as before, and
  // the still frame is always correct.
  // Phase 8E-6 (lazy chunk): the observer watches the FRAME, which exists from the first render, so it stays valid
  // while the visual's chunk is still loading. If the frame becomes visible before the SVG has arrived there is nothing
  // to restart yet — the observer then stays connected (no disconnect) so the first qualifying visibility AFTER the SVG
  // mounts still replays once; an SVG that mounts while already visible simply plays its authored timeline from mount.
  // Still exactly one observer per figure, none for static or reduced-motion visuals, and never a replay on every scroll.
  useEffect(() => {
    if (reducedMotion || !entry || !entry.motion) return;
    const frame = frameRef.current;
    if (!frame || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries, obs) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio >= VISIBLE_RATIO) { if (restartVisualMotion(frame)) obs.disconnect(); return; }
      }
    }, { threshold: VISIBLE_RATIO });
    io.observe(frame);
    return () => io.disconnect();
  }, [reducedMotion, entry, block.visualId]);

  return (
    <figure className="eb-visual-figure">
      {block.title && <p className="eb-visual-title">{block.title}</p>}
      <div className="eb-visual-frame" ref={frameRef}>
        {entry
          ? (
            // Phase 8E-6 — the visual is a lazy chunk; the boundary lives INSIDE the frame so the figure, title, caption,
            // the page and the Reader chrome stay put and only the illustration area shows a quiet status line meanwhile.
            <Suspense fallback={<p className="eb-visual-loading eb-muted" role="status">جارٍ تحميل الرسم التوضيحي...</p>}>
              <entry.component ariaLabel={block.alt} reducedMotion={reducedMotion} />
            </Suspense>
          )
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
