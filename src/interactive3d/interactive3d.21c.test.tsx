// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import Interactive3DView from "./Interactive3DView";
import { buildInteractive3DMesh, projectInteractive3DScene } from "./sceneMesh";
import { scene3DPreset } from "./scenePresets";
import { scene3DTargetKey, validateInteractive3DSceneSpec, type Interactive3DSceneSpecV1 } from "./sceneSpec";
import { scoreScene3DSelection, validateScene3DSelectionConfig, validateScene3DSelectionQuestion } from "../scene3DSelectionQuestion";
import { validateRichContent } from "../richContent/richContentModel";

afterEach(cleanup);

describe("21C scene contract and geometry engine", () => {
  it("strictly rebuilds safe presets and rejects unknown/prototype/invalid semantic targets", () => {
    for (const key of ["cube","pyramid","heart","torso","water"] as const) {
      const r = validateInteractive3DSceneSpec(scene3DPreset(key, "scene-" + key));
      expect(r.ok, key).toBe(true);
    }
    const cube = scene3DPreset("cube", "scene-cube") as unknown as Record<string, unknown>;
    expect(validateInteractive3DSceneSpec({ ...cube, renderer: { webgl: true } }).ok).toBe(false);
    const proto = Object.create(scene3DPreset("cube"));
    expect(validateInteractive3DSceneSpec(proto).ok).toBe(false);
    const broken = structuredClone(scene3DPreset("cube")) as Interactive3DSceneSpecV1;
    broken.targets[0] = { ...broken.targets[0], element: "not-a-face" };
    expect(validateInteractive3DSceneSpec(broken).ok).toBe(false);
    const duplicate = structuredClone(scene3DPreset("heart")) as Interactive3DSceneSpecV1;
    duplicate.objects.push({ ...duplicate.objects[0] });
    expect(validateInteractive3DSceneSpec(duplicate).ok).toBe(false);
  });

  it("builds a bounded deterministic cube mesh with stable semantic geometry", () => {
    const scene = scene3DPreset("cube", "scene-cube");
    const valid = validateInteractive3DSceneSpec(scene);
    if (!valid.ok) throw new Error("fixture");
    const a = buildInteractive3DMesh(valid.value), b = buildInteractive3DMesh(valid.value);
    expect(a).toEqual(b);
    expect(a.vertices).toHaveLength(8);
    expect(a.faces).toHaveLength(6);
    expect(a.edges).toHaveLength(12);
    expect(a.faces.map(f => f.element).sort()).toEqual(["back","bottom","front","left","right","top"]);
    expect(a.vertices.map(v => v.element).sort()).toEqual(["A","B","C","D","E","F","G","H"]);
    const p = projectInteractive3DScene(a, valid.value, valid.value.camera, 1, 1);
    expect([p.width, p.height]).toEqual([180,180]);
    expect(p.faces).toHaveLength(6);
  });

  it("validates semantic selection and grades stable target ids, never pixels", () => {
    const scene = scene3DPreset("heart", "heart-scene");
    const config = { v: 1 as const, scene, target: "object" as const, mode: "single" as const, maxSelections: 1, label: "اختر البطين الأيسر" };
    const question = { presentationType: "scene3DSelection", questionTypeVersion: 1, scene3DSelection: config, answer: { scoring: "allOrNothing", correct: ["object:leftVentricle"] } };
    expect(validateScene3DSelectionConfig(config).ok).toBe(true);
    expect(validateScene3DSelectionQuestion(question)).toEqual([]);
    expect(scoreScene3DSelection({ config, answerKey: question.answer, response: { kind: "scene3DSelection", sceneId: "heart-scene", targets: ["object:leftVentricle"] }, maxMarks: 5 })).toMatchObject({ score: 5, correct: true, manualReview: false });
    expect(scoreScene3DSelection({ config, answerKey: question.answer, response: { kind: "scene3DSelection", sceneId: "heart-scene", targets: ["object:rightVentricle"] }, maxMarks: 5 })).toMatchObject({ score: 0, correct: false, manualReview: false });
    expect(scoreScene3DSelection({ config, answerKey: question.answer, response: { kind: "scene3DSelection", sceneId: "heart-scene", targets: ["object:missing"] }, maxMarks: 5 })).toMatchObject({ score: 0, correct: false, manualReview: false });
  });

  it("supports proportional set scoring without rewarding extra guesses", () => {
    const scene = scene3DPreset("cube", "cube-multi");
    const config = { v: 1 as const, scene, target: "vertex" as const, mode: "multiple" as const, maxSelections: 3 };
    const key = { scoring: "partial" as const, correct: ["vertex:vA","vertex:vB"] };
    expect(scoreScene3DSelection({ config, answerKey: key, response: { kind: "scene3DSelection", sceneId: "cube-multi", targets: ["vertex:vA"] }, maxMarks: 6 }).score).toBe(3);
    expect(scoreScene3DSelection({ config, answerKey: key, response: { kind: "scene3DSelection", sceneId: "cube-multi", targets: ["vertex:vA","vertex:vC"] }, maxMarks: 6 }).score).toBe(2);
  });

  it("persists interactive3D as strict RichContent and rejects renderer smuggling", () => {
    const scene = scene3DPreset("torso", "torso-rich");
    expect(validateRichContent({ schemaVersion: 1, blocks: [{ type: "interactive3D", scene }] }).ok).toBe(true);
    const hostile = structuredClone(scene) as unknown as Record<string, unknown>;
    hostile.three = { material: "raw" };
    const r = validateRichContent({ schemaVersion: 1, blocks: [{ type: "interactive3D", scene: hostile }] });
    expect(r.ok).toBe(false);
    expect(r.issues.map(i => i.code)).toContain("RICH_CONTENT_INTERACTIVE_3D");
  });
});

