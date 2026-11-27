// DG7 «افتح من مختبر الشبكات» (docs/enterprise-diagram-editor-design.md §7, §19) — the network the learner built and ran in «مختبر الشبكات»
// drawn as a topology diagram: the devices where they stood, the cables with their ports, and the addresses the devices really have (the
// lab's own replay: static and DHCP addresses, router interfaces, serial links, the access point's wireless clients). Pure, no DOM; the
// editor loads this module only when it is used, so the network engine never weighs on the editor itself.

import { kindSpec } from "./diagramCatalog";
import { DIAGRAM_LIMITS, type DEdge, type DiagramDoc, type DNode } from "./diagramDoc";
import { layoutNode } from "./diagramLayout";
import { parseLab, type NetLab } from "./networkLab";
import { isSerialPort } from "./netLabModel";
import { replayLab } from "./netLabReplay";

export type LabDiagram = { doc: DiagramDoc; summary: string; problems: string[] };

/** The lab's device kinds → the topology's devices (the same names). */
const TYPE: Readonly<Record<string, string>> = { router: "router", switch: "switch", hub: "hub", pc: "pc", laptop: "laptop", server: "server", ap: "ap" };
/** Like devices take a crossover cable (the classic rule «افحص المخطط» checks); the lab connects either way. */
const SWITCHING = new Set(["switch", "hub"]);
/** The lab draws its 0…1 positions on a 1000 × 640 sheet; the diagram keeps that shape, spread just enough that no two devices (with
 *  their addresses under them) overlap — never smaller than the lab's own sheet, never larger than ours. */
const LAB = { w: 1000, h: 640 }, MARGIN = { x: 60, y: 40 }, GAP = 36;
function spread(items: { x: number; y: number; w: number; h: number }[]): number {
  let k = 1;
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    const dx = Math.abs(a.x - b.x) * LAB.w, dy = Math.abs(a.y - b.y) * LAB.h;
    const needX = (a.w + b.w) / 2 + GAP, needY = (a.h + b.h) / 2 + GAP;
    // apart enough across OR down is enough
    const kx = dx ? needX / dx : Infinity, ky = dy ? needY / dy : Infinity;
    k = Math.max(k, Math.min(kx, ky));
  }
  const fit = Math.min((2400 - 2 * MARGIN.x - 200) / LAB.w, (1600 - 2 * MARGIN.y - 200) / LAB.h);
  return Math.min(Number.isFinite(k) ? k : fit, fit);
}

/** «g0/0» → «G0/0», «f0/1» → «Fa0/1», «s0/0/0» → «S0/0/0»; a host's eth0 / wlan0 as they are. */
export function portLabel(p: string): string {
  const m = /^(g|f|s)(\d.*)$/i.exec(p);
  if (!m) return p;
  return ({ g: "G", f: "Fa", s: "S" } as const)[m[1].toLowerCase() as "g" | "f" | "s"] + m[2];
}
/** 255.255.255.0 → 24 (a mask that is not contiguous: null). */
export function prefixOf(mask: string | undefined): number | null {
  const o = (mask ?? "").split(".").map(Number);
  if (o.length !== 4 || o.some(x => !Number.isInteger(x) || x < 0 || x > 255)) return null;
  const bits = o.map(x => x.toString(2).padStart(8, "0")).join("");
  return /^1*0*$/.test(bits) ? bits.indexOf("0") < 0 ? 32 : bits.indexOf("0") : null;
}
const withPrefix = (ip: string | undefined, mask: string | undefined) => (ip ? ip + (prefixOf(mask) !== null ? "/" + prefixOf(mask) : "") : "");

/** Reads a «مختبر الشبكات» file (or its draft) strictly, then draws it. */
export function labTextToTopology(text: string): LabDiagram | { error: string } {
  const r = parseLab(text);
  if (!r.ok) return { error: r.message };
  return labToTopology(r.lab);
}

