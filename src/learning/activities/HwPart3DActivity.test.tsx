// @vitest-environment happy-dom
// HW-A1 — a computer part as a 3D model (interactive-diagram / hw-part-3d / v1) through the real activity host:
//   • exact registry identity (family, key, version) and lazy load;
//   • the strict reader: a valid model reads; anything unexpected (unknown key, a face target, an explore-only flag off, a broken
//     scene, a bad hint) → null, and the activity says it is unavailable instead of guessing;
//   • choosing a piece (in the list under the model) shows its name and explanation; the shell's reset clears the choice.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import LearningActivityHost from "./LearningActivityHost";
import { productionActivityRegistry } from "./engine";
import { readHwPart3D } from "./hwPart3d";
import type { InteractiveDiagramBlock } from "../content/types";
// @ts-expect-error — plain ESM authoring data; untyped on purpose.
import { PARTS } from "../../../scripts/hw-course/parts.mjs";

afterEach(() => { cleanup(); });

const scene = () => JSON.parse(JSON.stringify(PARTS.motherboard));
const block = (config: Record<string, unknown>, version = 1): InteractiveDiagramBlock => ({
  id: "hw", type: "interactive-diagram", origin: "teacher-enrichment", interactionType: "hw-part-3d", version, title: "اللوحة الأم",
  capabilities: { fullscreen: true, reset: true, interactive: true }, config,
});
const mount = async (b: InteractiveDiagramBlock) => {
  const r = render(<LearningActivityHost block={b} courseId="791283" />);
  await waitFor(() => { if (!r.container.querySelector(".learning-hw3d, .learning-trace-empty")) throw new Error("not yet"); });
  return r;
};

describe("registry identity", () => {
  it("resolves by exact family, key and version", () => {
    expect(productionActivityRegistry.resolve(block({}))?.key).toBe("hw-part-3d");
    expect(productionActivityRegistry.resolve(block({}, 2))).toBeUndefined();
  });
});

describe("the strict reader", () => {
  it("reads every model of the course", () => {
    for (const [k, s] of Object.entries(PARTS)) expect(readHwPart3D({ scene: s }), k).not.toBeNull();
    expect(readHwPart3D({ scene: scene(), hint: "تلميح" })?.hint).toBe("تلميح");
  });
  it("refuses anything unexpected", () => {
    expect(readHwPart3D(null)).toBeNull();
    expect(readHwPart3D([])).toBeNull();
    expect(readHwPart3D({ scene: scene(), extra: 1 })).toBeNull();
    expect(readHwPart3D({ scene: scene(), hint: "" })).toBeNull();
    expect(readHwPart3D({ scene: scene(), hint: 5 })).toBeNull();
    const face = scene(); face.targets[0] = { id: "top", kind: "face", label: "وجه", objectId: "board", element: "top" };
    expect(readHwPart3D({ scene: face })).toBeNull();
    const noTargets = scene(); noTargets.targets = [];
    expect(readHwPart3D({ scene: noTargets })).toBeNull();
    const still = scene(); still.interaction.select = false;
    expect(readHwPart3D({ scene: still })).toBeNull();
    const broken = scene(); broken.objects[0].size.x = 1000;
    expect(readHwPart3D({ scene: broken })).toBeNull();
    const bidi = scene(); bidi.title = "x\u202Ey";
    expect(readHwPart3D({ scene: bidi })).toBeNull();
  });
});

describe("the explorer", () => {
  it("an unreadable config says the model is unavailable", async () => {
    const r = await mount(block({ scene: { version: 1 } }));
    expect(r.container.querySelector(".learning-trace-empty")!.textContent).toContain("غير متوفر");
    expect(r.container.querySelector(".i3d")).toBeNull();
  });
  it("draws the model; choosing a piece shows its name and explanation; reset clears the choice", async () => {
    const r = await mount(block({ scene: scene(), hint: "اختر جزءًا" }));
    expect(r.container.querySelector(".i3d svg[role=img]")).not.toBeNull();
    const card = () => r.container.querySelector(".learning-hw3d-card")!.textContent!;
    expect(card()).toBe("اختر جزءًا");
    const list = r.container.querySelector(".i3d-target-list")!;
    const cpu = [...list.querySelectorAll("button")].find(b => b.textContent!.startsWith("المعالج (CPU)"))!;
    fireEvent.click(cpu);
    expect(cpu.getAttribute("aria-pressed")).toBe("true");
    expect(card()).toContain("المعالج (CPU)");
    expect(card()).toContain("العقل المدبّر");
    fireEvent.click(screen.getByRole("button", { name: "إعادة تعيين" }));
    await waitFor(() => expect(card()).toBe("اختر جزءًا"));
  });
});
