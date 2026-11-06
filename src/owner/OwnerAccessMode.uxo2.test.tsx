// @vitest-environment happy-dom
// UX-O2 — «وضع الصلاحيات» as three stages, readiness as a checklist, and what observe recorded as a table (design
// docs/enterprise-ux-owner-console-o2.md §2.2), against a mocked API (TEST data only). PRESENTATION ONLY: pins of the new layout
// and of the button labels the runbook quotes (docs/operations-access-enforcement.md), which must not change.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import OwnerAccessMode from "./OwnerAccessMode";

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
let routes: Record<string, () => { status: number; body: unknown }> = {};
beforeEach(() => {
  routes = {};
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const h = routes[String(init.method || "GET") + " " + url];
    if (!h) return json(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
    const r = h();
    return json(r.status, r.body);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const CAPS = [
  { id: "reports.dashboard.view", module: "reports", moduleLabel: "التقارير", label: "لوحات التقارير", ownerOnly: false },
  { id: "messages.announce.send", module: "messages", moduleLabel: "الرسائل", label: "إرسال إعلان", ownerOnly: false }
];
const T = (over = {}) => ({ accountId: "t_000000000000000a", username: "t.a", displayName: "سارة", status: "active", access: { revisionId: "ar_x", preset: { id: "learning-only", version: 1 } }, defaultAccess: null, wouldDeny: [], ...over });
const serve = (mode: string, ready: boolean, teachers: unknown[] = [T()]) => {
  routes["GET /api/owner-access"] = () => ({ status: 200, body: { ok: true, mode, presets: [], capabilities: CAPS } });
  routes["GET /api/owner-access/readiness"] = () => ({ status: 200, body: { ok: true, mode, ready, teachers } });
};
const stages = () => screen.getByRole("list", { name: "مراحل وضع الصلاحيات" });
const buttons = () => within(screen.getByRole("region", { name: "جاهزية التطبيق" })).getAllByRole("button").map(b => b.textContent);

describe("UX-O2 «وضع الصلاحيات» — stages, checklist, table", () => {
  it.each([["legacy", "عادي", ["تفعيل التطبيق", "تشغيل المراقبة"]], ["observe", "مراقبة", ["تفعيل التطبيق", "إيقاف المراقبة"]], ["enforce", "تطبيق", ["إيقاف التطبيق (العودة إلى المراقبة)"]]] as const)(
    "%s: the current stage is marked, the earlier ones are said to be complete, and the runbook's button labels are offered", async (mode, label, offered) => {
      serve(mode, true);
      render(<OwnerAccessMode token="t" onSignedOut={vi.fn()} />);
      await screen.findByRole("region", { name: "جاهزية التطبيق" });
      const items = within(stages()).getAllByRole("listitem");
      expect(items.map(li => li.textContent!.replace(" (مكتملة)", ""))).toEqual(["عادي", "مراقبة", "تطبيق"]);
      expect(items.find(li => li.getAttribute("aria-current") === "step")!.textContent).toBe(label);
      expect(buttons()).toEqual(offered);
    });

  it("an invalid mode on the server: no stages, the warning in words", async () => {
    serve("invalid", false);
    render(<OwnerAccessMode token="t" onSignedOut={vi.fn()} />);
    expect(await screen.findByText(/إعداد الوضع على الخادم غير صالح/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "مراحل وضع الصلاحيات" })).toBeNull();
  });

  it("readiness is a checklist: ✗ with the names when a teacher has no package, and «تفعيل التطبيق» stays disabled", async () => {
    serve("observe", false, [T(), T({ accountId: "t_b", displayName: "عمر", access: null, defaultAccess: "none" }), T({ accountId: "t_c", displayName: "هدى", status: "suspended", access: null, defaultAccess: "none" })]);
    render(<OwnerAccessMode token="t" onSignedOut={vi.fn()} />);
    const region = await screen.findByRole("region", { name: "جاهزية التطبيق" });
    const first = within(region).getAllByRole("listitem")[0];
    expect(first.querySelector(".eb-owner-check-mark")!.classList.contains("is-no")).toBe(true);
    expect(first.textContent).toContain("عمر");
    expect(first.textContent).not.toContain("هدى");
    expect(first.textContent).toContain("2 معلمين غير موقوفين، منهم 1 بلا حزمة");
    expect((within(region).getByRole("button", { name: "تفعيل التطبيق" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("what observe recorded is counted in the checklist and listed in a table: teacher, tool, times, last", async () => {
    serve("observe", true, [
      T({ wouldDeny: [{ capability: "reports.dashboard.view", count: 3, lastAt: "2026-11-05T18:40:00Z" }, { capability: "messages.announce.send", count: 1, lastAt: "2026-11-04T09:00:00Z" }] }),
      T({ accountId: "t_b", displayName: "عمر", wouldDeny: [{ capability: "reports.dashboard.view|messages.announce.send", count: 2, lastAt: "2026-11-03T09:00:00Z" }] })
    ]);
    render(<OwnerAccessMode token="t" onSignedOut={vi.fn()} />);
    const region = await screen.findByRole("region", { name: "جاهزية التطبيق" });
    expect(region.textContent).toContain("6 مرة منع محتمل لـ 2 معلمين");
    const table = screen.getByRole("table", { name: "ما كان سيُمنع" });
    expect(within(table).getAllByRole("columnheader").map(h => h.textContent)).toEqual(["المعلم", "الأداة", "المرات", "آخرها"]);
    const rows = within(table).getAllByRole("row").slice(1).map(r => [...r.querySelectorAll("th, td")].slice(0, 3).map(c => c.textContent));
    expect(rows).toEqual([["سارة", "التقارير — لوحات التقارير", "3 مرة"], ["سارة", "الرسائل — إرسال إعلان", "1 مرة"], ["عمر", "التقارير — لوحات التقارير أو الرسائل — إرسال إعلان", "2 مرة"]]);
  });

  it("observe with nothing recorded says so; no table", async () => {
    serve("observe", true);
    render(<OwnerAccessMode token="t" onSignedOut={vi.fn()} />);
    expect((await screen.findByRole("region", { name: "جاهزية التطبيق" })).textContent).toContain("لم يُسجَّل أي منع محتمل حتى الآن.");
    expect(screen.queryByRole("table")).toBeNull();
  });
});
