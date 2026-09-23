// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import { LiveStandingsTable, LivePodium, type LeaderboardEntry } from "./LiveChallengeLeaderboard";

// Phase 4C — the shared, presentation-only leaderboard + podium. It renders exactly the server-derived rows it is given
// (it never sorts, ranks, or computes points) and enforces the display rules: the current student's row is marked with
// the TEXT «أنت» (never colour-only) and the podium shows AT MOST the top three, never fabricating an empty place.

afterEach(() => cleanup());

const row = (over: Partial<LeaderboardEntry> & { rank: number }): LeaderboardEntry =>
  ({ displayName: "لاعب", points: 0, correctCount: 0, answeredCount: 0, ...over });

describe("LiveStandingsTable", () => {
  it("renders the given rows in order with rank + points, and marks only the own row with «أنت»", () => {
    const standings = [
      row({ rank: 1, displayName: "أحمد", points: 2000, correctCount: 2, answeredCount: 2 }),
      row({ rank: 2, displayName: "حلا", points: 1000, correctCount: 1, answeredCount: 2, you: true }),
    ];
    render(<LiveStandingsTable standings={standings} title="الترتيب حتى السؤال السابق" />);
    const region = screen.getByRole("region", { name: "الترتيب حتى السؤال السابق" });
    const items = within(region).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("أحمد")).toBeTruthy();
    expect(within(items[0]).getByText(/2000/)).toBeTruthy();
    // «أنت» appears once, on the own (second) row only
    expect(within(items[0]).queryByText("أنت")).toBeNull();
    expect(within(items[1]).getByText("أنت")).toBeTruthy();
  });
  it("renders nothing when there are no rows", () => {
    const { container } = render(<LiveStandingsTable standings={[]} title="الترتيب" />);
    expect(container.firstChild).toBeNull();
  });
});

describe("LivePodium", () => {
  it("shows AT MOST the top three even when given more (never a Top-5)", () => {
    const standings = [1, 2, 3, 4, 5].map(n => row({ rank: n, displayName: "ط" + n, points: (6 - n) * 100 }));
    render(<LivePodium standings={standings} />);
    const region = screen.getByRole("region", { name: "المراكز الأولى" });
    expect(within(region).getByText("ط1")).toBeTruthy();
    expect(within(region).getByText("ط3")).toBeTruthy();
    expect(within(region).queryByText("ط4")).toBeNull();     // 4th place never shown
    expect(within(region).queryByText("ط5")).toBeNull();
    // the three medal symbols are present
    expect(within(region).getByText("🥇")).toBeTruthy();
    expect(within(region).getByText("🥈")).toBeTruthy();
    expect(within(region).getByText("🥉")).toBeTruthy();
  });
  it("with two participants shows two places and never fabricates a third", () => {
    render(<LivePodium standings={[row({ rank: 1, displayName: "أ", points: 500 }), row({ rank: 2, displayName: "ب", points: 100 })]} />);
    const region = screen.getByRole("region", { name: "المراكز الأولى" });
    expect(within(region).getByText("🥇")).toBeTruthy();
    expect(within(region).getByText("🥈")).toBeTruthy();
    expect(within(region).queryByText("🥉")).toBeNull();     // no empty third place
  });
  it("marks the own place with «أنت» and renders nothing when empty", () => {
    const { container } = render(<LivePodium standings={[]} />);
    expect(container.firstChild).toBeNull();
    cleanup();
    render(<LivePodium standings={[row({ rank: 1, displayName: "أنا", points: 900, you: true })]} />);
    expect(screen.getByText("أنت")).toBeTruthy();
  });
});
