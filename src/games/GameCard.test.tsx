// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import GameCard from "./GameCard";
import { getGame } from "./gameCatalog";

afterEach(cleanup);

describe("GameCard", () => {
  it("renders a coming-soon game: Arabic + English names, mode badge, description, topic, highlights, and a DISABLED action (no gameplay)", () => {
    const nc = getGame("number-conversion")!;
    render(<GameCard game={nc} />);
    expect(screen.getByRole("heading", { name: "تحدّي أنظمة العد" })).toBeTruthy();
    expect(screen.getByText("Number Conversion Challenge")).toBeTruthy();
    expect(screen.getByText("فردي")).toBeTruthy();               // Solo mode badge
    expect(screen.getByText("قريبًا")).toBeTruthy();             // coming-soon badge
    expect(screen.getByText(nc.descriptionAr)).toBeTruthy();
    expect(screen.getByText(nc.topicAr)).toBeTruthy();
    for (const h of nc.highlightsAr) expect(screen.getByText(h)).toBeTruthy();
    const btn = screen.getByRole("button", { name: "قريبًا — في المرحلة القادمة" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);                                        // clicking a coming-soon card starts nothing
    // card carries its stable id for later wiring
    expect(document.querySelector('[data-game-id="number-conversion"]')).toBeTruthy();
  });

  it("shows the Live Multiplayer badge for the live game", () => {
    render(<GameCard game={getGame("live-challenge")!} />);
    expect(screen.getByText("متعدد اللاعبين المباشر")).toBeTruthy();
  });

  it("stays disabled even if an onStart is passed while the game is still coming-soon (no fake gameplay)", () => {
    const onStart = vi.fn();
    render(<GameCard game={getGame("number-conversion")!} onStart={onStart} />);
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("uses the requested heading level (h2 in a page context)", () => {
    render(<GameCard game={getGame("live-challenge")!} headingLevel={2} />);
    expect(screen.getByRole("heading", { level: 2, name: "التحدّي المباشر" })).toBeTruthy();
  });
});
