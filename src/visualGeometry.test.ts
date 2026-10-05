import { describe, expect, it } from "vitest";
import {
  VISUAL_EPSILON, VISUAL_LIMITS, clientPointToNormalized, containedContentRect, maxOneToOneMatching, pointInCircle, pointInPolygon, pointInRect,
  shapeBoundingBox, shapeContainsPoint, validateNormalizedPoint, validateVisualImage, validateVisualShape
} from "./visualGeometry";

// Phase 19D — the ONE shared visual geometry engine (pure: no DOM, no React, no I/O, no randomness). Normalized coordinates only
// (x, y ∈ [0, 1] relative to the displayed image CONTENT); published malformed geometry is refused, never repaired; boundaries count
// as inside (epsilon 1e-9); one-to-one matching is a maximum matching (order independent); pointer conversion maps against the
// image content box (object-fit: contain letterboxing excluded), so resize / DPI never changes an academic point. The canonical
// question image is validated as an asset IDENTITY (embedded data:image or a bank blobName) — never a browser / signed / local URL.
// New-module suite (fail-first on e0ec8e2: no visualGeometry module).
const rect = (x: number, y: number, width: number, height: number) => ({ kind: "rect", x, y, width, height });
const circle = (cx: number, cy: number, r: number) => ({ kind: "circle", cx, cy, r });
const poly = (...pts: [number, number][]) => ({ kind: "polygon", points: pts.map(([x, y]) => ({ x, y })) });
const code = (raw: unknown) => { const r = validateVisualShape(raw); return r.ok ? "OK" : r.code; };

describe("19D geometry — normalized points", () => {
  it("accepts exactly { x, y } finite in [0, 1] (boundaries included); refuses everything else", () => {
    expect(validateNormalizedPoint({ x: 0, y: 1 })).toEqual({ x: 0, y: 1 });
    expect(validateNormalizedPoint({ x: 0.431, y: 0.287 })).toEqual({ x: 0.431, y: 0.287 });
    for (const bad of [{ x: -0.0001, y: 0.5 }, { x: 1.0001, y: 0.5 }, { x: 431, y: 287 }, { x: Number.NaN, y: 0.5 }, { x: Number.POSITIVE_INFINITY, y: 0 }, { x: "0.2", y: 0.2 }, { x: 0.2 }, { x: 0.2, y: 0.2, z: 1 }, JSON.parse('{"x":0.2,"y":0.2,"__proto__":{"x":5}}'), [0.2, 0.2], null, undefined])
      expect(validateNormalizedPoint(bad), JSON.stringify(bad)).toBeNull();
  });
});

