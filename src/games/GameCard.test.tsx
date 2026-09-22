// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import GameCard from "./GameCard";
import { getGame } from "./gameCatalog";

afterEach(cleanup);

describe("GameCard", () => {
  it("a coming-soon game (Live Challenge): mode badge, «قريبًا» badge, and a DISABLED «قريبًا — في المرحلة القادمة» action", () => {
    const live = getGame("live-challenge")!;
    render(<GameCard game={live} onStart={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "التحدّي المباشر" })).toBeTruthy();
    expect(screen.getByText("متعدد اللاعبين المباشر")).toBeTruthy();   // Live Multiplayer badge
    expect(screen.getByText("قريبًا")).toBeTruthy();                    // coming-soon badge
    const btn = screen.getByRole("button", { name: "قريبًا — في المرحلة القادمة" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);                                    // never startable while coming-soon, even with onStart
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
