// @vitest-environment happy-dom
// Tadris+ P8-A2 — «المظهر» follows the owner's restriction: a value outside `appearanceAllowed` is shown, disabled; an older API
// without it → every value. TEST data only.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import AppearanceSettings from "./AppearanceSettings";
import { clearTeacherAppearance } from "./teacherAppearance";

afterEach(() => { cleanup(); vi.restoreAllMocks(); clearTeacherAppearance(); });
const mount = (allowed?: Record<string, string[]>) => {
  globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, appearance: { theme: "light", palette: "default", density: "comfortable" }, appearanceChoosable: { theme: true, palette: true, density: true }, ...(allowed ? { appearanceAllowed: allowed } : {}) }) }) as Response) as unknown as typeof fetch;
  render(<AppearanceSettings token="t" />);
};
const disabled = async (name: string) => ((await screen.findByRole("radio", { name })) as HTMLInputElement).disabled;

describe("P8-A2 — «المظهر» and the owner's restriction", () => {
  it("only the allowed values can be chosen (the default stays)", async () => {
    mount({ theme: ["light", "dark"], palette: ["default", "ocean"], density: ["comfortable"] });
    expect([await disabled("محيط"), await disabled("غابة"), await disabled("رمل"), await disabled("الافتراضية")]).toEqual([false, true, true, false]);
    expect([await disabled("مدمجة"), await disabled("مريحة"), await disabled("داكن")]).toEqual([true, false, false]);
  });
  it("an older API without the restriction: every value", async () => {
    mount();
    expect([await disabled("غابة"), await disabled("مدمجة")]).toEqual([false, false]);
  });
});
