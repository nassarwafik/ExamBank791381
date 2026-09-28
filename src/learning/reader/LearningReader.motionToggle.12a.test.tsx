// @vitest-environment happy-dom
// Phase 12A — «حركة الرسوم»: the desktop reduced-motion scenario end-to-end through the REAL Reader + content registry
// + visual registry. The OS hint (matchMedia) says "reduce" → the illustration is a still frame and the control offers
// «تشغيل حركة الرسوم»; pressing it records the device choice and the very same figure gains its SMIL motion; pressing
// again switches it off. Without an OS preference the control offers «إيقاف…». The control survives presentation mode
// and the Reader-plus-training host. The OS hint is still honoured when nothing was chosen (reduced-motion support kept).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, act } from "@testing-library/react";
import LearningReader from "./LearningReader";
import LearningReaderWithTraining from "../training/LearningReaderWithTraining";
import { makeImmediateApi } from "./readerFixtures";
import { MOTION_OVERRIDE_KEY, setMotionOverride } from "../../ui/motionPreference";

const SLOW = { timeout: 8000 };
const PAGE = "791381-m01-l01-p01";                       // «ما هي الشبكة؟» — carries the animated network visual
const ALT = /أجهزة متصلة/;
function setOs(reduced: boolean) {
  (window as unknown as { matchMedia: unknown }).matchMedia = () => ({ matches: reduced, media: "(prefers-reduced-motion: reduce)", addEventListener() {}, removeEventListener() {} });
}
const toggle = () => document.querySelector(".learning-reader-motion-toggle") as HTMLButtonElement;
const smil = () => document.querySelectorAll("svg.eb-visual animateMotion").length;

beforeEach(() => { try { localStorage.removeItem(MOTION_OVERRIDE_KEY); } catch { /* ignore */ } setMotionOverride(null); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); setMotionOverride(null); document.body.style.overflow = ""; });

describe("the Reader's motion control against the real book page", () => {
  it("OS reduce → still frame + «تشغيل حركة الرسوم»; press → SMIL appears, choice stored; press again → still frame, stored 'off'", async () => {
    setOs(true);
    render(<LearningReader courseId="791381" onExit={vi.fn()} initialPageId={PAGE} />);
    await screen.findByRole("img", { name: ALT }, SLOW);
    expect(smil()).toBe(0);
    expect(toggle().textContent).toBe("تشغيل حركة الرسوم");
    expect(toggle().getAttribute("aria-pressed")).toBe("false");
    await act(async () => { fireEvent.click(toggle()); });
    await waitFor(() => expect(smil()).toBeGreaterThan(0));
    expect(localStorage.getItem(MOTION_OVERRIDE_KEY)).toBe("on");
    expect(toggle().textContent).toBe("إيقاف حركة الرسوم");
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    // the figure itself never left the page (same title, same accessible name)
    expect(screen.getByRole("img", { name: ALT })).toBeTruthy();
    await act(async () => { fireEvent.click(toggle()); });
    await waitFor(() => expect(smil()).toBe(0));
    expect(localStorage.getItem(MOTION_OVERRIDE_KEY)).toBe("off");
    expect(toggle().textContent).toBe("تشغيل حركة الرسوم");
  });
  it("no OS preference → motion plays and the control offers «إيقاف حركة الرسوم»; a stored 'on' choice survives a remount", async () => {
    setOs(false);
    const first = render(<LearningReader courseId="791381" onExit={vi.fn()} initialPageId={PAGE} />);
    await screen.findByRole("img", { name: ALT }, SLOW);
    expect(smil()).toBeGreaterThan(0);
    expect(toggle().textContent).toBe("إيقاف حركة الرسوم");
    first.unmount();
    // the device already chose "on" while the OS says reduce (e.g. after a reload on that desktop)
    setOs(true);
    localStorage.setItem(MOTION_OVERRIDE_KEY, "on");
    render(<LearningReader courseId="791381" onExit={vi.fn()} initialPageId={PAGE} />);
    await screen.findByRole("img", { name: ALT }, SLOW);
    expect(smil()).toBeGreaterThan(0);
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
  });
  it("reduced-motion support is intact: OS reduce with nothing chosen keeps the still frame (no motion sneaks in)", async () => {
    setOs(true);
    render(<LearningReader courseId="791381" onExit={vi.fn()} initialPageId={PAGE} />);
    await screen.findByRole("img", { name: ALT }, SLOW);
    expect(smil()).toBe(0);
    expect(document.querySelectorAll("svg.eb-visual .eb-visual-pulse").length).toBe(0);
    expect(localStorage.getItem(MOTION_OVERRIDE_KEY)).toBeNull();
  });
});

describe("the control lives in the topbar in every host and mode", () => {
  it("presentation mode keeps the motion control next to the presentation toggle; leaving presentation keeps it too", async () => {
    setOs(false);
    render(<LearningReader courseId="791381" onExit={vi.fn()} api={makeImmediateApi()} />);
    await screen.findByRole("heading", { level: 2, name: "صفحة غنية" });
    expect(toggle()).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "وضع العرض" }));
    await waitFor(() => expect(document.querySelector(".learning-reader.is-presentation")).toBeTruthy());
    expect(document.querySelector(".learning-reader-topbar .learning-reader-motion-toggle")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "خروج من وضع العرض" }));
    await waitFor(() => expect(document.querySelector(".learning-reader.is-presentation")).toBeNull());
    expect(toggle()).toBeTruthy();
  });
  it("the Reader-plus-training host (student / teacher wrapper) renders the same Reader: the control, the page and the training blocks", async () => {
    setOs(true);
    render(<LearningReaderWithTraining courseId="791381" api={makeImmediateApi()} onExit={vi.fn()} exitLabel="رجوع" client={null} actor="teacher" />);
    await screen.findByRole("heading", { level: 2, name: "صفحة غنية" });
    expect(toggle().textContent).toBe("تشغيل حركة الرسوم");
    // the header renders from the manifest first; the section heading arrives with the lazily loaded page body
    expect((await screen.findByRole("heading", { level: 3, name: "عنوان داخلي" })).className).toBe("learning-reader-heading is-level-2");
    expect(screen.getByRole("button", { name: "رجوع" })).toBeTruthy();
    // the choice made here is the same device-level store the student's Reader reads
    await act(async () => { fireEvent.click(toggle()); });
    expect(localStorage.getItem(MOTION_OVERRIDE_KEY)).toBe("on");
  });
});