describe("19D geometry — shape validation (strict, never repaired)", () => {
  it("valid rectangle / circle / polygon are returned canonically", () => {
    expect(validateVisualShape({ height: 0.25, width: 0.3, y: 0.2, x: 0.25, kind: "rect" })).toEqual({ ok: true, shape: rect(0.25, 0.2, 0.3, 0.25) });
    expect(validateVisualShape(circle(0.5, 0.4, 0.1))).toEqual({ ok: true, shape: circle(0.5, 0.4, 0.1) });
    expect(validateVisualShape(poly([0.2, 0.2], [0.4, 0.2], [0.3, 0.4]))).toEqual({ ok: true, shape: poly([0.2, 0.2], [0.4, 0.2], [0.3, 0.4]) });
    expect(code(rect(0, 0, 1, 1))).toBe("OK");
  });
  it("rectangles: out of range (incl. pixel values), extending past the image, zero / tiny size, unknown or missing fields", () => {
    expect(code(rect(-0.1, 0.2, 0.3, 0.2))).toBe("VISUAL_SHAPE_OUT_OF_RANGE");
    expect(code(rect(120, 80, 200, 100))).toBe("VISUAL_SHAPE_OUT_OF_RANGE");
    expect(code(rect(0.8, 0.2, 0.3, 0.2))).toBe("VISUAL_SHAPE_OUT_OF_RANGE");
    expect(code(rect(0.2, 0.9, 0.2, 0.2))).toBe("VISUAL_SHAPE_OUT_OF_RANGE");
    expect(code(rect(0.2, 0.2, 0, 0.2))).toBe("VISUAL_SHAPE_DEGENERATE");
    expect(code(rect(0.2, 0.2, VISUAL_LIMITS.minSize / 2, 0.2))).toBe("VISUAL_SHAPE_DEGENERATE");
    expect(code({ ...rect(0.2, 0.2, 0.2, 0.2), rotation: 45 })).toBe("VISUAL_SHAPE_INVALID");
    expect(code({ kind: "rect", x: 0.2, y: 0.2, width: 0.2 })).toBe("VISUAL_SHAPE_INVALID");
    expect(code({ kind: "rect", x: Number.NaN, y: 0.2, width: 0.2, height: 0.2 })).toBe("VISUAL_SHAPE_INVALID");
    expect(code({ kind: "rect", x: Number.POSITIVE_INFINITY, y: 0.2, width: 0.2, height: 0.2 })).toBe("VISUAL_SHAPE_INVALID");
    expect(code(JSON.parse('{"kind":"rect","x":0.1,"y":0.1,"width":0.2,"height":0.2,"__proto__":{"x":2}}'))).toBe("VISUAL_SHAPE_INVALID");
    expect(code({ kind: "rect", x: 0.1, y: 0.1, width: 0.2, height: 0.2, constructor: 1 })).toBe("VISUAL_SHAPE_INVALID");
  });
  it("circles: negative / zero / tiny radius, radius beyond the safe bound, centre out of range", () => {
    expect(code(circle(0.5, 0.5, -0.1))).toBe("VISUAL_SHAPE_DEGENERATE");
    expect(code(circle(0.5, 0.5, 0))).toBe("VISUAL_SHAPE_DEGENERATE");
    expect(code(circle(0.5, 0.5, VISUAL_LIMITS.maxRadius + 0.01))).toBe("VISUAL_CIRCLE_RADIUS");
    expect(code(circle(0.5, 0.5, VISUAL_LIMITS.maxRadius))).toBe("OK");
    expect(code(circle(1.2, 0.5, 0.1))).toBe("VISUAL_SHAPE_OUT_OF_RANGE");
  });
  it("polygons: 3..20 points, in range, non-degenerate, simple (no self-intersection), no duplicate vertices", () => {
    expect(code(poly([0.2, 0.2], [0.4, 0.2]))).toBe("VISUAL_POLYGON_POINTS");
    const ring = Array.from({ length: VISUAL_LIMITS.polygonPoints + 1 }, (_, i) => [0.5 + 0.4 * Math.cos(i * 2 * Math.PI / 21), 0.5 + 0.4 * Math.sin(i * 2 * Math.PI / 21)] as [number, number]);
    expect(code(poly(...ring))).toBe("VISUAL_POLYGON_POINTS");
    expect(code(poly(...ring.slice(0, VISUAL_LIMITS.polygonPoints)))).toBe("OK");
    expect(code(poly([0.1, 0.1], [0.3, 0.3], [0.5, 0.5]))).toBe("VISUAL_SHAPE_DEGENERATE");
    expect(code(poly([0.1, 0.1], [0.1, 0.1], [0.5, 0.1], [0.3, 0.5]))).toBe("VISUAL_SHAPE_DEGENERATE");
    expect(code(poly([0.1, 0.1], [0.5, 0.5], [0.5, 0.1], [0.1, 0.5]))).toBe("VISUAL_POLYGON_SELF_INTERSECTING");
    expect(code(poly([0.1, 0.1], [1.4, 0.1], [0.3, 0.5]))).toBe("VISUAL_SHAPE_OUT_OF_RANGE");
    expect(code({ kind: "polygon", points: [{ x: 0.1, y: 0.1, w: 1 }, { x: 0.5, y: 0.1 }, { x: 0.3, y: 0.5 }] })).toBe("VISUAL_SHAPE_INVALID");
    expect(code({ kind: "polygon", points: "0.1,0.1 0.5,0.1 0.3,0.5" })).toBe("VISUAL_POLYGON_POINTS");
  });
  it("unknown kinds and non-objects are refused", () => {
    expect(code({ kind: "ellipse", cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.2 })).toBe("VISUAL_SHAPE_KIND_UNKNOWN");
    expect(code({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 })).toBe("VISUAL_SHAPE_KIND_UNKNOWN");
    for (const bad of [null, [], "rect", 3]) expect(code(bad)).toBe("VISUAL_SHAPE_INVALID");
  });
});

