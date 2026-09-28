// @vitest-environment happy-dom
//
// Phase 12D — StudentProjectPanel applies a one-shot project drill against its OWN authoritative response: the exact
// project (never another one), only after its single /api/student-project-tracker read for the CURRENT token, once
// per seq (no replay, no snap-back after the student takes over), newest intent wins over an unresolved read, a
// missing / not-enrolled / failed target opens nothing and is reported, and an old session's read never answers.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, act } from "@testing-library/react";
import StudentProjectPanel from "./StudentProjectPanel";
import type { StudentProjectDrill, StudentProjectDrillOutcome } from "./studentProjectDrill";

const project = (code: string, title: string) => ({ projectCode: code, title, tracks: [{ trackId: "book", title: "الكتاب", icon: "" }], summary: { studentId: "u1", displayName: "أحمد", code: "C1", overallProgress: 40, trackProgress: { book: 40 }, counts: { not_started: 1, in_progress: 0, ready_for_review: 0, approved: 0 }, readyForReviewCount: 0, complete: false }, stages: [{ stageId: "B01", track: "book", groupId: "g1", title: "قراءة", order: 1 }], groups: [{ groupId: "g1", track: "book", title: "المرحلة", order: 1 }], progress: {}, nextStages: { book: null } });
const TWO = { ok: true, enrolled: true, className: "الصف", projects: [project("P1", "مشروع الكتاب"), project("P2", "مشروع الشبكة")] };
const ONE = { ok: true, enrolled: true, className: "الصف", projects: [project("P2", "مشروع الشبكة")] };

type Deferred = { resolve: (status: number, body: unknown) => void; reject: () => void };
let pending: Deferred[] = [], urls: string[] = [];
function deferredFetch() {
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(input) + " " + ((init?.headers as Record<string, string>)?.["x-student-token"] ?? ""));
    return new Promise<Response>((res, rej) => pending.push({
      resolve: (status, body) => res({ status, ok: status >= 200 && status < 300, json: async () => body } as Response),
      reject: () => rej(new Error("network")),
    }));
  }) as unknown as typeof fetch;
}
const settle = async (i: number, status: number, body: unknown) => { await act(async () => { pending[i].resolve(status, body); await Promise.resolve(); await Promise.resolve(); }); };
const openCode = () => document.querySelector(".eb-sp-project[data-project-code]")?.getAttribute("data-project-code") ?? null;
const cards = () => [...document.querySelectorAll(".eb-sp-project-card")].map(a => a.querySelector("h3")?.textContent);

let consumed: [number, StudentProjectDrillOutcome][] = [];
const onConsumed = (seq: number, outcome: StudentProjectDrillOutcome) => { consumed.push([seq, outcome]); };
function Panel({ token = "t1", drill = null }: { token?: string; drill?: StudentProjectDrill | null }) {
  return <StudentProjectPanel token={token} drill={drill} onDrillConsumed={onConsumed} />;
}

