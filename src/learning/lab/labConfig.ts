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
