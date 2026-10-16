import { useLayoutEffect, useRef, useState } from "react";

// Phase 21F.9 — handlers with a stable identity that always run the LATEST implementation (the pattern of the builder's `actions`
// object), so memoized children (the Studio's question cards) are not re-rendered by a parent's fresh closures on every keystroke.
// The set of keys is fixed by the first render.
type Handler = (...args: never[]) => unknown;
export function useStableHandlers<T extends Record<string, Handler>>(impl: T): T {
  const latest = useRef(impl);
  useLayoutEffect(() => { latest.current = impl; });
  const [stable] = useState(() => Object.fromEntries(Object.keys(impl).map(key => [key, (...args: unknown[]) => (latest.current[key] as (...a: unknown[]) => unknown)(...args)])) as unknown as T);
  return stable;
}
