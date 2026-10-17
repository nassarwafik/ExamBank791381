// @vitest-environment happy-dom
// «عرض المزيد» in سجل النشاط moves keyboard focus to the first newly revealed row, also when the click lands while React still
// holds the PREVIOUS commit's passive effects (the data-load commit happens outside any act(), so its effects run in a later
// task — a busy machine lets a click arrive first). React then flushes that stale effect before rendering the click's update:
// the focus request must survive it and be served by the render that actually shows the new rows.
import { describe, it, expect, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import AuditHistoryPanel from "./AuditHistoryPanel";
import type { AuditEvent } from "./auditLog";

const pad = (i: number) => String(i).padStart(3, "0");
const event = (i: number): AuditEvent => ({ eventId: "e" + i, timestamp: new Date(Date.parse("2026-01-01T00:00:00.000Z") + i * 3600000).toISOString(), actor: "t",
  action: "class.create", targetType: "class", targetId: "t" + i, targetLabel: "سجل-" + pad(i), details: {} }) as AuditEvent;
let root: Root | null = null;
let host: HTMLElement | null = null;
const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnv = g.IS_REACT_ACT_ENVIRONMENT;
afterEach(() => { root?.unmount(); host?.remove(); root = null; host = null; g.IS_REACT_ACT_ENVIRONMENT = previousActEnv; vi.restoreAllMocks(); });

describe("AuditHistoryPanel — focus after «عرض المزيد»", () => {
  it("lands on the first new row even when the click arrives before the load commit's effects have run", async () => {
    g.IS_REACT_ACT_ENVIRONMENT = false;                                     // a real browser: no act() batching anywhere
    const events = Array.from({ length: 100 }, (_, k) => event(100 - k));
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, events, count: 100, limit: 100 }) }) as Response) as unknown as typeof fetch;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    root.render(<AuditHistoryPanel token="t" />);
    // Click the moment the rows are in the DOM: inside the MutationObserver callback (a microtask after the commit), i.e.
    // BEFORE React's scheduled task runs that commit's passive effects.
    await new Promise<void>(resolve => {
      const observer = new MutationObserver(() => {
        const button = [...host!.querySelectorAll("button")].find(b => b.textContent === "عرض المزيد");
        if (!button || host!.querySelectorAll(".audit-history-table tbody tr").length !== 30) return;
        observer.disconnect();
        button.click();
        resolve();
      });
      observer.observe(host!, { childList: true, subtree: true });
    });
    await new Promise(r => setTimeout(r, 50));                              // let React finish the click's render and effects
    expect(host.querySelectorAll(".audit-history-table tbody tr")).toHaveLength(60);
    const focused = document.activeElement as HTMLElement;
    expect(focused.tagName).toBe("TR");
    expect(focused.children[3].textContent).toBe("سجل-070");                // the 31st newest = the first newly revealed row
  });
});
