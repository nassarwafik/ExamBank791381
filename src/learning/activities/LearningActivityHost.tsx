import { useCallback, useEffect, useRef, useState } from "react";
import useFocusTrap from "../../ui/useFocusTrap";
import { usePrefersReducedMotion } from "../../ui/usePrefersReducedMotion";
import { activityKey, type ActivityBlock, type ActivityCapabilities, type ActivityCommand } from "../content/types";
import {
  productionActivityRegistry, noopActivityEventSink,
  type LearningActivityRegistry, type LearningActivityEventSink, type ActivityComponent, type ActivityCommandSignals,
} from "./engine";
import { ACTIVITY_KIND_LABEL } from "./labels";
import { builtinActivityRegistry } from "./builtins";
import ActivityFallback from "./ActivityFallback";
import LearningActivityBoundary from "./LearningActivityBoundary";
import "./activities.css";

/**
 * The single SHELL that presents one interactive-activity descriptor. It is the only place the reader touches the
 * activity engine, so `LearningPageRenderer` stays lean (delegation, not a monolith).
 *
 * Behaviour:
 *   - Resolve the block by EXACT {kind, key, version} — first in the trusted BUILT-IN registry (generic presenters
 *     shipped with the engine, e.g. guided/reveal/v1), then in the INJECTED registry (defaulting to the EMPTY
 *     production registry). Never by block type alone: an unknown key or unsupported version of any family —
 *     guided included — renders the faithful static `ActivityFallback`.
 *   - A registry match with an eager `component` renders at once; one with a lazy `load` thunk is loaded (its own
 *     chunk) into STATE (never read from a ref during render) behind a loading status. Either way the component is
 *     isolated in `LearningActivityBoundary`, so a throwing activity degrades to the fallback instead of crashing
 *     the page.
 *   - ONE LIVE INSTANCE, ALWAYS. The activity element is rendered exactly once at a fixed tree position; fullscreen
 *     only promotes the SAME host surface to a fixed overlay (CSS) and arms the shared `useFocusTrap` (Escape,
 *     Tab containment, focus return) + body scroll-lock. Nothing is duplicated, moved or remounted, so interaction
 *     state is authoritative across inline <-> fullscreen. No modal library.
 *   - Controls (توسيع / إعادة تعيين / إعادة التشغيل) appear ONLY when the RENDERER declares the capability (registry
 *     entry or built-in) — untrusted content data can never enable a control the renderer does not honor, and an
 *     unsupported command never renders a fake button. Commands reach the renderer as monotonic signals.
 *   - Reduced-motion is honored (prop to the renderer + the shell's own CSS).
 *   - Events flow to the INJECTED sink (default: no-op). No persistence, no network, no progress/grades.
 */
