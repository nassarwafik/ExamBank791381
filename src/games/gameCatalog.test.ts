import { describe, it, expect } from "vitest";
import { listGames, getGame, GAME_IDS, GAME_MODE_LABELS } from "./gameCatalog";
import type { GameId } from "./domain/types";

// The game registry is the single source both surfaces read. It pins EXACTLY the two approved games, proves the
// catalog is immutable and self-consistent, and (Phase 2) that Number Conversion is now available while Live
// Challenge remains coming-soon.

describe("game catalog — the two approved games", () => {
  it("registers exactly number-conversion (solo, available) and live-challenge (live, coming-soon), in that order", () => {
    const games = listGames();
    expect(games.map(g => g.id)).toEqual(["number-conversion", "live-challenge"]);
    expect(GAME_IDS).toEqual(["number-conversion", "live-challenge"]);
    const nc = getGame("number-conversion")!, live = getGame("live-challenge")!;
    expect(nc.mode).toBe("solo");
    expect(nc.availability).toBe("available");    // Phase 2: the engine ships
    expect(live.mode).toBe("live");
    expect(live.availability).toBe("coming-soon"); // Live Challenge stays coming-soon
  });

  it("carries the owner-approved Arabic names, modes and topic lines", () => {
    const nc = getGame("number-conversion")!;
    expect(nc.nameAr).toBe("تحدّي أنظمة العد");
    expect(nc.name).toBe("Number Conversion Challenge");
    expect(nc.topicAr).toContain("الثنائي");
    expect(nc.highlightsAr.some(h => h.includes("صناديق"))).toBe(true);       // interactive conversion boxes
    const live = getGame("live-challenge")!;
    expect(live.nameAr).toBe("التحدّي المباشر");
    expect(live.name).toBe("Live Challenge");
    expect(live.descriptionAr).toContain("المعلم");                          // teacher-hosted
  });

  it("labels the modes in Arabic (Solo / Live Multiplayer)", () => {
    expect(GAME_MODE_LABELS.solo).toBe("فردي");
    expect(GAME_MODE_LABELS.live).toBe("متعدد اللاعبين المباشر");
  });

  it("getGame returns null for an unknown id; the registry AND the id list are frozen (never mutable at runtime)", () => {
    expect(getGame("nope" as GameId)).toBeNull();
    const games = listGames();
    expect(Object.isFrozen(games)).toBe(true);
    expect(() => { (games as unknown as { push: (x: unknown) => void }).push({}); }).toThrow();
    expect(Object.isFrozen(games[0])).toBe(true);
    // GAME_IDS is runtime-frozen too (Fix 2)
    expect(Object.isFrozen(GAME_IDS)).toBe(true);
    expect(() => { (GAME_IDS as unknown as { push: (x: unknown) => void }).push("x"); }).toThrow();
  });
});