describe("19D geometry — containment (boundary counts inside, epsilon 1e-9)", () => {
  it("rectangle: corners and edges inside; just outside is outside", () => {
    const r = rect(0.25, 0.2, 0.3, 0.25) as never;
    for (const p of [[0.25, 0.2], [0.55, 0.45], [0.4, 0.2], [0.25, 0.3], [0.4, 0.3]]) expect(pointInRect({ x: p[0], y: p[1] }, r), String(p)).toBe(true);
    for (const p of [[0.5500001, 0.3], [0.24999, 0.3], [0.4, 0.4500001], [0.4, 0.19]]) expect(pointInRect({ x: p[0], y: p[1] }, r), String(p)).toBe(false);
    expect(VISUAL_EPSILON).toBe(1e-9);
  });
  it("circle: points on the circumference inside; just outside outside (normalized space)", () => {
    const c = circle(0.5, 0.4, 0.1) as never;
    for (const p of [[0.6, 0.4], [0.5, 0.5], [0.4, 0.4], [0.57, 0.47], [0.5, 0.4]]) expect(pointInCircle({ x: p[0], y: p[1] }, c), String(p)).toBe(true);
    for (const p of [[0.6000001, 0.4], [0.58, 0.48], [0.5, 0.29]]) expect(pointInCircle({ x: p[0], y: p[1] }, c), String(p)).toBe(false);
  });
  it("polygon: vertices and edges inside; exterior points outside; concave shapes and rays through vertices are exact", () => {
    const tri = poly([0.2, 0.2], [0.4, 0.2], [0.3, 0.4]) as never;
    for (const p of [[0.2, 0.2], [0.3, 0.2], [0.25, 0.3], [0.3, 0.4], [0.3, 0.27], [0.344, 0.31]]) expect(pointInPolygon({ x: p[0], y: p[1] }, tri), String(p)).toBe(true);
    for (const p of [[0.3, 0.19], [0.41, 0.2], [0.35, 0.31], [0.2, 0.4]]) expect(pointInPolygon({ x: p[0], y: p[1] }, tri), String(p)).toBe(false);
    const L = poly([0.1, 0.1], [0.5, 0.1], [0.5, 0.2], [0.2, 0.2], [0.2, 0.5], [0.1, 0.5]) as never;
    for (const p of [[0.15, 0.4], [0.4, 0.15], [0.15, 0.2], [0.3, 0.2], [0.2, 0.35]]) expect(pointInPolygon({ x: p[0], y: p[1] }, L), String(p)).toBe(true);
    for (const p of [[0.3, 0.3], [0.05, 0.2], [0.45, 0.45], [0.6, 0.15]]) expect(pointInPolygon({ x: p[0], y: p[1] }, L), String(p)).toBe(false);
  });
  it("shapeContainsPoint dispatches by kind; bounding boxes", () => {
    expect(shapeContainsPoint(rect(0.1, 0.1, 0.2, 0.2) as never, { x: 0.3, y: 0.3 })).toBe(true);
    expect(shapeContainsPoint(circle(0.5, 0.5, 0.1) as never, { x: 0.3, y: 0.3 })).toBe(false);
    expect(shapeBoundingBox(rect(0.1, 0.2, 0.3, 0.4) as never)).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
    const bc = shapeBoundingBox(circle(0.5, 0.4, 0.1) as never);
    expect(bc.x).toBeCloseTo(0.4, 12); expect(bc.y).toBeCloseTo(0.3, 12); expect(bc.width).toBeCloseTo(0.2, 12); expect(bc.height).toBeCloseTo(0.2, 12);
    const bp = shapeBoundingBox(poly([0.2, 0.2], [0.4, 0.2], [0.3, 0.4]) as never);
    expect(bp.x).toBeCloseTo(0.2, 12); expect(bp.y).toBeCloseTo(0.2, 12); expect(bp.width).toBeCloseTo(0.2, 12); expect(bp.height).toBeCloseTo(0.2, 12);
  });
});

describe("19D geometry — one-to-one matching (maximum matching, order independent)", () => {
  const A = rect(0.1, 0.1, 0.4, 0.4) as never, B = rect(0.3, 0.3, 0.4, 0.4) as never;
  it("a point inside two overlapping targets is assigned so that the MAXIMUM number of targets is matched, in any order", () => {
    const both = { x: 0.35, y: 0.35 }, onlyA = { x: 0.15, y: 0.15 };
    expect(maxOneToOneMatching([both, onlyA], [A, B]).size).toBe(2);
    expect(maxOneToOneMatching([onlyA, both], [A, B]).size).toBe(2);
    expect(maxOneToOneMatching([both, onlyA], [B, A]).size).toBe(2);
    expect(maxOneToOneMatching([onlyA, both], [B, A]).size).toBe(2);
    const m = maxOneToOneMatching([both, onlyA], [A, B]);
    expect(m.targetOfPoint).toEqual([1, 0]);
  });
  it("one point never satisfies two targets; duplicate points never earn duplicate credit", () => {
    expect(maxOneToOneMatching([{ x: 0.35, y: 0.35 }], [A, B]).size).toBe(1);
    expect(maxOneToOneMatching([{ x: 0.15, y: 0.15 }, { x: 0.15, y: 0.15 }, { x: 0.2, y: 0.2 }], [A, B]).size).toBe(1);
    expect(maxOneToOneMatching([], [A, B]).size).toBe(0);
    expect(maxOneToOneMatching([{ x: 0.9, y: 0.9 }], [A, B])).toEqual({ size: 0, targetOfPoint: [null] });
  });
});

