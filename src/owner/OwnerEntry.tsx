import { Suspense, lazy } from "react";
import { lazyWithRetry } from "../lazyWithRetry";

// Tadris+ P1-A2 — the only static link from the startup bundle to the owner area: a lazy boundary. The owner screens (OwnerApp and
// everything it imports) load only when #/owner is opened, so teachers and students never download them (bundle guard).
const OwnerApp = lazy(lazyWithRetry(() => import("./OwnerApp"), "owner-app"));

export default function OwnerEntry() {
  return <Suspense fallback={null}><OwnerApp /></Suspense>;
}