export default function LearningActivityHost({
  block, courseId, registry = productionActivityRegistry, emit = noopActivityEventSink,
}: {
  block: ActivityBlock;
  courseId: string;
  registry?: LearningActivityRegistry;
  emit?: LearningActivityEventSink;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [fullscreen, setFullscreen] = useState(false);
  const [commands, setCommands] = useState<ActivityCommandSignals>({ reset: 0, replay: 0 });
  const rootRef = useRef<HTMLDivElement>(null);

  // Session cache of loaded activity components, keyed by resolved identity and held in STATE so the render value
  // is derived from it (never read a just-loaded module from a ref during render). Errors are tracked separately.
  const [loadedByKey, setLoadedByKey] = useState<Record<string, ActivityComponent>>({});
  const [erroredKeys, setErroredKeys] = useState<Set<string>>(new Set());
  const inflightRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Exact {kind, key, version} resolution: trusted built-ins first, then the injected registry.
  const entry = builtinActivityRegistry.resolve(block) ?? registry.resolve(block);
  const lazy = entry?.load;
  // A textual, collision-free identity (no delimiter logic; JSON escapes whatever the free-form key contains).
  const entryKey = entry ? JSON.stringify([entry.kind, entry.key, block.version]) : "";

  // Trigger the lazy component load exactly once per resolved identity. State is set ONLY from async callbacks, so
  // nothing is set synchronously inside the effect (no cascading-render warning); the body is derived below.
  useEffect(() => {
    if (!lazy) return;
    if (loadedByKey[entryKey] || erroredKeys.has(entryKey) || inflightRef.current.has(entryKey)) return;
    inflightRef.current.add(entryKey);
    lazy()
      .then(mod => { inflightRef.current.delete(entryKey); if (mountedRef.current) setLoadedByKey(prev => ({ ...prev, [entryKey]: mod.default })); })
      .catch(() => { inflightRef.current.delete(entryKey); if (mountedRef.current) setErroredKeys(prev => new Set(prev).add(entryKey)); });
  }, [lazy, entryKey, loadedByKey, erroredKeys]);

  const Comp: ActivityComponent | undefined = entry?.component ?? (lazy ? loadedByKey[entryKey] : undefined);
  const loadFailed = lazy ? erroredKeys.has(entryKey) : false;
  // Renderer capability AUTHORITY: the resolved entry's declaration (built-in or registry). Content never adds one.
  const caps: ActivityCapabilities = entry?.capabilities ?? {};

  // Announce readiness once — the live component mounts exactly once (fullscreen never remounts it).
  useEffect(() => {
    if (Comp) emit({ type: "ready", activityId: block.id, kind: block.type, key: activityKey(block) });
  }, [Comp, emit, block]);

  const onCompError = useCallback((message: string) => {
    emit({ type: "error", activityId: block.id, message });
  }, [emit, block.id]);

  const closeFullscreen = useCallback(() => {
    setFullscreen(false);
    emit({ type: "fullscreen", activityId: block.id, open: false });
  }, [emit, block.id]);
  const openFullscreen = useCallback(() => {
    setFullscreen(true);
    emit({ type: "fullscreen", activityId: block.id, open: true });
  }, [emit, block.id]);

  // Fullscreen = the SAME surface promoted to a modal overlay: shared focus trap (Tab containment, Escape -> close,
  // focus returned to the toggle) + body scroll-lock. The activity instance is untouched.
  useFocusTrap(rootRef, fullscreen, closeFullscreen);
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [fullscreen]);

  // Issue a generic command: bump its monotonic signal (the renderer reacts to the change) and emit the event.
  // Only reachable through a control that exists because `caps` declared the command.
  const issue = (cmd: ActivityCommand) => {
    setCommands(c => ({ ...c, [cmd]: c[cmd] + 1 }));
    emit(cmd === "reset" ? { type: "reset", activityId: block.id } : { type: "replayed", activityId: block.id });
  };

  // No trusted renderer for this exact identity (unknown key, unsupported version, empty production registry) or a
  // failed chunk load -> static fallback.
  if (!entry || loadFailed) {
    return <ActivityFallback block={block} reason={loadFailed ? "error" : "pending"} />;
  }
  if (!Comp) {
    return (
      <div className={"learning-activity is-loading kind-" + block.type}>
        <p className="learning-activity-kicker">{ACTIVITY_KIND_LABEL[block.type]}</p>
        <p className="learning-activity-title">{block.title}</p>
        <p className="learning-activity-status" role="status">جارٍ تحضير النشاط التفاعلي...</p>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={"learning-activity kind-" + block.type + (fullscreen ? " is-fullscreen" : "")}
      data-activity-kind={block.type}
      data-reduced-motion={reducedMotion || undefined}
      data-fullscreen={fullscreen || undefined}
      role={fullscreen ? "dialog" : undefined}
      aria-modal={fullscreen || undefined}
      aria-label={fullscreen ? block.title : undefined}
    >
      <div className="learning-activity-head">
        <div className="learning-activity-headtext">
          <p className="learning-activity-kicker">{ACTIVITY_KIND_LABEL[block.type]}</p>
          <p className="learning-activity-title">{block.title}</p>
        </div>
        <div className="learning-activity-controls">
          {caps.reset && (
            <button type="button" className="eb-button is-quiet is-small learning-activity-ctl" data-command="reset" onClick={() => issue("reset")}>
              إعادة تعيين
            </button>
          )}
          {caps.replay && (
            <button type="button" className="eb-button is-quiet is-small learning-activity-ctl" data-command="replay" onClick={() => issue("replay")}>
              إعادة التشغيل
            </button>
          )}
          {caps.fullscreen && (
            <button
              type="button"
              className="eb-button is-quiet is-small learning-activity-ctl learning-activity-expand"
              aria-expanded={fullscreen}
              onClick={fullscreen ? closeFullscreen : openFullscreen}
            >
              {fullscreen ? "إغلاق" : "توسيع"}
            </button>
          )}
        </div>
      </div>
      {block.description && <p className="learning-activity-desc">{block.description}</p>}
      <div className="learning-activity-stage">
        <LearningActivityBoundary fallback={<ActivityFallback block={block} reason="error" />} onError={onCompError}>
          <Comp block={block} courseId={courseId} reducedMotion={reducedMotion} fullscreen={fullscreen} commands={commands} emit={emit} />
        </LearningActivityBoundary>
      </div>
    </div>
  );
}
