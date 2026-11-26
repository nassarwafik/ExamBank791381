// @vitest-environment happy-dom
// «ابنِ الشبكة» in the Reader: the learner builds the network in the lab's PLAIN mode and the host's check seam judges it.
//   • the builder offers only the task's device kinds — no hub, no example, no file, no IPv6, no serial port;
//   • «تحقّق من شبكتي» is disabled on the empty network; it sends exactly { kind: "network-build", config, actions } and marks every goal
//     from the server's booleans; a change clears the verdict; a failed check says «تعذّر التحقق», never a wrong answer;
//   • the draft follows the network per exercise, and the shell's reset empties it;
//   • the server's issue code is explained in plain words.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import NetworkBuildActivity from "./NetworkBuildActivity";
import { networkBuildDraftKey } from "./labConfig";
import type { ActivityCheck, LearningActivityProps } from "../activities/engine";

const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); localStorage.clear(); });

const BLOCK = {
  id: "nb-test", type: "simulation", origin: "teacher-enrichment", simulationType: "network-build", version: 1, title: "ابنِ",
  config: { task: { intro: "ابنِ سويتشًا وحاسوبين.", goals: [{ id: "sw", label: "في الشبكة سويتش SW1" }, { id: "l1", label: "PC1 موصول بالسويتش SW1" }], kinds: ["switch", "pc"] } },
} as unknown as LearningActivityProps["block"];
function mount(check?: ActivityCheck, reset = 0) {
  const props = { block: BLOCK, commands: { reset }, emit: vi.fn(), check } as unknown as LearningActivityProps;
  return { ...render(<NetworkBuildActivity {...props} />), props };
}
const ui = () => screen.getByTestId("network-build");
const lab = async () => screen.findByTestId("network-lab", {}, { timeout: 4000 });
const click = async (el: HTMLElement) => { fireEvent.click(el); await tick(); };

