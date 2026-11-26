// 791381s Phase 8B-2 — the DEFENSIVE reader of a network lab's served config (the Reader's view of `simulation` / `network-lab`
// v1): the public topology and the task statement only. Anything else the config may carry (an authored body in a tool or test
// still holds `checks` / `feedback` / `solution`) is IGNORED here — the browser never judges a lab; the server does. Pure, small,
// and simulator-free (the workspace validates the topology itself, inside the lazy lab chunk).
export interface NetworkLabView {
  topology: Record<string, unknown>;
  intro: string;
  goals: { id: string; label: string }[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const GOAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

export function readNetworkLabView(config: unknown): NetworkLabView | null {
  if (!isObj(config) || !isObj(config.topology) || !isObj(config.task)) return null;
  const { intro, goals } = config.task as { intro?: unknown; goals?: unknown };
  if (typeof intro !== "string" || !intro.trim() || !Array.isArray(goals) || goals.length === 0 || goals.length > 100) return null;
  const out: { id: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const g of goals) {
    if (!isObj(g) || typeof g.id !== "string" || !GOAL_ID.test(g.id) || seen.has(g.id) || typeof g.label !== "string" || !g.label.trim()) return null;
    seen.add(g.id);
    out.push({ id: g.id, label: g.label });
  }
  return { topology: config.topology, intro, goals: out };
}

// «ابنِ الشبكة» — the DEFENSIVE reader of a build-the-network exercise's served config (`simulation` / `network-build` v1): the task only
// (the statement, the goals and the device kinds the builder offers). Anything else an authored body may carry is ignored.
export interface NetworkBuildView { intro: string; goals: { id: string; label: string }[]; kinds: string[] }
const BUILD_KINDS = ["router", "switch", "pc", "laptop", "ap", "server"];
export function readNetworkBuildView(config: unknown): NetworkBuildView | null {
  if (!isObj(config) || !isObj(config.task)) return null;
  const { kinds } = config.task as { kinds?: unknown };
  if (!Array.isArray(kinds) || kinds.length === 0 || !kinds.every(k => typeof k === "string" && BUILD_KINDS.includes(k))) return null;
  const view = readNetworkLabView({ topology: {}, task: config.task });
  return view ? { intro: view.intro, goals: view.goals, kinds: [...new Set(kinds as string[])] } : null;
}
/** The browser draft of one «ابنِ الشبكة» exercise (the learner's convenience only; the server never reads it). */
export const networkBuildDraftKey = (blockId: string): string => "eb.networkBuild.v1." + blockId;
