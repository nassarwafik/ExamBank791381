import { Suspense, lazy } from "react";
import { lazyWithRetry } from "../lazyWithRetry";

// Tadris+ QR-2 — the only static link from the startup bundle to the QR approval page: a lazy boundary (bundle guard).
const QrApp = lazy(lazyWithRetry(() => import("./QrApp"), "qr-app"));

export default function QrEntry() {
  return <Suspense fallback={null}><QrApp /></Suspense>;
}
