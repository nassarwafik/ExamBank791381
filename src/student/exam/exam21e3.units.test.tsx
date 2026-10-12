// @vitest-environment happy-dom
// Phase 21E.3 — unit pins: timer / save announcement rules, the recovery card over a real lazy chunk failure, LTR islands, the
// touch-target / clearance / text-scaling CSS rules, and the short visual-question instruction with its keyboard guide.
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Suspense, type ComponentType } from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { timerAnnouncement, saveAnnouncement, timerNoticeKey, readTimerNotices, writeTimerNotices, TIMER_THRESHOLDS_MS } from "./examAnnouncements";
import QuestionErrorBoundary from "./QuestionErrorBoundary";
import { QuestionRecoveryContext } from "./questionRecovery";
import { recoverableLazy } from "../../recoverableLazy";
import { isolateLtr, BRAND_LTR, GRADE_LTR } from "../../ui/ltrIsland";
import HotspotView from "../../visual/HotspotView";

afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); });
const repo = path.resolve(__dirname, "..", "..", "..");
const css = (f: string) => fs.readFileSync(path.join(repo, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("timerAnnouncement — 5 min and 1 min, once each, never per second", () => {
  const none = new Set<number>();
  it("nothing above 5 minutes, at expiry or for an invalid value", () => {
    for (const ms of [300_001, 3_600_000, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(timerAnnouncement(ms, none)).toBeNull();
  });
  it("the 5-minute crossing (boundary included) and the 1-minute crossing", () => {
    expect(timerAnnouncement(300_000, none)).toEqual({ text: "تنبيه: بقيت 5 دقائق على انتهاء وقت المحاولة.", record: [300_000] });
    expect(timerAnnouncement(299_000, none)?.text).toBe("تنبيه: بقيت 5 دقائق على انتهاء وقت المحاولة.");
    expect(timerAnnouncement(60_000, new Set([300_000]))).toEqual({ text: "تنبيه: بقيت دقيقة واحدة على انتهاء وقت المحاولة.", record: [300_000, 60_000] });
  });
  it("a threshold already announced is never repeated (rerender / resync / resume)", () => {
    expect(timerAnnouncement(250_000, new Set([300_000]))).toBeNull();
    expect(timerAnnouncement(30_000, new Set([300_000, 60_000]))).toBeNull();
  });
  it("starting or resuming below a threshold says «less than», and a jump past both announces only the lower one", () => {
    expect(timerAnnouncement(180_000, none)).toEqual({ text: "تنبيه: بقي أقل من 5 دقائق على انتهاء وقت المحاولة.", record: [300_000] });
    expect(timerAnnouncement(30_000, none)).toEqual({ text: "تنبيه: بقي أقل من دقيقة واحدة على انتهاء وقت المحاولة.", record: [300_000, 60_000] });
  });
  it("is remembered per attempt identity in this tab only (threshold numbers, nothing else)", () => {
    const k1 = timerNoticeKey("asg", 1, "2026-01-01T10:00:00.000Z"), k2 = timerNoticeKey("asg", 2, "2026-01-01T12:00:00.000Z");
    writeTimerNotices(k1, new Set([300_000]));
    expect([...readTimerNotices(k1)]).toEqual([300_000]);
    expect([...readTimerNotices(k2)]).toEqual([]);                                  // a new attempt starts clean
    sessionStorage.setItem(k1, JSON.stringify([300_000, "x", 7, 60_000]));
    expect([...readTimerNotices(k1)].sort()).toEqual([...TIMER_THRESHOLDS_MS].sort()); // only known thresholds are trusted
    sessionStorage.setItem(k1, "{not json");
    expect([...readTimerNotices(k1)]).toEqual([]);
  });
});

describe("saveAnnouncement — only the changes a student must know about", () => {
  it("the ordinary cycle of an edit is silent", () => {
    let open = false;
    for (const [a, b] of [["saved", "pending"], ["pending", "saving"], ["saving", "saved"], ["saved", "saved"], ["pending", "retrying"], ["retrying", "saving"], ["saving", "saved"]] as const) {
      const r = saveAnnouncement(a, b, open); expect(r.text).toBeNull(); open = r.problemOpen;
    }
    expect(open).toBe(false);
    expect(saveAnnouncement(null, "offline", false).text).toBeNull();                  // the first observation is never announced
  });
  it("offline and failed are announced; saved again is announced only after one of them", () => {
    const off = saveAnnouncement("pending", "offline", false);
    expect(off).toEqual({ text: "انقطع الاتصال — توجد تغييرات لم تصل إلى الخادم. أبقِ الصفحة مفتوحة حتى يعود الاتصال.", problemOpen: true });
    expect(saveAnnouncement("offline", "saving", true)).toEqual({ text: null, problemOpen: true });
    expect(saveAnnouncement("saving", "saved", true)).toEqual({ text: "تم حفظ إجاباتك على الخادم.", problemOpen: false });
    expect(saveAnnouncement("retrying", "error", false)).toEqual({ text: "تعذر حفظ التغييرات. أبقِ الصفحة مفتوحة وأعد المحاولة.", problemOpen: true });
    expect(saveAnnouncement("retrying", "saved", false).text).toBeNull();             // a silent retry that worked stays silent
  });
});

describe("QuestionErrorBoundary over a REAL lazy chunk failure", () => {
  const origin = window.location.origin;
  const chunkError = (name: string) => new TypeError("Failed to fetch dynamically imported module: " + origin + "/assets/" + name + "-abcd1234.js");
  it("chunk failure → card (no internals) → «إعادة المحاولة» → the question renders; the failed React.lazy is replaced", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    const Renderer = recoverableLazy<object>("UnitRenderer", () => (++calls === 1 ? Promise.reject(chunkError("UnitRenderer")) : Promise.resolve({ default: () => <p>تم تحميل السؤال</p> })) as Promise<{ default: ComponentType<object> }>);
    const announce = vi.fn();
    render(<QuestionRecoveryContext.Provider value={{ reloadAllowed: false, strict: false, announce }}><QuestionErrorBoundary resetKey="q1"><Suspense fallback={<i>…</i>}><Renderer /></Suspense></QuestionErrorBoundary></QuestionRecoveryContext.Provider>);
    const card = await screen.findByTestId("question-recovery");
    expect(card.textContent).not.toMatch(/Failed|assets|\.js|TypeError|abcd1234/);
    expect(announce).toHaveBeenCalledWith("تعذّر عرض هذا السؤال الآن");
    expect((console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.find(c => c[0] === "[QuestionErrorBoundary]")?.[1]).toEqual({ code: "chunk-load" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" })); });
    expect(await screen.findByText("تم تحميل السؤال")).toBeTruthy();
    expect(calls).toBe(2);
  });
  it("a new question (resetKey) starts clean; a custom fallback replaces the card", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Boom = () => { throw new Error("x"); };
    const { rerender } = render(<QuestionErrorBoundary resetKey="a" fallback={<p>نص السؤال</p>}><Boom /></QuestionErrorBoundary>);
    expect(screen.getByText("نص السؤال")).toBeTruthy();
    expect(screen.queryByTestId("question-recovery")).toBeNull();
    rerender(<QuestionErrorBoundary resetKey="b"><p>سؤال آخر</p></QuestionErrorBoundary>);
    expect(screen.getByText("سؤال آخر")).toBeTruthy();
  });
});

describe("LTR islands (S-6) — markup only, the text itself unchanged", () => {
  it("isolateLtr wraps every match in <bdi dir=ltr> and keeps the exact text", () => {
    const { container } = render(<p>{isolateLtr("وأصبحت علامتك 8.5/10، ثم 7/10.", GRADE_LTR)}</p>);
    expect(container.textContent).toBe("وأصبحت علامتك 8.5/10، ثم 7/10.");
    expect([...container.querySelectorAll('bdi[dir="ltr"]')].map(b => b.textContent)).toEqual(["8.5/10", "7/10"]);
    const brand = render(<p>{isolateLtr("افتح Tadris+ من أيقونة", BRAND_LTR)}</p>).container;
    expect(brand.querySelector("bdi")?.textContent).toBe("Tadris+");
    expect(isolateLtr("لا شيء هنا", BRAND_LTR)).toBe("لا شيء هنا");
  });
  it("the notification grade, the install brand and the physics energy title are isolated in their components", () => {
    const bell = fs.readFileSync(path.join(repo, "src/notifications/NotificationBell.tsx"), "utf8");
    expect(bell).toMatch(/isolateLtr\(view\.preview, GRADE_LTR\)/);
    // Outside comments, every «Tadris+» the install card / entry renders sits in its own <bdi dir="ltr">.
    const code = (f: string) => fs.readFileSync(path.join(repo, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const f of ["src/pwa/InstallAppCard.tsx", "src/pwa/InstallAppEntry.tsx"]) {
      const src = code(f);
      expect(src, f).toMatch(/<bdi dir="ltr">Tadris\+<\/bdi>/);
      expect(src.replace(/<bdi dir="ltr">Tadris\+<\/bdi>/g, ""), f).not.toContain("Tadris+");
    }
    const lab = fs.readFileSync(path.join(repo, "src/physicsLab/LabScene.tsx"), "utf8");
    expect(lab).toMatch(/<text className="lab-bars-title" x=\{x0\} y=\{18\} direction="rtl" textAnchor="end">/);
  });
});

describe("CSS — phone / coarse-pointer targets, scroll clearance, text-scaled heights", () => {
  const coarse = (sheet: string) => [...css(sheet).matchAll(/@media\s*\(pointer:\s*coarse\)\s*\{([\s\S]*?)\}\s*\}/g)].map(m => m[1]).join("\n");
  it.each([
    ["src/studentexam-pro.css", [".iex-cli-input"]],
    ["src/inlineCloze/inlineCloze.css", [".cloze .cloze-input", ".cloze .cloze-select"]],
    ["src/visual/visual.css", [".vq-chip", ".vq-zone-btn", ".vq-list select", ".vq-list input", ".vq-list button"]],
    ["src/notifications/notifications.css", [".eb-notif-head-action", ".eb-notif-retry"]],
    ["src/studentportal-pro.css", [".eb-sp-reaction"]],
  ])("%s gives the listed controls 44 px on coarse pointers", (sheet, selectors) => {
    const block = coarse(sheet);
    for (const sel of selectors) expect(block, sheet + " " + sel).toContain(sel);
    expect(block).toMatch(/min-height:\s*44px/);
  });
  it("the sticky bars are cleared for focus scrolling, and the CLI screen height scales with text and viewport", () => {
    expect(css("src/studentexam-pro.css")).toMatch(/:root:has\(\.iex-bottom-nav\)\{ scroll-padding-block-start:72px; scroll-padding-block-end:96px; \}/);
    const ncli = css("src/networkCli/networkCli.css");
    expect(ncli).toMatch(/\.ncli-screen \{[^}]*max-height: min\(20rem, 55vh\)/);
    expect(ncli).not.toMatch(/\.ncli-screen \{[^}]*max-height:\s*\d+px/);
    expect(ncli).toMatch(/\.ncli-screen \{ max-height: min\(15rem, 50vh\); \}/);
  });
});

describe("visual questions — one short instruction, the keyboard steps in an expandable guide", () => {
  it("the hotspot instruction is one line; the guide is collapsed yet still describes the image for screen readers", () => {
    const IMG = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    const q = { hotspot: { v: 1, mode: "single", selections: 1, alt: "مخطط" }, image: { exists: true, visible: true, assets: [{ dataUrl: IMG, origin: "uploaded", contentType: "image/svg+xml" }] } };
    render(<HotspotView q={q as never} id="h1" answer={undefined} onAnswer={() => {}} labelPrefix="السؤال 1" textId="t1" />);
    const note = document.querySelector(".hotspot-response .vq-note") as HTMLElement;
    expect(note.textContent).toBe("انقر على الموضع المطلوب في الصورة.");
    const guide = document.querySelector("details.vq-keyboard-guide") as HTMLDetailsElement;
    expect(guide.open).toBe(false);
    expect(guide.querySelector("summary")?.textContent).toBe("كيف أستخدم لوحة المفاتيح؟");
    const overlay = document.querySelector(".vq-overlay") as HTMLElement;
    const ids = (overlay.getAttribute("aria-describedby") || "").split(" ");
    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids[1])?.textContent).toContain("الأسهم لتحريك المؤشر ثم Enter");
  });
});