describe("«ابنِ الشبكة» in the Reader", () => {
  it("the plain builder: the task's kinds only, no example / file / hub / IPv6 / serial", async () => {
    mount(vi.fn());
    const l = await lab();
    const add = within(l).getByRole("group", { name: "إضافة جهاز" });
    expect(within(add).getAllByRole("button").map(b => b.textContent)).toEqual(["+ سويتش", "+ حاسوب"]);
    expect(within(l).queryByTestId("network-lab-example")).toBeNull();
    expect(within(l).queryByRole("button", { name: "افتح ملفًا" })).toBeNull();
    await click(within(add).getByRole("button", { name: "+ حاسوب" }));
    expect(within(l).queryByTestId("network-lab-ipv6")).toBeNull();
    expect(within(ui()).getByRole("button", { name: "تحقّق من شبكتي" })).toBeTruthy();
  });
  it("sends the network, marks the goals from the server's booleans, clears on change, and never calls a failure wrong", async () => {
    const check = vi.fn<ActivityCheck>().mockResolvedValueOnce({ correct: false, parts: { sw: true, l1: false }, feedback: { hints: ["صِل PC1 بـ SW1."] } }).mockRejectedValueOnce(new Error("503"));
    mount(check);
    const l = await lab();
    const btn = within(ui()).getByRole("button", { name: "تحقّق من شبكتي" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);                                        // the empty network
    await click(within(l).getByRole("button", { name: "+ سويتش" }));
    await click(within(l).getByRole("button", { name: "+ حاسوب" }));
    expect(btn.disabled).toBe(false);
    await click(btn); await tick();
    expect(check).toHaveBeenCalledTimes(1);
    const sent = check.mock.calls[0][0] as { kind: string; config: { devices: { id: string; kind: string }[] }; actions: unknown[] };
    expect(sent.kind).toBe("network-build");
    expect(sent.config.devices.map(d => d.id)).toEqual(["sw1", "pc1"]);
    expect(sent.actions).toEqual([]);
    expect(ui().textContent).toMatch(/تحقّق 1 من 2 أهداف/);
    expect(ui().querySelectorAll(".learning-lab-goal.is-right").length).toBe(1);
    expect(ui().textContent).toMatch(/صِل PC1 بـ SW1/);
    // a change clears the verdict
    await click(within(l).getByRole("button", { name: "+ حاسوب" }));
    expect(ui().querySelectorAll(".learning-lab-goal.is-right, .learning-lab-goal.is-wrong").length).toBe(0);
    await click(btn); await tick();
    expect(ui().textContent).toMatch(/تعذّر التحقق من شبكتك الآن/);
    expect(ui().querySelectorAll(".learning-lab-goal.is-wrong").length).toBe(0);
  });
  it("explains the server's issue code", async () => {
    mount(vi.fn<ActivityCheck>().mockResolvedValue({ correct: false, parts: { sw: false, l1: false }, issue: { code: "KIND_NOT_ALLOWED" } }));
    const l = await lab();
    await click(within(l).getByRole("button", { name: "+ سويتش" }));
    await click(within(ui()).getByRole("button", { name: "تحقّق من شبكتي" })); await tick();
    expect(screen.getByTestId("network-build-issue").textContent).toMatch(/لا يطلبه هذا التمرين/);
  });
  it("keeps a draft per exercise; the shell's reset empties it", async () => {
    const first = mount(vi.fn());
    let l = await lab();
    await click(within(l).getByRole("button", { name: "+ سويتش" }));
    expect(localStorage.getItem(networkBuildDraftKey("nb-test"))).toContain("sw1");
    first.unmount();
    mount(vi.fn());
    l = await lab();
    expect(within(within(l).getByTestId("network-lab-devices")).getAllByRole("button").length).toBe(1);
    cleanup();
    const again = mount(vi.fn(), 0);
    await lab();
    again.rerender(<NetworkBuildActivity {...({ ...again.props, commands: { reset: 1 } } as LearningActivityProps)} />);
    l = await lab(); await tick();
    expect(within(l).queryByTestId("network-lab-devices")).toBeNull();
    expect(localStorage.getItem(networkBuildDraftKey("nb-test"))).toBeNull();
  });
  it("without a check seam it is build-only and says so", async () => {
    mount(undefined);
    await lab();
    expect(within(ui()).queryByRole("button", { name: "تحقّق من شبكتي" })).toBeNull();
    expect(ui().textContent).toMatch(/التحقق من الشبكة متاح داخل المنصة/);
  });
});

describe("«ابنِ الشبكة» in LAB mode (task.lab: the routing / ACL / NAT / IPv6 exercises)", () => {
  const LAB_BLOCK = { ...BLOCK, id: "nb-lab", config: { task: { intro: "ابنِ WAN.", goals: [{ id: "wan", label: "R1 وR2 موصولان" }], kinds: ["router", "pc", "hub"], lab: true } } } as unknown as LearningActivityProps["block"];
  it("the builder keeps the whole lab: the offered hub, serial ports, the lab's router commands and IPv6 — still no example and no file", async () => {
    render(<NetworkBuildActivity {...({ block: LAB_BLOCK, commands: { reset: 0 }, emit: vi.fn(), check: vi.fn() } as unknown as LearningActivityProps)} />);
    const l = await lab();
    const add = within(l).getByRole("group", { name: "إضافة جهاز" });
    expect(within(add).getAllByRole("button").map(b => b.textContent)).toEqual(["+ راوتر", "+ حاسوب", "+ Hub"]);
    expect(within(l).queryByTestId("network-lab-example")).toBeNull();
    expect(within(l).queryByRole("button", { name: "افتح ملفًا" })).toBeNull();
    await click(within(add).getByRole("button", { name: "+ راوتر" }));
    await click(within(add).getByRole("button", { name: "+ راوتر" }));
    expect(within(l).getByTestId("network-lab-router-extras")).toBeTruthy();
    fireEvent.change(within(l).getByRole("combobox", { name: "من الجهاز" }), { target: { value: "r1" } }); await tick();
    expect([...within(l).getByRole("combobox", { name: "منفذ الجهاز الأول" }).querySelectorAll("option")].map(o => o.textContent)).toContain("s0/0/0");
    await click(within(add).getByRole("button", { name: "+ حاسوب" }));
    expect(within(l).getByTestId("network-lab-ipv6")).toBeTruthy();
  });
});
