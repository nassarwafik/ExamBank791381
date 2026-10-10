// Phase 21D — the ONE orbit-camera controller of ExamBank's owned 3D viewers (interactive 3D scenes and 3D function surfaces).
// Pure math (exported for tests) + a React hook. The camera orbits the scene's centre: yaw is unbounded (a student can keep turning
// the model — the 21C/21B viewers clamped it to ±π, a hard stop after one turn), pitch is clamped short of the poles (no flip), zoom
// is bounded. Input is applied per frame (leading update + one trailing requestAnimationFrame per frame), released drags keep a short
// inertia whose decay is integrated exactly (identical at 60 Hz and 120 Hz), auto-rotation yields to any student input, and
// prefers-reduced-motion disables both animations. The camera is reset only when the scene's CONTENT changes (resetKey), never
// because a parent passed a new object with the same content. Every frame request and listener is released on unmount.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

export type OrbitCamera = { yaw: number; pitch: number; zoom: number };
export type OrbitLimits = { pitchMin: number; pitchMax: number; zoomMin: number; zoomMax: number };

export const ORBIT = Object.freeze({
  /** radians of yaw for a drag across the viewer's full rendered width (consistent across screen sizes) */
  turnPerWidth: 2 * Math.PI * 0.85,
  pitchFactor: 0.8,
  dragThresholdPx: 4,
  keyYaw: 0.2,
  keyPitch: 0.15,
  keyZoom: 1.12,
  /** inertia time constant (s), velocity cap (rad/s), stop speed (rad/s), sample window and release pause (ms) */
  inertiaTau: 0.32,
  maxSpeed: 6,
  stopSpeed: 0.08,
  sampleMs: 90,
  pauseMs: 70,
  autoSpeed: 0.55,
  /** a frame step is capped so a background tab or a long frame never produces a jump */
  maxStep: 0.05,
  wheelPerPixel: 0.0015
});

const TAU = Math.PI * 2;
/** An angle in [−π, π). */
export const wrapAngle = (a: number): number => { const r = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI; return Object.is(r, -0) ? 0 : r; };
export const clampNumber = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const radiansPerPixel = (widthPx: number) => ORBIT.turnPerWidth / Math.max(200, widthPx || 720);
/** The camera for a drag of (dx, dy) pixels from `start` on a viewer `widthPx` wide. */
export function dragCamera(start: OrbitCamera, dx: number, dy: number, widthPx: number, limits: OrbitLimits): OrbitCamera {
  const k = radiansPerPixel(widthPx);
  return { yaw: wrapAngle(start.yaw + dx * k), pitch: clampNumber(start.pitch - dy * k * ORBIT.pitchFactor, limits.pitchMin, limits.pitchMax), zoom: start.zoom };
}
/** One inertia step of `dt` seconds: the exact integral of v·e^(−t/τ), so the travelled angle does not depend on the frame rate. */
export function inertiaStep(velocity: number, dt: number): { delta: number; velocity: number } {
  const decay = Math.exp(-dt / ORBIT.inertiaTau);
  return { delta: velocity * ORBIT.inertiaTau * (1 - decay), velocity: velocity * decay };
}
/** Release velocity (rad/s) from timed samples of an unwrapped angle; 0 after a pause, capped. */
export function releaseVelocity(samples: { t: number; v: number }[], now: number): number {
  const recent = samples.filter(s => now - s.t <= ORBIT.sampleMs);
  if (recent.length < 2 || now - recent[recent.length - 1].t > ORBIT.pauseMs) return 0;
  const a = recent[0], b = recent[recent.length - 1], dt = (b.t - a.t) / 1000;
  return dt > 0 ? clampNumber((b.v - a.v) / dt, -ORBIT.maxSpeed, ORBIT.maxSpeed) : 0;
}
/** Wheel zoom factor for a wheel event's delta (pixel / line / page modes). */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.exp(-clampNumber(px, -600, 600) * ORBIT.wheelPerPixel);
}

const reducedMotionQuery = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null);
const raf = (cb: FrameRequestCallback): number => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(cb) : (setTimeout(() => cb(performance.now()), 16) as unknown as number));
const caf = (id: number) => { if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(id); else clearTimeout(id); };