describe("19D geometry — pointer mapping against the displayed image content (object-fit: contain)", () => {
  it("content rectangle of a letterboxed image", () => {
    expect(containedContentRect({ width: 400, height: 300 }, { width: 800, height: 400 })).toEqual({ left: 0, top: 50, width: 400, height: 200 });
    expect(containedContentRect({ width: 300, height: 300 }, { width: 100, height: 200 })).toEqual({ left: 75, top: 0, width: 150, height: 300 });
    expect(containedContentRect({ width: 400, height: 200 }, { width: 800, height: 400 })).toEqual({ left: 0, top: 0, width: 400, height: 200 });
  });
  it("client pixels → normalized content coordinates; letterbox clicks are refused; rounding to 6 decimals; resize / DPI invariant", () => {
    const box = { left: 10, top: 10, width: 400, height: 300 }, natural = { width: 800, height: 400 };
    expect(clientPointToNormalized({ x: 110, y: 60 }, box, natural)).toEqual({ x: 0.25, y: 0 });
    expect(clientPointToNormalized({ x: 110, y: 110 }, box, natural)).toEqual({ x: 0.25, y: 0.25 });
    expect(clientPointToNormalized({ x: 110, y: 30 }, box, natural)).toBeNull();                       // top letterbox band
    expect(clientPointToNormalized({ x: 110, y: 290 }, box, natural)).toBeNull();                      // bottom letterbox band
    expect(clientPointToNormalized({ x: 500, y: 110 }, box, natural)).toBeNull();                      // outside the element
    expect(clientPointToNormalized({ x: 10 + 400 / 3, y: 160 }, box, natural)).toEqual({ x: 0.333333, y: 0.5 });
    const big = { left: 20, top: 20, width: 800, height: 600 };
    expect(clientPointToNormalized({ x: 20 + 200, y: 20 + 100 + 100 }, big, natural)).toEqual(clientPointToNormalized({ x: 110, y: 110 }, box, natural));
    expect(clientPointToNormalized({ x: 110, y: 160 }, box)).toEqual({ x: 0.25, y: 0.5 });             // no natural size given: the box IS the content
    expect(clientPointToNormalized({ x: 110, y: 110 }, box, { width: 0, height: 0 })).toBeNull();      // image not loaded yet
    expect(clientPointToNormalized({ x: 110, y: 110 }, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
  });
});

describe("19D geometry — the canonical question image as an asset IDENTITY", () => {
  const ok = (image: unknown) => validateVisualImage(image).ok;
  const c = (image: unknown) => { const r = validateVisualImage(image); return r.ok ? "OK" : r.code; };
  it("embedded data:image assets and bank blob identities are accepted", () => {
    expect(ok({ exists: true, visible: true, assets: [{ dataUrl: "data:image/png;base64,iVBORw0KGgo=", origin: "uploaded", contentType: "image/png" }] })).toBe(true);
    expect(ok({ exists: true, visible: true, assets: [{ dataUrl: "data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E" }] })).toBe(true);
    expect(ok({ exists: true, visible: true, assets: [{ id: "b1", origin: "bank", blobName: "bank/img-1.png" }] })).toBe(true);
    expect(ok({ exists: true, visible: true, assets: [{ id: "b1", origin: "bank", blobName: "bank/img-1.png", dataUrl: "/api/question-image?blob=bank%2Fimg-1.png&exp=1&sig=x" }] })).toBe(true);
  });
  it("missing / hidden images and browser, signed, remote or local references as identity are refused", () => {
    expect(c(undefined)).toBe("VISUAL_IMAGE_MISSING");
    expect(c({ exists: false, visible: false, assets: [] })).toBe("VISUAL_IMAGE_MISSING");
    expect(c({ exists: true, visible: true, assets: [] })).toBe("VISUAL_IMAGE_MISSING");
    expect(c({ exists: true, visible: false, assets: [{ dataUrl: "data:image/png;base64,iVBORw0KGgo=" }] })).toBe("VISUAL_IMAGE_HIDDEN");
    for (const dataUrl of ["blob:https://app/1234", "https://cdn.example/x.png", "/api/question-image?blob=x&exp=1&sig=y", "file:///C:/x.png", "C:\\images\\x.png", "data:text/html,<b>x</b>", ""])
      expect(c({ exists: true, visible: true, assets: [{ dataUrl }] }), dataUrl).toBe("VISUAL_IMAGE_ASSET_INVALID");
    expect(c({ exists: true, visible: true, assets: [{ origin: "bank", blobName: "../secret" }] })).toBe("VISUAL_IMAGE_ASSET_INVALID");
    expect(c({ exists: true, visible: true, assets: ["data:image/png;base64,x"] })).toBe("VISUAL_IMAGE_ASSET_INVALID");
    expect(c({ exists: true, visible: true, assets: "data:image/png;base64,x" })).toBe("VISUAL_IMAGE_MISSING");
  });
});
