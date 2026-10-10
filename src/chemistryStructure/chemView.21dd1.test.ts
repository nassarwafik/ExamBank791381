import { describe, expect, it } from "vitest";
import { MOLECULES } from "../chemistry/molecules";
import { projectMolecule } from "./chemView";

// Phase 21D-D.1 — found by the real-Chromium certification (scripts/check-chemistry-browser-21dd1.mjs): the O–H bond of water was drawn
// from atom CENTRE to atom CENTRE and, being nearer to the viewer than the oxygen, was painted ACROSS the oxygen disk — the click aimed at
// O1 landed on the bond. In a ball-and-stick picture a bond starts and ends at the atom surfaces: no projected bond segment may enter the
// disk of either atom it joins, whatever the orientation; a bond hidden entirely behind its nearer atom (foreshortened) is not drawn.
const CAMERAS = [{ yaw: 0.55, pitch: 0.35, zoom: 1 }, { yaw: 0, pitch: 0, zoom: 1 }, { yaw: 1.3, pitch: -0.9, zoom: 1.8 }, { yaw: -2.4, pitch: 1.2, zoom: 0.6 }, { yaw: Math.PI / 2, pitch: 0, zoom: 1 }];
const dist = (x: number, y: number, a: { x: number; y: number }) => Math.hypot(x - a.x, y - a.y);

describe("21D-D.1 ball-and-stick projection — bonds never cover the atoms they join", () => {
  it("every drawn bond segment starts and ends at (or outside) the surfaces of its two atoms, for every catalog molecule and camera", () => {
    for (const m of MOLECULES) for (const cam of CAMERAS) {
      const p = projectMolecule(m, cam, 360, 280, false), at = new Map(p.atoms.map(a => [a.id, a]));
      for (const b of p.bonds) {
        const A = at.get(b.a)!, B = at.get(b.b)!;
        const where = m.id + " " + b.id + " @" + JSON.stringify(cam);
        expect(dist(b.x1, b.y1, A), where).toBeGreaterThanOrEqual(A.r * 0.85 - 1e-9);
        expect(dist(b.x2, b.y2, B), where).toBeGreaterThanOrEqual(B.r * 0.85 - 1e-9);
        expect(dist(b.x1, b.y1, B) + 1e-9, where).toBeGreaterThanOrEqual(dist(b.x2, b.y2, B));           // the segment runs from A towards B
      }
    }
  });
  it("a bond pointing at the viewer (projected centres closer than the two radii) is hidden behind its atoms, not drawn across them", () => {
    const ethyne = MOLECULES.find(m => m.id === "ethyne")!;                                                  // a linear molecule along x
    const endOn = projectMolecule(ethyne, { yaw: Math.PI / 2, pitch: 0, zoom: 1 }, 360, 280, false);      // looking down the molecular axis
    expect(endOn.bonds).toEqual([]);
    expect(endOn.atoms).toHaveLength(4);
  });
});