export type OrbitOptions = { initial: OrbitCamera; resetKey: string; limits: OrbitLimits; rotate: boolean; zoom: boolean };
type Drag = { id: number; x: number; y: number; start: OrbitCamera; width: number; moved: boolean; samples: { t: number; yaw: number; pitch: number }[] };

export function useOrbitCamera({ initial, resetKey, limits, rotate, zoom }: OrbitOptions) {
  const [camera, setCameraState] = useState<OrbitCamera>(initial);
  const [interacting, setInteracting] = useState(false);
  const [autoRotating, setAutoRotating] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => !!reducedMotionQuery()?.matches);
  const cam = useRef(camera);
  const opts = useRef({ initial, limits, rotate, zoom });
  useLayoutEffect(() => { cam.current = camera; opts.current = { initial, limits, rotate, zoom }; });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<Drag | null>(null);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const suppress = useRef(false);
  const pending = useRef<OrbitCamera | null>(null);
  const lastCommit = useRef(0);
  /** animation-frame bookkeeping (one mutable object: the unmount cleanup releases whatever is pending) */
  const anim = useRef<{ id: number | null; flush: number | null; settle: number | null; unsuppress: number | null; last: number; vyaw: number; vpitch: number; auto: boolean }>({ id: null, flush: null, settle: null, unsuppress: null, last: 0, vyaw: 0, vpitch: 0, auto: false });
  const [target, setTarget] = useState<Element | null>(null);
  const mounted = useRef(true);

  const commit = useCallback((next: OrbitCamera) => { cam.current = next; lastCommit.current = performance.now(); setCameraState(next); }, []);
  /** Leading update, then at most one trailing update per animation frame (coalesces high-rate pointer input). */
  const schedule = useCallback((next: OrbitCamera) => {
    cam.current = next;
    const a = anim.current;
    if (a.flush === null && performance.now() - lastCommit.current >= 12) { commit(next); return; }
    pending.current = next;
    if (a.flush === null) a.flush = raf(() => { a.flush = null; if (pending.current && mounted.current) { const p = pending.current; pending.current = null; commit(p); } });
  }, [commit]);
  /** Cancels inertia / auto-rotation; true when something was moving. */
  const haltAnimation = useCallback(() => {
    const a = anim.current, moving = a.id !== null || a.auto;
    if (a.id !== null) caf(a.id);
    a.id = null; a.vyaw = 0; a.vpitch = 0;
    if (a.auto) { a.auto = false; setAutoRotating(false); }
    return moving;
  }, []);
  /** Stops any motion and ends the moving state it held (the viewer returns to its rest quality). */
  const stopAnimation = useCallback(() => { if (haltAnimation()) setInteracting(false); }, [haltAnimation]);
  const animate = useCallback(() => {
    const a = anim.current;
    if (a.id !== null) return;
    a.last = performance.now();
    const step = (t: number) => {
      if (!mounted.current) return;
      const dt = clampNumber((t - a.last) / 1000, 0, ORBIT.maxStep); a.last = t;
      const c = cam.current, l = opts.current.limits;
      let yaw = c.yaw, pitch = c.pitch;
      if (a.auto) yaw += ORBIT.autoSpeed * dt;
      else {
        const sy = inertiaStep(a.vyaw, dt), sp = inertiaStep(a.vpitch, dt);
        yaw += sy.delta; pitch += sp.delta; a.vyaw = sy.velocity; a.vpitch = sp.velocity;
      }
      commit({ yaw: wrapAngle(yaw), pitch: clampNumber(pitch, l.pitchMin, l.pitchMax), zoom: c.zoom });
      if (a.auto || Math.hypot(a.vyaw, a.vpitch) > ORBIT.stopSpeed) a.id = raf(step);
      else { a.id = null; a.vyaw = 0; a.vpitch = 0; setInteracting(false); }
    };
    a.id = raf(step);
  }, [commit]);

  // content-keyed reset (never on object identity): state is adjusted while rendering (React's pattern for a prop change), and the
  // gesture / animation bookkeeping is released after commit
  const [shownKey, setShownKey] = useState(resetKey);
  if (shownKey !== resetKey) { setShownKey(resetKey); setCameraState(initial); setInteracting(false); setAutoRotating(false); }
  useEffect(() => {
    const a = anim.current;
    if (a.id !== null) caf(a.id);
    if (a.settle !== null) caf(a.settle);
    if (a.unsuppress !== null) caf(a.unsuppress);
    a.id = null; a.settle = null; a.unsuppress = null; a.vyaw = 0; a.vpitch = 0; a.auto = false;
    drag.current = null; pinch.current = null; pointers.current.clear(); pending.current = null; suppress.current = false;
  }, [resetKey]);
  useEffect(() => {
    const q = reducedMotionQuery();
    if (!q) return;
    const on = () => { setReducedMotion(q.matches); if (q.matches) stopAnimation(); };
    q.addEventListener?.("change", on);
    return () => q.removeEventListener?.("change", on);
  }, [stopAnimation]);
  useEffect(() => {
    const a = anim.current, alive = mounted;
    alive.current = true;
    return () => {
      alive.current = false;
      if (a.id !== null) caf(a.id);
      if (a.flush !== null) caf(a.flush);
      if (a.settle !== null) caf(a.settle);
      if (a.unsuppress !== null) caf(a.unsuppress);
      a.id = null; a.flush = null; a.settle = null; a.unsuppress = null;
    };
  }, []);

  const reset = useCallback(() => { stopAnimation(); setInteracting(false); commit(opts.current.initial); }, [commit, stopAnimation]);
  const rotateBy = useCallback((dyaw: number, dpitch: number) => {
    if (!opts.current.rotate) return;
    stopAnimation(); const c = cam.current, l = opts.current.limits;
    commit({ yaw: wrapAngle(c.yaw + dyaw), pitch: clampNumber(c.pitch + dpitch, l.pitchMin, l.pitchMax), zoom: c.zoom });
  }, [commit, stopAnimation]);
  const zoomBy = useCallback((factor: number) => {
    if (!opts.current.zoom) return;
    const c = cam.current, l = opts.current.limits;
    commit({ ...c, zoom: clampNumber(c.zoom * factor, l.zoomMin, l.zoomMax) });
  }, [commit]);
  /** Fit the whole model in the viewer again, keeping the student's orientation. */
  const fit = useCallback(() => { stopAnimation(); commit({ ...cam.current, zoom: 1 }); }, [commit, stopAnimation]);
  const setAutoRotate = useCallback((on: boolean) => {
    if (!on || reducedMotion || !opts.current.rotate) { stopAnimation(); setInteracting(false); return; }
    stopAnimation(); anim.current.auto = true; setAutoRotating(true); setInteracting(true); animate();
  }, [animate, reducedMotion, stopAnimation]);

  const onPointerDown = useCallback((e: ReactPointerEvent<Element>) => {
    const o = opts.current, a = anim.current;
    // a new press decides its own click: a suppression still pending from an earlier gesture is dropped
    if (a.unsuppress !== null) { caf(a.unsuppress); a.unsuppress = null; }
    if (e.isPrimary) {
      // a primary pointer starts a new gesture: anything still recorded is left over from a release that never reached the viewer (it
      // would turn every later tap into a "pinch" and swallow its click), so the gesture state starts clean
      pointers.current.clear(); pinch.current = null; drag.current = null;
    }
    if (!o.rotate && !o.zoom) return;
    // a touch stops inertia / auto-rotation; the moving state is kept until the gesture is known (a drag keeps it, a click ends it)
    haltAnimation();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && o.zoom) {
      const [p, q] = [...pointers.current.values()];
      pinch.current = { dist: Math.max(1, Math.hypot(p.x - q.x, p.y - q.y)), zoom: cam.current.zoom };
      drag.current = null; suppress.current = true; setInteracting(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
      return;
    }
    if (pointers.current.size > 1) return;
    // a single press always starts unsuppressed, whether or not the scene can be rotated (a zoom-only scene still selects)
    suppress.current = false;
    if (!o.rotate) return;
    const width = (e.currentTarget as Element).getBoundingClientRect?.().width || 720;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: cam.current, width, moved: false, samples: [] };
  }, [haltAnimation]);
  const onPointerMove = useCallback((e: ReactPointerEvent<Element>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinch.current, l = opts.current.limits;
    if (p && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      schedule({ ...cam.current, zoom: clampNumber(p.zoom * Math.hypot(a.x - b.x, a.y - b.y) / p.dist, l.zoomMin, l.zoomMax) });
      return;
    }
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved) {
      if (Math.hypot(dx, dy) <= ORBIT.dragThresholdPx) return;
      d.moved = true; suppress.current = true; setInteracting(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    const k = radiansPerPixel(d.width), now = performance.now();
    d.samples.push({ t: now, yaw: d.start.yaw + dx * k, pitch: d.start.pitch - dy * k * ORBIT.pitchFactor });
    while (d.samples.length > 12) d.samples.shift();
    schedule(dragCamera(d.start, dx, dy, d.width, l));
  }, [schedule]);
  const end = useCallback((e: ReactPointerEvent<Element>) => {
    pointers.current.delete(e.pointerId);
    if (suppress.current && pointers.current.size === 0) {
      // the click a browser sends for the drag / pinch that just ended arrives in this same task and is swallowed; from the next frame
      // on the flag is cleared, so it can never swallow a later, unrelated activation of a part
      const a = anim.current;
      if (a.unsuppress !== null) caf(a.unsuppress);
      a.unsuppress = raf(() => { a.unsuppress = null; suppress.current = false; });
    }
    // the last coalesced camera of the gesture is applied now, never dropped
    if (pending.current) { const p = pending.current; pending.current = null; commit(p); }
    if (pinch.current) { if (pointers.current.size < 2) { pinch.current = null; setInteracting(false); } return; }
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (!d.moved) {
      // a click that stopped a moving model: the drawing the student clicked on stays until the click has been delivered, then the
      // viewer returns to its rest quality (next frame)
      const a = anim.current;
      if (a.settle === null) a.settle = raf(() => { a.settle = null; if (mounted.current && !drag.current && !pinch.current && a.id === null && !a.auto) setInteracting(false); });
      return;
    }
    const now = performance.now();
    const vyaw = releaseVelocity(d.samples.map(s => ({ t: s.t, v: s.yaw })), now), vpitch = releaseVelocity(d.samples.map(s => ({ t: s.t, v: s.pitch })), now);
    if (!reducedMotion && Math.hypot(vyaw, vpitch) > ORBIT.stopSpeed * 4) { anim.current.vyaw = vyaw; anim.current.vpitch = vpitch; animate(); }
    else setInteracting(false);
  }, [animate, commit, reducedMotion]);
  const onKeyDown = useCallback((e: ReactKeyboardEvent<Element>): boolean => {
    const o = opts.current, k = e.key;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(k)) {
      if (!o.rotate) return false;
      rotateBy(k === "ArrowLeft" ? -ORBIT.keyYaw : k === "ArrowRight" ? ORBIT.keyYaw : 0, k === "ArrowUp" ? ORBIT.keyPitch : k === "ArrowDown" ? -ORBIT.keyPitch : 0);
      return true;
    }
    if ((k === "+" || k === "=") && o.zoom) { stopAnimation(); zoomBy(ORBIT.keyZoom); return true; }
    if (k === "-" && o.zoom) { stopAnimation(); zoomBy(1 / ORBIT.keyZoom); return true; }
    if (k === "Home") { reset(); return true; }
    return false;
  }, [reset, rotateBy, stopAnimation, zoomBy]);

  // wheel zoom only when deliberate (the viewer has focus, or Ctrl / ⌘ — a trackpad pinch): page scrolling never gets hijacked
  const attachTo = useCallback((el: Element | null) => { setTarget(el); }, []);
  useEffect(() => {
    const el = target;
    if (!el || !zoom) return;
    const onWheel = (ev: Event) => {
      const w = ev as WheelEvent;
      if (!(w.ctrlKey || w.metaKey || document.activeElement === el)) return;
      w.preventDefault(); stopAnimation();
      const c = cam.current, l = opts.current.limits;
      commit({ ...c, zoom: clampNumber(c.zoom * wheelZoomFactor(w.deltaY, w.deltaMode), l.zoomMin, l.zoomMax) });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [target, zoom, commit, stopAnimation]);

  /** True (once) when the pointer sequence that produced a click was a camera gesture — the click must not select anything. */
  const consumeSuppressedClick = useCallback(() => { const s = suppress.current; suppress.current = false; return s; }, []);
  return {
    camera, interacting, autoRotating, reducedMotion, reset, rotateBy, zoomBy, fit, setAutoRotate, consumeSuppressedClick, attachTo, onKeyDown,
    pointerHandlers: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end }
  };
}
