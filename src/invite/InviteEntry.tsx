import { Suspense, lazy } from "react";
import { lazyWithRetry } from "../lazyWithRetry";

// Tadris+ P2-A2b — the only static link from the startup bundle to the invitation page: a lazy boundary (bundle guard).
const InviteApp = lazy(lazyWithRetry(() => import("./InviteApp"), "invite-app"));

export default function InviteEntry() {
  return <Suspense fallback={null}><InviteApp /></Suspense>;
}
