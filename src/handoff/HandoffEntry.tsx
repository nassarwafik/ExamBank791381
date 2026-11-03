import { Suspense, lazy } from "react";
import { lazyWithRetry } from "../lazyWithRetry";

// Tadris+ P4-D — the only static link from the startup bundle to the handoff page: a lazy boundary (bundle guard).
const HandoffApp = lazy(lazyWithRetry(() => import("./HandoffApp"), "handoff-app"));

export default function HandoffEntry() {
  return <Suspense fallback={null}><HandoffApp /></Suspense>;
}
