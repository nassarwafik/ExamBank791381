// @vitest-environment happy-dom
// Focused motion regressions for the two review fixes:
//  1) RouterNetworks — ONE continuous route Network 1 → Router → Internet (never the reverse).
//  2) SameNetwork — the SHARED PREFIX carries the meaningful motion, gated by reduced motion.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import RouterNetworks from "./791381/batch2/RouterNetworks";
import SameNetwork from "./791381/batch2/SameNetwork";

afterEach(cleanup);

// Parse an SVG path `d` of only M/L commands into [{x,y}] points.
function points(d: string): { x: number; y: number }[] {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  return pts;
}

describe("RouterNetworks — forwarding route direction", () => {
  it("motion ON: exactly one packet follows a single continuous route that starts at Network 1 (bottom), passes the Router, and ends at the Internet (top)", () => {
    const { container } = render(<RouterNetworks ariaLabel="x" reducedMotion={false} />);
    const route = container.querySelector("#rt-route") as SVGPathElement;
    expect(route).not.toBeNull();
    const pts = points(route.getAttribute("d")!);
    const start = pts[0], end = pts[pts.length - 1];
    // Network 1 (Switch 1) sits at the BOTTOM (large y); the Internet is at the TOP (small y).
    expect(start.y).toBeGreaterThan(150);          // begins at Network 1 / Switch 1
    expect(end.y).toBeLessThan(80);                // ends at the Internet
    expect(start.y).toBeGreaterThan(end.y);        // travels network → internet, never the reverse
    // passes THROUGH the router (a waypoint near the router centre x≈190, y≈118)
    expect(pts.some(p => Math.abs(p.x - 190) <= 6 && Math.abs(p.y - 118) <= 8)).toBe(true);
    // exactly ONE packet animation, and it follows the single route (not the raw network links)
    const motions = [...container.querySelectorAll("animateMotion")];
    expect(motions.length).toBe(1);
    expect(motions[0].querySelector("mpath")!.getAttribute("href")).toBe("#rt-route");
  });

  it("reduced motion: no animateMotion; a still packet is parked at the Network-1 origin", () => {
    const { container } = render(<RouterNetworks ariaLabel="x" reducedMotion={true} />);
    expect(container.querySelectorAll("animateMotion").length).toBe(0);
    expect(container.querySelector(".eb-visual-packet-static")).not.toBeNull();
    // the route path is still authored the correct way (network → internet)
    const pts = points((container.querySelector("#rt-route") as SVGPathElement).getAttribute("d")!);
    expect(pts[0].y).toBeGreaterThan(pts[pts.length - 1].y);
  });
});

describe("SameNetwork — shared-prefix motion", () => {
  it("motion ON: every one of the four shared-prefix elements carries the meaningful motion marker", () => {
    const { container } = render(<SameNetwork ariaLabel="x" reducedMotion={false} />);
    const prefixes = [...container.querySelectorAll(".eb-visual-prefix")];
    expect(prefixes.length).toBe(4);
    expect(prefixes.every(p => p.textContent === "192.168.1.")).toBe(true);
    // the motion is ON THE PREFIX (not merely the hub)
    expect(container.querySelectorAll(".eb-visual-prefix-anim").length).toBe(4);
    // the hub no longer carries the animation
    expect(container.querySelector(".eb-visual-hub.eb-visual-glow-anim")).toBeNull();
  });

  it("reduced motion: NO prefix-motion marker, but the shared prefix is still colour-distinguished (still frame)", () => {
    const { container } = render(<SameNetwork ariaLabel="x" reducedMotion={true} />);
    expect(container.querySelectorAll(".eb-visual-prefix-anim").length).toBe(0);
    // the shared prefix and the differing host part remain as distinct, separately-classed elements
    expect(container.querySelectorAll(".eb-visual-prefix").length).toBe(4);
    expect(container.querySelectorAll(".eb-visual-hostpart").length).toBe(4);
  });
});
