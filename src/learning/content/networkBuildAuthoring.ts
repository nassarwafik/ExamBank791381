// «ابنِ الشبكة» (docs/enterprise-network-build-exercises.md) — the AUTHORING helpers of a build-the-network exercise (`simulation` /
// `network-build` v1), shared by every book that has them (791381 m29, 791381s m37). Data only: they build the block, its public task,
// its private checks / feedback, and the authored solution network exactly as a learner could build it with the lab's own buttons (ids
// pc1, sw1, r1… and labels PC1, SW1, R1…). Every solution is proven by src/learning/lab/networkBuild.contract.test.ts.
import type { ContentBlock, InlineSpan } from "./types";

export type Dev = { id: string; kind: string; label: string; x: number; y: number; adapters?: string[] };
/** A device with the builder's own naming: id `sw2` → label `SW2`. */
export const dev = (id: string, kind: string, x: number, y: number, adapters?: string[]): Dev =>
  ({ id, kind, label: id.replace(/\d+$/, "").toUpperCase() + id.match(/\d+$/)![0], x, y, ...(adapters ? { adapters } : {}) });
export const cable = (n: number, a: string, ap: string, b: string, bp: string) => ({ id: "l" + n, a: { deviceId: a, port: ap }, b: { deviceId: b, port: bp } });
export const net = (devices: Dev[], links: ReturnType<typeof cable>[]) => ({ v: 2, devices, links });
export const cli = (type: "router.command" | "switch.command", deviceId: string, lines: string[]) => lines.map(command => ({ type, deviceId, command }));
export const ip = (deviceId: string, address: string, gateway = "", dns = "", adapter = "eth0") => ({ type: "host.setStatic", deviceId, adapter, address, mask: "255.255.255.0", gateway, dns });
export const linkCheck = (id: string, label: string, a: string, b: string) => ({ id, label, kind: "build.link", a, b });
export const reach = (id: string, label: string, source: string, destination: string, value = true) => ({ id, label, weight: 1, kind: "reachability", source, destination, value });
export const T = (text: string): InlineSpan => ({ text });
export const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });

export type Exercise = {
  id: string; title: string; description: string; fallback: string;
  intro: string; kinds: string[];
  checks: Record<string, unknown>[];
  hints: string[]; explanation: string;
  solution: { config: Record<string, unknown>; actions: Record<string, unknown>[] };
};
/** One exercise block: the goals are the checks' labels (same ids, same order); a study activity. */
export function buildExercise(e: Exercise): ContentBlock {
  return {
    id: e.id, type: "simulation", origin: "teacher-enrichment", simulationType: "network-build", version: 1,
    title: e.title, description: e.description,
    capabilities: { fullscreen: true, reset: true, interactive: true },
    fallback: { text: e.fallback },
    config: {
      task: { intro: e.intro, goals: e.checks.map(c => ({ id: c.id as string, label: c.label as string })), kinds: e.kinds },
      checks: e.checks,
      feedback: { correctFeedback: "ممتاز! بنيت الشبكة وبرمجتها بنفسك، تمامًا كما يعمل فنّي الشبكات.", incorrectFeedback: "شبكتك لا تحقق كل الأهداف بعد. انظر إلى الأهداف المعلّمة بـ ✕.", hints: e.hints, explanation: e.explanation },
      solution: e.solution,
    },
  } as ContentBlock;
}
/** The short «كيف أعمل في المختبر؟» tip above an exercise. */
export const howTo = (id: string, steps: string[]): ContentBlock => ({
  id, type: "callout", origin: "teacher-enrichment", kind: "tip", title: "كيف أعمل في المختبر؟",
  spans: [T(steps.join(" "))],
} as ContentBlock);