beforeEach(() => { pending = []; urls = []; consumed = []; deferredFetch(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("12D panel — exact project, only after its own data", () => {
  it("(3 · 5) a drill to P2 opens P2 — not P1, not the cards — with its data-project-code", async () => {
    const { rerender } = render(<Panel />);
    await settle(0, 200, TWO);
    expect(cards()).toEqual(["مشروع الكتاب", "مشروع الشبكة"]);
    rerender(<Panel drill={{ seq: 1, projectCode: "P2" }} />);
    expect(openCode()).toBe("P2");
    expect(document.querySelectorAll(".eb-sp-project")).toHaveLength(1);
    expect(cards()).toEqual([]);
    expect(consumed).toEqual([[1, "opened"]]);
    expect(screen.getByRole("button", { name: /العودة إلى المشاريع/ })).toBeTruthy();
  });

  it("(4) waits for the authoritative read: nothing is opened or reported before the response, then P2 directly (no card flash)", async () => {
    const seen: (string | null)[] = [];
    const { rerender } = render(<Panel drill={{ seq: 1, projectCode: "P2" }} />);
    expect(document.querySelector(".eb-sp-projects")).toBeNull();
    expect(consumed).toEqual([]);
    const obs = new MutationObserver(() => seen.push(openCode() ?? (cards().length ? "cards" : null)));
    obs.observe(document.body, { childList: true, subtree: true });
    await settle(0, 200, TWO);
    obs.disconnect();
    rerender(<Panel drill={{ seq: 1, projectCode: "P2" }} />);
    expect(openCode()).toBe("P2");
    expect(seen.filter(Boolean).every(v => v === "P2")).toBe(true);           // never the cards, never P1
    expect(consumed).toEqual([[1, "opened"]]);
    expect(urls).toHaveLength(1);                                               // the panel's one read, reused
  });

  it("(6) one project: the panel shows it anyway; a drill to it is consumed as opened", async () => {
    render(<Panel drill={{ seq: 4, projectCode: "P2" }} />);
    await settle(0, 200, ONE);
    expect(openCode()).toBe("P2");
    expect(consumed).toEqual([[4, "opened"]]);
    expect(screen.queryByRole("button", { name: /العودة إلى المشاريع/ })).toBeNull();   // unchanged single-project UI
  });
});

describe("12D panel — missing / not enrolled / failure", () => {
  it("(7) a code that is not in the list opens NOTHING (no first-project fallback): the cards stay, reported unavailable", async () => {
    render(<Panel drill={{ seq: 1, projectCode: "GONE" }} />);
    await settle(0, 200, TWO);
    expect(openCode()).toBeNull();
    expect(cards()).toEqual(["مشروع الكتاب", "مشروع الشبكة"]);
    expect(consumed).toEqual([[1, "unavailable"]]);
  });

  it("(9) not enrolled / no projects: renders nothing, consumed as unavailable", async () => {
    render(<Panel drill={{ seq: 1, projectCode: "P2" }} />);
    await settle(0, 200, { ok: true, enrolled: false });
    expect(document.querySelector(".eb-sp-projects")).toBeNull();
    expect(consumed).toEqual([[1, "unavailable"]]);
    cleanup(); consumed = [];
    render(<Panel drill={{ seq: 2, projectCode: "P2" }} />);
    await settle(1, 200, { ok: true, enrolled: true, projects: [] });
    expect(consumed).toEqual([[2, "unavailable"]]);
  });

  it("(10 · 11) a failed read (500, 401, ok:false, network) renders nothing and consumes the drill as failed — never pending forever", async () => {
    for (const [i, fail] of [[0, 500], [1, 401], [2, "okfalse"], [3, "network"]] as const) {
      cleanup(); consumed = [];
      render(<Panel drill={{ seq: i + 1, projectCode: "P2" }} />);
      if (fail === "network") await act(async () => { pending[i].reject(); await Promise.resolve(); await Promise.resolve(); });
      else if (fail === "okfalse") await settle(i, 200, { ok: false });
      else await settle(i, fail, { ok: false });
      expect(document.querySelector(".eb-sp-projects")).toBeNull();
      expect(consumed).toEqual([[i + 1, "failed"]]);
    }
  });
});

describe("12D panel — newest intent wins (deferred read)", () => {
  it("(12 · race A) seq1=P1 then seq2=P2 before the response: ONLY P2 opens, P1 never renders, only seq2 is reported", async () => {
    const seen = new Set<string>();
    const { rerender } = render(<Panel drill={{ seq: 1, projectCode: "P1" }} />);
    rerender(<Panel drill={{ seq: 2, projectCode: "P2" }} />);
    const obs = new MutationObserver(() => { const c = openCode(); if (c) seen.add(c); });
    obs.observe(document.body, { childList: true, subtree: true });
    await settle(0, 200, TWO);
    obs.disconnect();
    expect(openCode()).toBe("P2");
    expect([...seen]).toEqual(["P2"]);
    expect(consumed).toEqual([[2, "opened"]]);
  });

  it("(13 · race B) seq1=P1 then seq2=GONE: no project opens, the cards show, seq2 reported unavailable, P1 never resurrects", async () => {
    const { rerender } = render(<Panel drill={{ seq: 1, projectCode: "P1" }} />);
    rerender(<Panel drill={{ seq: 2, projectCode: "GONE" }} />);
    await settle(0, 200, TWO);
    expect(openCode()).toBeNull();
    expect(cards()).toHaveLength(2);
    expect(consumed).toEqual([[2, "unavailable"]]);
    rerender(<Panel drill={{ seq: 2, projectCode: "GONE" }} />);
    expect(openCode()).toBeNull();
  });

  it("(race C) a token change before the old read resolves: the old response is ignored and the drill waits for the NEW session's read", async () => {
    const { rerender } = render(<Panel token="old" drill={{ seq: 1, projectCode: "P1" }} />);
    rerender(<Panel token="new" drill={null} />);                                // the portal cleared the drill on the new session
    await settle(0, 200, TWO);                                                   // the OLD session's response lands late
    expect(document.querySelector(".eb-sp-projects")).toBeNull();
    expect(openCode()).toBeNull();
    expect(consumed).toEqual([]);
    await settle(1, 200, { ok: true, enrolled: true, projects: [project("P9", "مشروع جديد"), project("P8", "آخر")] });
    expect(cards()).toEqual(["مشروع جديد", "آخر"]);
    expect(urls.map(u => u.split(" ")[1])).toEqual(["old", "new"]);
  });

  it("(race C') even with a drill still present, an OLD session's already-loaded list never answers it on the new token", async () => {
    const { rerender } = render(<Panel token="old" />);
    await settle(0, 200, TWO);
    rerender(<Panel token="new" drill={{ seq: 5, projectCode: "P1" }} />);
    expect(openCode()).toBeNull();
    expect(consumed).toEqual([]);                                                // waits for the new read
    await settle(1, 200, { ok: true, enrolled: true, projects: [project("P9", "مشروع جديد"), project("P8", "آخر")] });
    expect(openCode()).toBeNull();
    expect(consumed).toEqual([[5, "unavailable"]]);
  });
});

describe("12D panel — once, no snap-back, repeatable", () => {
  it("(14 · 15) after consumption the same drill (re-rendered) never re-applies: «العودة إلى المشاريع» stays on the cards", async () => {
    const { rerender } = render(<Panel drill={{ seq: 1, projectCode: "P2" }} />);
    await settle(0, 200, TWO);
    fireEvent.click(screen.getByRole("button", { name: /العودة إلى المشاريع/ }));
    expect(openCode()).toBeNull();
    rerender(<Panel drill={{ seq: 1, projectCode: "P2" }} />);                  // parent re-render before it clears
    rerender(<Panel drill={null} />);
    rerender(<Panel drill={null} />);
    expect(openCode()).toBeNull();
    expect(cards()).toHaveLength(2);
    expect(consumed).toEqual([[1, "opened"]]);
  });

  it("(16) after a drilled P2 the student opens P1 manually: P1 stays across re-renders", async () => {
    const { rerender } = render(<Panel drill={{ seq: 1, projectCode: "P2" }} />);
    await settle(0, 200, TWO);
    fireEvent.click(screen.getByRole("button", { name: /العودة إلى المشاريع/ }));
    fireEvent.click(within(screen.getByRole("article", { name: "مشروع الكتاب" })).getByRole("button", { name: "فتح المشروع" }));
    expect(openCode()).toBe("P1");
    rerender(<Panel drill={{ seq: 1, projectCode: "P2" }} />);
    rerender(<Panel drill={null} />);
    expect(openCode()).toBe("P1");
  });

  it("(17) the same project can be requested again with a NEW seq after the student returned to the list", async () => {
    const { rerender } = render(<Panel drill={{ seq: 1, projectCode: "P2" }} />);
    await settle(0, 200, TWO);
    fireEvent.click(screen.getByRole("button", { name: /العودة إلى المشاريع/ }));
    rerender(<Panel drill={null} />);
    rerender(<Panel drill={{ seq: 2, projectCode: "P2" }} />);
    expect(openCode()).toBe("P2");
    expect(consumed).toEqual([[1, "opened"], [2, "opened"]]);
    expect(urls).toHaveLength(1);                                                // (18) still the panel's one read
  });
});

describe("12D review fix — a stale drill never auto-opens the ONLY remaining project", () => {
  const p2Card = () => screen.queryByRole("article", { name: "مشروع الشبكة" });

  it("(A) projects=[P2], drill=GONE → no detail at all (P2 not auto-opened), P2 shown as a card, consumed unavailable, one read", async () => {
    render(<Panel drill={{ seq: 1, projectCode: "GONE" }} />);
    await settle(0, 200, ONE);
    expect(openCode()).toBeNull();
    expect(document.querySelector(".eb-sp-project")).toBeNull();
    expect(cards()).toEqual(["مشروع الشبكة"]);
    expect(within(p2Card()!).getByRole("button", { name: "فتح المشروع" })).toBeTruthy();
    expect(consumed).toEqual([[1, "unavailable"]]);
    expect(urls).toHaveLength(1);
  });

  it("(B) after (A) the student opens P2 from its card → P2's detail, as the ordinary single-project view", async () => {
    render(<Panel drill={{ seq: 1, projectCode: "GONE" }} />);
    await settle(0, 200, ONE);
    fireEvent.click(within(p2Card()!).getByRole("button", { name: "فتح المشروع" }));
    expect(openCode()).toBe("P2");
    expect(cards()).toEqual([]);
    expect(urls).toHaveLength(1);
  });

  it("(C) after (A) a NEW valid drill to P2 opens it (the list-only state is cleared)", async () => {
    const { rerender } = render(<Panel drill={{ seq: 1, projectCode: "GONE" }} />);
    await settle(0, 200, ONE);
    expect(openCode()).toBeNull();
    rerender(<Panel drill={{ seq: 2, projectCode: "P2" }} />);
    expect(openCode()).toBe("P2");
    expect(consumed).toEqual([[1, "unavailable"], [2, "opened"]]);
    expect(urls).toHaveLength(1);
  });

  it("(D) the ordinary single-project panel (no drill) still opens its one project automatically", async () => {
    render(<Panel />);
    await settle(0, 200, ONE);
    expect(openCode()).toBe("P2");
    expect(cards()).toEqual([]);
    expect(consumed).toEqual([]);
  });

  it("(E) a valid drill to the single project is still consumed as opened", async () => {
    render(<Panel drill={{ seq: 3, projectCode: "P2" }} />);
    await settle(0, 200, ONE);
    expect(openCode()).toBe("P2");
    expect(consumed).toEqual([[3, "opened"]]);
  });

  it("(session) a stale drill's list-only state never leaks into a new session: the new session's one project auto-opens", async () => {
    const { rerender } = render(<Panel token="old" drill={{ seq: 1, projectCode: "GONE" }} />);
    await settle(0, 200, ONE);
    expect(openCode()).toBeNull();                                               // old session: list only
    rerender(<Panel token="new" drill={null} />);
    await settle(1, 200, ONE);
    expect(openCode()).toBe("P2");                                               // new session: legacy auto-open restored
    expect(cards()).toEqual([]);
    expect(urls.map(u => u.split(" ")[1])).toEqual(["old", "new"]);
  });
});
