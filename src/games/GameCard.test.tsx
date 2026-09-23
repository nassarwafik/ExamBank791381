// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import GameCard from "./GameCard";
import { getGame } from "./gameCatalog";
import type { GameDefinition } from "./domain/types";

afterEach(cleanup);

// A synthetic coming-soon game (the catalog no longer has one now that Live Challenge's lobby ships in Phase 4A) —
// this keeps GameCard's coming-soon behavior covered independently of the catalog's current availability.
const COMING_SOON: GameDefinition = {
  id: "live-challenge", name: "X", nameAr: "لعبة قادمة", mode: "live", descriptionAr: "d", topicAr: "t",
  highlightsAr: [], availability: "coming-soon",
};

describe("GameCard", () => {
  it("a coming-soon game: mode badge, «قريبًا» badge, and a DISABLED «قريبًا — في المرحلة القادمة» action", () => {
    render(<GameCard game={COMING_SOON} onStart={vi.fn()} />);
    expect(screen.getByText("متعدد اللاعبين المباشر")).toBeTruthy();   // Live Multiplayer badge
    expect(screen.getByText("قريبًا")).toBeTruthy();                    // coming-soon badge
    const btn = screen.getByRole("button", { name: "قريبًا — في المرحلة القادمة" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);                                    // never startable while coming-soon, even with onStart
  });

  it("an available game with an onStart + a custom startLabel (Live Challenge «انضم إلى غرفة») enables that action", () => {
    const onStart = vi.fn();
    render(<GameCard game={getGame("live-challenge")!} onStart={onStart} startLabel="انضم إلى غرفة" />);
    expect(screen.queryByText("قريبًا")).toBeNull();                    // Live Challenge is available now (lobby ships in 4A)
    const btn = screen.getByRole("button", { name: "انضم إلى غرفة" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("an available game with an onStart (student surface) enables «ابدأ» and fires onStart; no «قريبًا» badge", () => {
    const onStart = vi.fn();
    const nc = getGame("number-conversion")!;
    render(<GameCard game={nc} onStart={onStart} />);
    expect(screen.getByText("Number Conversion Challenge")).toBeTruthy();
    expect(screen.getByText("فردي")).toBeTruthy();                      // Solo badge
    expect(screen.queryByText("قريبًا")).toBeNull();                    // available → no coming-soon badge
    for (const h of nc.highlightsAr) expect(screen.getByText(h)).toBeTruthy();
    const btn = screen.getByRole("button", { name: "ابدأ" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-game-id="number-conversion"]')).toBeTruthy();
  });

  it("an available game WITHOUT an onStart (teacher surface) shows a disabled «متاح للطلاب» — no fake Start", () => {
    render(<GameCard game={getGame("number-conversion")!} />);
    const btn = screen.getByRole("button", { name: "متاح للطلاب" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.queryByText("قريبًا")).toBeNull();
  });

  it("uses the requested heading level (h2 in a page context)", () => {
    render(<GameCard game={getGame("live-challenge")!} headingLevel={2} />);
    expect(screen.getByRole("heading", { level: 2, name: "التحدّي المباشر" })).toBeTruthy();
  });
});