describe("21C real student interaction surface", () => {
  it("button-list and SVG object click emit the same semantic target key", () => {
    const scene = scene3DPreset("heart", "heart-interaction");
    const emitted: string[][] = [];
    function Host() {
      const [value, setValue] = useState<string[]>([]);
      return <Interactive3DView spec={scene} selection={{ kind: "object", mode: "single", max: 1, value, label: "اختر جزءًا", onChange: n => { setValue(n); emitted.push(n); } }} />;
    }
    const { container } = render(<Host />);
    const group = screen.getByRole("group", { name: "اختر جزءًا" });
    fireEvent.click(within(group).getByRole("button", { name: /البطين الأيسر/ }));
    expect(emitted.at(-1)).toEqual(["object:leftVentricle"]);
    const face = container.querySelector('[data-i3d-target="object:rightVentricle"]');
    expect(face).not.toBeNull();
    fireEvent.click(face!);
    expect(emitted.at(-1)).toEqual(["object:rightVentricle"]);
  });

  it("rotates by keyboard and pointer but camera gestures never become answers", () => {
    const scene = scene3DPreset("cube", "cube-camera");
    const emitted: string[][] = [];
    const { container } = render(<Interactive3DView spec={scene} selection={{ kind: "face", mode: "single", max: 1, value: [], onChange: n => emitted.push(n) }} />);
    const svg = container.querySelector("svg.i3d-scene")!;
    const before = container.querySelector("polygon.i3d-face")?.getAttribute("points");
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(container.querySelector("polygon.i3d-face")?.getAttribute("points")).not.toBe(before);
    fireEvent.keyDown(svg, { key: "Home" });
    expect(container.querySelector("polygon.i3d-face")?.getAttribute("points")).toBe(before);
    fireEvent.pointerDown(svg, { pointerId: 4, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(svg, { pointerId: 4, clientX: 140, clientY: 120 });
    fireEvent.pointerUp(svg, { pointerId: 4 });
    expect(container.querySelector("polygon.i3d-face")?.getAttribute("points")).not.toBe(before);
    expect(emitted).toEqual([]);
  });

  it("exposes canonical target keys from presets", () => {
    const heart = scene3DPreset("heart");
    expect(scene3DTargetKey(heart.targets[0])).toMatch(/^object:/);
  });
});
