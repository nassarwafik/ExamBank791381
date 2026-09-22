// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import fs from "fs";
import path from "path";
import type { NumberConversionClient } from "./numberConversionClient";

// STRUCTURAL: the teacher preview is the SAME NumberConversionGame students play — the real module is replaced by a
// probe here, so the preview can only render if it goes through that exact component (no fork, no copied JSX).
const seen: { props: Record<string, unknown> | null } = { props: null };
vi.mock("./NumberConversionGame", () => ({
  default: (props: Record<string, unknown>) => { seen.props = props; return <div data-testid="shared-game" />; },
}));
import TeacherNumberConversionPreview from "./TeacherNumberConversionPreview";

afterEach(() => { cleanup(); vi.restoreAllMocks(); seen.props = null; });

describe("TeacherNumberConversionPreview — reuses the student game component", () => {
  it("renders the shared NumberConversionGame in teacher-preview mode with an injected preview client", async () => {
    const onBack = vi.fn();
    const { getByTestId } = render(<TeacherNumberConversionPreview token="builder-tok" onBack={onBack} />);
    expect(getByTestId("shared-game")).toBeTruthy();
    expect(seen.props?.mode).toBe("teacher-preview");
    expect(seen.props?.onBack).toBe(onBack);
    const client = seen.props?.client as NumberConversionClient;
    expect(typeof client.getState).toBe("function");
    expect(typeof client.start).toBe("function");
    expect(typeof client.answer).toBe("function");
    // the injected client is the teacher-preview transport (builder auth → preview endpoint), not the student one
    const calls: [string, RequestInit & { headers: Record<string, string> }][] = [];
    globalThis.fetch = vi.fn(async (u: string, i: RequestInit & { headers: Record<string, string> }) => { calls.push([u, i]); return { ok: true, status: 200, json: async () => ({ ok: true, active: null, continuation: "C" }) }; }) as unknown as typeof fetch;
    await client.start("mixed", "guided");
    expect(calls[0][0]).toBe("/api/game-number-conversion-preview/start");
    expect(calls[0][1].headers["x-builder-token"]).toBe("builder-tok");
    expect(calls[0][1].headers).not.toHaveProperty("x-student-token");
  });

  it("keeps ONE client for the component's lifetime (re-renders never replace the transport mid-round)", () => {
    const { rerender } = render(<TeacherNumberConversionPreview token="builder-tok" onBack={vi.fn()} />);
    const first = seen.props?.client;
    rerender(<TeacherNumberConversionPreview token="builder-tok" onBack={vi.fn()} />);
    expect(seen.props?.client).toBe(first);
  });

  it("no second game / board implementation exists: only NumberConversionGame renders ConversionBoard", () => {
    const dir = path.join(process.cwd(), "src/games");
    const files: string[] = [];
    const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(p); } };
    walk(dir);
    const rel = (p: string) => path.relative(dir, p).split(path.sep).join("/");
    const importsBoard = files.filter(f => /from "\.\/ConversionBoard"|from ".*\/ConversionBoard"/.test(fs.readFileSync(f, "utf8"))).map(rel);
    expect(importsBoard).toEqual(["numberConversion/NumberConversionGame.tsx"]);
    const wrapper = fs.readFileSync(path.join(dir, "numberConversion/TeacherNumberConversionPreview.tsx"), "utf8");
    expect(wrapper).toContain('import NumberConversionGame from "./NumberConversionGame"');
    expect(wrapper).not.toMatch(/ConversionBoard|<form|<input|answerInputFor|guidanceFor/);   // no copied gameplay JSX
  });
});