export function labToTopology(lab: NetLab): LabDiagram {
  const problems: string[] = [];
  const cfg = lab.config;
  const step = replayLab(cfg, lab.actions).replay;
  if (!step.ok) problems.push("تعذّر تشغيل إعدادات الأجهزة كما في المختبر، فرُسمت الأجهزة والكوابل بلا عناوين.");
  const state = step.ok ? step.state : null;

  // ── each device, with what it really has ──
  const details = (id: string, kind: string): string[] => {
    if (!state) return [];
    const st = state.devices[id] as unknown as Record<string, unknown> | undefined;
    const out: string[] = [];
    if (kind === "router" && st) {
      const ifs = (st.interfaces ?? {}) as Record<string, { ipAddress?: string; subnetMask?: string; shutdown?: boolean }>;
      const subs = (st.subinterfaces ?? {}) as Record<string, { ipAddress?: string; subnetMask?: string }>;
      for (const [name, f] of Object.entries(ifs).sort(([a], [b]) => a.localeCompare(b))) if (f.ipAddress) out.push(portLabel(name) + ": " + withPrefix(f.ipAddress, f.subnetMask));
      for (const [name, f] of Object.entries(subs).sort(([a], [b]) => a.localeCompare(b))) if (f.ipAddress) out.push(portLabel(name) + ": " + withPrefix(f.ipAddress, f.subnetMask));
      for (const [name, s] of Object.entries(state.lab.routers[id]?.serial ?? {}).sort(([a], [b]) => a.localeCompare(b))) if (s.ip) out.push(portLabel(name) + ": " + withPrefix(s.ip, s.mask));
    } else if (kind === "ap" && st) {
      if (typeof st.ssid === "string" && st.ssid) out.push("SSID: " + st.ssid);
      if (typeof st.address === "string" && st.address) out.push(withPrefix(st.address, st.mask as string | undefined));
    } else if (kind === "pc" || kind === "laptop" || kind === "server") {
      for (const iface of ["eth0", "wlan0"]) {
        const o = state.ops.adapters[id + "/" + iface];
        // a DHCP client that got no lease holds a 169.254 (APIPA) address: the drawing says DHCP, not that stop-gap
        if (o?.status === "apipa") out.push("DHCP");
        else if (o?.address && (o.status === "static" || o.status === "dhcp")) out.push((o.status === "dhcp" ? "DHCP " : "") + withPrefix(o.address, o.mask));
      }
    }
    return out;
  };

  const nodes: DNode[] = [];
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const idOf = new Map<string, string>();
  for (const d of cfg.devices.slice(0, DIAGRAM_LIMITS.nodes)) {
    const type = TYPE[d.kind];
    if (!type) { problems.push("الجهاز «" + d.label + "» من نوع لا يُرسم في الطوبولوجيا، فتُرك."); continue; }
    const spec = kindSpec("topology").nodes.find(n => n.type === type)!;
    const id = "n" + (nodes.length + 1);
    idOf.set(d.id, id);
    const node: DNode = { id, type, x: 0, y: 0, w: spec.minW, h: spec.minH, text: { name: d.label.slice(0, DIAGRAM_LIMITS.text), details: details(d.id, d.kind).join("\n") }, color: "none" };
    // its box as drawn (it grows with its addresses), to be centred where it stood in the lab
    const box = layoutNode({ kind: "topology", nodes: [], edges: [] }, node);
    placed.push({ x: d.x, y: d.y, w: box?.w ?? node.w, h: box?.h ?? node.h });
    nodes.push(node);
  }
  const k = spread(placed);
  nodes.forEach((node, i) => {
    const p = placed[i];
    node.x = Math.max(0, Math.min(DIAGRAM_LIMITS.canvasW - node.w, Math.round(MARGIN.x + 100 + p.x * LAB.w * k - p.w / 2)));
    node.y = Math.max(0, Math.min(DIAGRAM_LIMITS.canvasH - node.h, Math.round(MARGIN.y + 100 + p.y * LAB.h * k - p.h / 2)));
  });
  // devices so close in the lab that the page cannot spread them enough: each one still on another is moved aside, left to right
  const order = nodes.map((_, i) => i).sort((a, b) => nodes[a].x - nodes[b].x || nodes[a].y - nodes[b].y);
  for (let pass = 0; pass < 3; pass++) for (const i of order) for (const j of order) {
    if (j === i) continue;
    const a = nodes[i], b = nodes[j], pa = placed[i], pb = placed[j];
    const hit = a.x < b.x + pb.w + GAP / 2 && b.x < a.x + pa.w + GAP / 2 && a.y < b.y + pb.h + GAP / 2 && b.y < a.y + pa.h + GAP / 2;
    if (!hit || a.x < b.x || (a.x === b.x && i < j)) continue;   // the one further right (or later) moves
    a.x = Math.min(DIAGRAM_LIMITS.canvasW - a.w, b.x + pb.w + GAP);
  }

  // ── the cables, with their ports; and the access points' wireless clients ──
  const kindOf = new Map(cfg.devices.map(d => [d.id, d.kind as string]));
  const edges: DEdge[] = [];
  const edge = (type: string, a: string, b: string, fromLabel = "", toLabel = "") => {
    const from = idOf.get(a), to = idOf.get(b);
    if (!from || !to || edges.length >= DIAGRAM_LIMITS.edges) return;
    edges.push({ id: "e" + (edges.length + 1), type, from, to, label: "", fromLabel, toLabel, y: 0 });
  };
  for (const l of cfg.links) {
    const ka = kindOf.get(l.a.deviceId) ?? "", kb = kindOf.get(l.b.deviceId) ?? "";
    const type = isSerialPort(l.a.port) || isSerialPort(l.b.port) ? "serial" : SWITCHING.has(ka) === SWITCHING.has(kb) ? "cross" : "copper";
    edge(type, l.a.deviceId, l.b.deviceId, portLabel(l.a.port), portLabel(l.b.port));
  }
  if (state) for (const [host, w] of Object.entries(state.ops.wifi).sort(([a], [b]) => a.localeCompare(b))) {
    if (w.status === "associated" && w.ap) edge("wireless", w.ap, host);
  }

  const doc: DiagramDoc = { kind: "topology", nodes, edges };
  const cables = edges.filter(e => e.type !== "wireless").length, radio = edges.length - cables;
  const summary = "رُسمت الشبكة: " + nodes.length + " أجهزة و" + cables + " كوابل" + (radio ? " و" + radio + " اتصالات لاسلكية" : "") + ".";
  return { doc, summary, problems };
}
