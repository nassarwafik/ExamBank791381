import { memo, type ReactNode } from "react";
import { DIAGRAM_COLORS, edgeSpec, TEXT_INK, type DeviceIcon, type EdgeSpec, type MarkerKind } from "./diagramCatalog";
import type { DEdge, DiagramDoc } from "./diagramDoc";
import { FONT_FAMILY, FONT_SIZE, ICON_SIZE, ICON_TOP, LINE, SLANT, SMALL, SMALL_LINE, lifelineBottom, measureText, textDir, textStyle, type EdgePath, type NodeBox } from "./diagramLayout";
import { IconGlyph } from "./diagramIcons";

// «محرّر المخططات» — how each component and arrow is drawn: plain SVG with its paint written on each element (no CSS), on white paper, so
// the drawing looks the same in a light or a dark app and the saved picture is exactly what the learner sees. Original artwork only.

export const INK = "#1f2937";
export const PAPER = "#ffffff";
const STROKE = 1.6;

type TextProps = { x: number; y: number; children: string; size?: number; bold?: boolean; align?: "center" | "left" | "right"; underline?: boolean; italic?: boolean; fill?: string };
/** One line of text in its own direction: centred on x, or starting (left) / ending (right) at x whatever its direction. */
function T({ x, y, children, size = FONT_SIZE, bold, align = "center", underline, italic, fill = INK }: TextProps) {
  if (!children) return null;
  const dir = textDir(children);
  const anchor = align === "center" ? "middle" : (align === "left") === (dir === "ltr") ? "start" : "end";
  return (
    <text x={x} y={y} fontFamily={FONT_FAMILY} fontSize={size} fontWeight={bold ? 600 : 400} fill={fill} textAnchor={anchor} dominantBaseline="central"
      direction={dir} textDecoration={underline ? "underline" : undefined} fontStyle={italic ? "italic" : undefined}>{children}</text>
  );
}
/** Lines centred around `cy`. */
function Lines({ lines, cx, cy, bold = true, underline, size = FONT_SIZE, step = LINE }: { lines: readonly string[]; cx: number; cy: number; bold?: boolean; underline?: boolean; size?: number; step?: number }) {
  const top = cy - ((lines.length - 1) * step) / 2;
  return <>{lines.map((l, i) => <T key={i} x={cx} y={top + i * step} bold={bold} underline={underline} size={size}>{l}</T>)}</>;
}
/** A line of a compartment: code (left to right) from the left edge, Arabic from the right edge. */
function SideLine({ text, b, y, keyed }: { text: string; b: NodeBox; y: number; keyed: boolean }) {
  const key = /^(PK|FK)\s+/i.exec(text);
  const body = key ? text.slice(key[0].length) : text;
  const rtl = textDir(body) === "rtl";
  const pad = keyed ? 34 : 12;   // a table with keys keeps one column for its field names
  return (
    <g>
      {key && <text x={b.x + 8} y={y} fontFamily={FONT_FAMILY} fontSize={10} fontWeight={700} fill={key[1].toUpperCase() === "PK" ? "#b45309" : "#2563eb"} dominantBaseline="central" direction="ltr">{key[1].toUpperCase()}</text>}
      <text x={rtl ? b.x + b.w - 12 : b.x + pad} y={y} fontFamily={FONT_FAMILY} fontSize={SMALL} fill={INK} dominantBaseline="central" direction={rtl ? "rtl" : "ltr"}
        textAnchor="start" textDecoration={key && key[1].toUpperCase() === "PK" ? "underline" : undefined}>{body}</text>
    </g>
  );
}

function Compartments({ b, fill }: { b: NodeBox; fill: string }) {
  const out: ReactNode[] = [];
  let y = b.y + 8;
  if (b.spec.stereotype) { out.push(<T key="s" x={b.x + b.w / 2} y={y + SMALL_LINE / 2} size={SMALL}>{b.spec.stereotype}</T>); y += SMALL_LINE; }
  out.push(<T key="n" x={b.x + b.w / 2} y={y + LINE / 2 + 2} bold underline={b.spec.underline}>{b.title[0] ?? ""}</T>);
  y += LINE + 4;
  b.sections.forEach((lines, si) => {
    out.push(<line key={"d" + si} x1={b.x} y1={y} x2={b.x + b.w} y2={y} stroke={INK} strokeWidth={1.2} />);
    y += 5;
    const keyed = lines.some(l => /^(PK|FK)\s+/i.test(l));
    lines.forEach((l, li) => out.push(<SideLine key={si + "-" + li} text={l} b={b} y={y + SMALL_LINE / 2 + li * SMALL_LINE} keyed={keyed} />));
    y += Math.max(1, lines.length) * SMALL_LINE + 5;
  });
  return <><rect x={b.x} y={b.y} width={b.w} height={b.h} fill={fill} stroke={INK} strokeWidth={STROKE} rx={b.node.type === "table" ? 4 : 0} />{out}</>;
}

function Actor({ cx, top }: { cx: number; top: number }) {
  return (
    <g fill="none" stroke={INK} strokeWidth={STROKE} strokeLinecap="round">
      <circle cx={cx} cy={top + 11} r={9} fill={PAPER} />
      <path d={`M${cx},${top + 20} V${top + 42} M${cx - 17},${top + 28} H${cx + 17} M${cx},${top + 42} L${cx - 14},${top + 62} M${cx},${top + 42} L${cx + 14},${top + 62}`} />
    </g>
  );
}

/** The network devices: small original drawings in a 48 × 40 box. */
export function DeviceGlyph({ icon, x, y }: { icon: DeviceIcon; x: number; y: number }) {
  const blue = "#1d4ed8", light = "#dbeafe";
  const g = (c: ReactNode) => <g transform={`translate(${x},${y})`} strokeLinejoin="round" strokeLinecap="round">{c}</g>;
  switch (icon) {
    case "router": return g(<>
      <ellipse cx={24} cy={26} rx={21} ry={9} fill={blue} /><rect x={3} y={14} width={42} height={12} fill={blue} /><ellipse cx={24} cy={14} rx={21} ry={9} fill="#3b82f6" stroke={blue} />
      <path d="M14,14 L20,11 M14,14 L20,17 M34,14 L28,11 M34,14 L28,17 M14,14 H20 M34,14 H28" stroke="#fff" strokeWidth={1.8} fill="none" />
    </>);
    case "switch": return g(<>
      <rect x={2} y={10} width={44} height={22} rx={3} fill={blue} />
      <path d="M9,17 H24 L20,14 M39,25 H24 L28,28 M9,17 L13,14 M9,17 L13,20 M39,25 L35,22 M39,25 L35,28" stroke="#fff" strokeWidth={1.8} fill="none" />
    </>);
    case "hub": return g(<>
      <rect x={2} y={13} width={44} height={16} rx={3} fill="#64748b" />
      {[10, 18, 26, 34].map(cx => <circle key={cx} cx={cx + 2} cy={21} r={2.2} fill="#fff" />)}
    </>);
    case "pc": return g(<>
      <rect x={8} y={3} width={32} height={23} rx={2} fill={light} stroke={INK} strokeWidth={1.6} /><path d="M24,26 V32 M16,35 H32" stroke={INK} strokeWidth={2} />
    </>);
    case "laptop": return g(<>
      <rect x={10} y={6} width={28} height={20} rx={2} fill={light} stroke={INK} strokeWidth={1.6} /><path d="M4,32 L10,26 H38 L44,32 Z" fill="#cbd5e1" stroke={INK} strokeWidth={1.4} />
    </>);
    case "server": return g(<>
      <rect x={13} y={1} width={22} height={38} rx={2} fill="#e2e8f0" stroke={INK} strokeWidth={1.6} />
      {[9, 17, 25].map(yy => <path key={yy} d={`M17,${yy} H31`} stroke={INK} strokeWidth={1.4} />)}<circle cx={24} cy={33} r={2} fill="#16a34a" />
    </>);
    case "ap": return g(<>
      <rect x={10} y={24} width={28} height={12} rx={3} fill={light} stroke={INK} strokeWidth={1.6} />
      <path d="M17,17 Q24,11 31,17 M12,12 Q24,1 36,12" fill="none" stroke={blue} strokeWidth={2} /><circle cx={24} cy={21} r={2} fill={blue} />
    </>);
    case "printer": return g(<>
      <rect x={14} y={2} width={20} height={12} fill={PAPER} stroke={INK} strokeWidth={1.4} /><rect x={6} y={12} width={36} height={17} rx={3} fill="#cbd5e1" stroke={INK} strokeWidth={1.6} />
      <rect x={14} y={24} width={20} height={12} fill={PAPER} stroke={INK} strokeWidth={1.4} />
    </>);
    case "phone": return g(<>
      <rect x={16} y={2} width={16} height={34} rx={3} fill={light} stroke={INK} strokeWidth={1.6} /><circle cx={24} cy={31} r={1.8} fill={INK} />
    </>);
    case "firewall": return g(<>
      <rect x={4} y={6} width={40} height={28} fill="#fecaca" stroke="#b91c1c" strokeWidth={1.6} />
      <path d="M4,15 H44 M4,25 H44 M16,6 V15 M32,6 V15 M10,15 V25 M24,15 V25 M38,15 V25 M16,25 V34 M32,25 V34" stroke="#b91c1c" strokeWidth={1.2} />
    </>);
    case "cloud": return g(
      <path d="M12,34 C3,34 2,22 10,21 C9,11 22,8 26,15 C30,8 42,11 40,21 C47,22 46,34 38,34 Z" fill="#e0f2fe" stroke="#0369a1" strokeWidth={1.6} />
    );
  }
}

const MemoNode = memo(function NodeShape({ b }: { b: NodeBox }) {
  const fill = DIAGRAM_COLORS[b.node.color]?.fill ?? PAPER;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const s = { stroke: INK, strokeWidth: STROKE };
  switch (b.form) {
    case "compartments": return <Compartments b={b} fill={fill} />;
    case "rect": case "round": {
      const body = b.sections[0];
      const titleCy = body ? b.y + 12 + (b.title.length * LINE) / 2 : cy;
      return <>
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={b.form === "round" ? 14 : 0} fill={fill} {...s} />
        <Lines lines={b.title} cx={cx} cy={titleCy} />
        {body && <><line x1={b.x} y1={b.y + 16 + b.title.length * LINE} x2={b.x + b.w} y2={b.y + 16 + b.title.length * LINE} {...s} strokeWidth={1} />
          <Lines lines={body} cx={cx} cy={b.y + 22 + b.title.length * LINE + ((body.length - 1) * SMALL_LINE) / 2 + 4} bold={false} size={SMALL} step={SMALL_LINE} /></>}
      </>;
    }
    case "terminal": return <>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={b.h / 2} fill={fill} {...s} />
      <Lines lines={b.title} cx={cx} cy={cy} />
    </>;
    case "parallelogram": return <>
      <polygon points={`${b.x + SLANT},${b.y} ${b.x + b.w},${b.y} ${b.x + b.w - SLANT},${b.y + b.h} ${b.x},${b.y + b.h}`} fill={fill} {...s} strokeLinejoin="round" />
      <Lines lines={b.title} cx={cx} cy={cy} />
    </>;
    case "subroutine": return <>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={fill} {...s} />
      <path d={`M${b.x + 10},${b.y} V${b.y + b.h} M${b.x + b.w - 10},${b.y} V${b.y + b.h}`} {...s} />
      <Lines lines={b.title} cx={cx} cy={cy} />
    </>;
    case "doubleRect": return <>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={fill} {...s} /><rect x={b.x + 4} y={b.y + 4} width={b.w - 8} height={b.h - 8} fill="none" {...s} />
      <Lines lines={b.title} cx={cx} cy={cy} />
    </>;
    case "ellipse": case "doubleEllipse": case "dashedEllipse": return <>
      <ellipse cx={cx} cy={cy} rx={b.w / 2} ry={b.h / 2} fill={fill} {...s} strokeDasharray={b.form === "dashedEllipse" ? "6 4" : undefined} />
      {b.form === "doubleEllipse" && <ellipse cx={cx} cy={cy} rx={b.w / 2 - 4} ry={b.h / 2 - 4} fill="none" {...s} />}
      <Lines lines={b.title} cx={cx} cy={cy} underline={b.spec.underline} bold={false} />
    </>;
    case "diamond": case "doubleDiamond": {
      const pts = (i: number) => `${cx},${b.y + i} ${b.x + b.w - i * 1.6},${cy} ${cx},${b.y + b.h - i} ${b.x + i * 1.6},${cy}`;
      return <>
        <polygon points={pts(0)} fill={fill} {...s} />
        {b.form === "doubleDiamond" && <polygon points={pts(5)} fill="none" {...s} />}
        <Lines lines={b.title} cx={cx} cy={cy} />
      </>;
    }
    case "circle": return <>
      <circle cx={cx} cy={cy} r={b.w / 2} fill={fill} {...s} />
      {b.number && <><T x={cx} y={b.y + 26} size={SMALL} bold>{b.number}</T><line x1={b.x + b.w * 0.15} y1={b.y + 38} x2={b.x + b.w * 0.85} y2={b.y + 38} {...s} strokeWidth={1} /></>}
      <Lines lines={b.title} cx={cx} cy={cy + (b.number ? 10 : 0)} />
    </>;
    case "processGS": return <>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={10} fill={fill} {...s} />
      <line x1={b.x} y1={b.y + 26} x2={b.x + b.w} y2={b.y + 26} {...s} strokeWidth={1.2} />
      <T x={cx} y={b.y + 13} size={SMALL} bold>{b.number}</T>
      <Lines lines={b.title} cx={cx} cy={b.y + 26 + (b.h - 26) / 2} />
    </>;
    case "store": return <>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={fill} stroke="none" />
      <path d={`M${b.x + b.w},${b.y} H${b.x} V${b.y + b.h} H${b.x + b.w} M${b.x + 46},${b.y} V${b.y + b.h}`} fill="none" {...s} />
      <T x={b.x + 23} y={cy} size={SMALL} bold>{b.number}</T>
      <Lines lines={b.title} cx={b.x + 46 + (b.w - 46) / 2} cy={cy} />
    </>;
    case "cylinder": {
      const ry = 9;
      return <>
        <path d={`M${b.x},${b.y + ry} V${b.y + b.h - ry} A${b.w / 2},${ry} 0 0 0 ${b.x + b.w},${b.y + b.h - ry} V${b.y + ry}`} fill={fill} {...s} />
        <ellipse cx={cx} cy={b.y + ry} rx={b.w / 2} ry={ry} fill={fill} {...s} />
        <Lines lines={b.title} cx={cx} cy={cy + ry / 2} />
      </>;
    }
    case "actor": return <><Actor cx={cx} top={b.y} /><Lines lines={b.title} cx={cx} cy={b.y + 64 + (b.title.length * LINE) / 2} /></>;
    case "note": {
      const f = 12;
      return <>
        <path d={`M${b.x},${b.y} H${b.x + b.w - f} L${b.x + b.w},${b.y + f} V${b.y + b.h} H${b.x} Z`} fill={b.node.color === "none" ? "#fefce8" : fill} {...s} strokeWidth={1.2} />
        <path d={`M${b.x + b.w - f},${b.y} V${b.y + f} H${b.x + b.w}`} fill="none" {...s} strokeWidth={1.2} />
        <Lines lines={b.title} cx={cx} cy={cy} bold={false} />
      </>;
    }
    case "component": return <>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={fill} {...s} />
      <g transform={`translate(${b.x + b.w - 26},${b.y + 8})`}><rect x={4} y={0} width={16} height={20} fill={PAPER} {...s} strokeWidth={1.2} />
        <rect x={0} y={4} width={8} height={4} fill={PAPER} {...s} strokeWidth={1.2} /><rect x={0} y={12} width={8} height={4} fill={PAPER} {...s} strokeWidth={1.2} /></g>
      <Lines lines={b.title} cx={b.x + (b.w - 24) / 2} cy={cy} />
    </>;
    case "text": {   // DG10: a free text, no frame: its lines in its size, in its colour's deep shade
      const z = textStyle(b.node.text.size), step = Math.round(z.px * 1.4);
      const top = cy - (b.title.length * step) / 2 + step / 2;
      return <>{b.title.map((l, i) => <T key={i} x={cx} y={top + i * step} size={z.px} bold={z.bold} fill={TEXT_INK[b.node.color] ?? INK}>{l}</T>)}</>;
    }
    case "icon": {   // DG10: the picture (its circle in the component's colour, if it has one), its name, its short description
      const under = b.y + ICON_TOP + ICON_SIZE + 6;
      return <>
        <IconGlyph id={b.node.text.icon} x={cx - ICON_SIZE / 2} y={b.y + ICON_TOP} size={ICON_SIZE} backdrop={b.node.color !== "none" ? fill : undefined} />
        <Lines lines={b.title} cx={cx} cy={under + (b.title.length * LINE) / 2} />
        {(b.sections[0] ?? []).map((l, i) => <T key={i} x={cx} y={under + b.title.length * LINE + SMALL_LINE / 2 + i * SMALL_LINE} size={SMALL - 1} fill="#334155">{l}</T>)}
      </>;
    }
    case "device": return <>
      {b.node.color !== "none" && <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={8} fill={fill} />}
      <DeviceGlyph icon={b.spec.icon!} x={cx - 24} y={b.y + 2} />
      <Lines lines={b.title} cx={cx} cy={b.y + 46 + (b.title.length * LINE) / 2} />
      {b.sections[0].map((l, i) => <T key={i} x={cx} y={b.y + 46 + b.title.length * LINE + SMALL_LINE / 2 + i * SMALL_LINE} size={SMALL - 1} fill="#334155">{l}</T>)}
    </>;
    case "container": {
      const lane = b.spec.vertical, dashed = b.node.type === "zone";
      return <>
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={b.node.type === "composite" ? 16 : lane ? 0 : 6}
          fill={b.node.color === "none" ? (dashed ? "#f8fafc" : PAPER) : fill} {...s} strokeDasharray={dashed ? "8 5" : undefined} />
        {lane && <line x1={b.x} y1={b.y + 34} x2={b.x + b.w} y2={b.y + 34} {...s} />}
        {dashed ? <T x={b.x + b.w - 12} y={b.y + 17} bold align="right">{b.title[0] ?? ""}</T> : <T x={cx} y={b.y + 17} bold>{b.title[0] ?? ""}</T>}
      </>;
    }
    case "node3d": {
      const d = 12;
      return <>
        <path d={`M${b.x},${b.y + d} L${b.x + d},${b.y} H${b.x + b.w} V${b.y + b.h - d} L${b.x + b.w - d},${b.y + b.h} M${b.x + b.w - d},${b.y + d} L${b.x + b.w},${b.y}`} fill="#e2e8f0" {...s} />
        <rect x={b.x} y={b.y + d} width={b.w - d} height={b.h - d} fill={b.node.color === "none" ? PAPER : fill} {...s} />
        <T x={b.x + (b.w - d) / 2} y={b.y + d + 16} bold>{b.title[0] ?? ""}</T>
      </>;
    }
    case "frame": {
      const op = b.title[0] ?? "", tw = Math.max(46, op.length * 9 + 22);
      return <>
        <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" {...s} />
        <path d={`M${b.x},${b.y + 22} H${b.x + tw - 8} L${b.x + tw},${b.y + 14} V${b.y}`} fill={PAPER} {...s} />
        <T x={b.x + (tw - 4) / 2} y={b.y + 11} bold size={SMALL}>{op}</T>
        <T x={b.x + tw + 8} y={b.y + 12} align="left" size={SMALL}>{b.sections[0][0] ?? ""}</T>
      </>;
    }
    case "start": return <circle cx={cx} cy={cy} r={b.w / 2} fill={INK} />;
    case "end": return <><circle cx={cx} cy={cy} r={b.w / 2} fill={PAPER} {...s} /><circle cx={cx} cy={cy} r={b.w / 2 - 6} fill={INK} /></>;
    case "bar": return <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={2} fill={INK} />;
    case "lifeline": return null;   // drawn with the doc (its line reaches the lowest message)
  }
});
export const NodeShape = MemoNode;

/** A sequence diagram's lifeline: the head (a box or a figure) and the dashed line down to under the lowest message. */
export function Lifeline({ b, bottom }: { b: NodeBox; bottom: number }) {
  const cx = b.x + b.w / 2;
  const actor = b.node.type === "actorLifeline";
  const headBottom = actor ? b.y + 64 + LINE : b.y + b.h;
  return <>
    <line x1={cx} y1={headBottom} x2={cx} y2={bottom} stroke={INK} strokeWidth={1.2} strokeDasharray="6 5" />
    {actor ? <><Actor cx={cx} top={b.y} /><T x={cx} y={b.y + 64 + LINE / 2} bold>{b.title[0] ?? ""}</T></>
      : <><rect x={b.x} y={b.y} width={b.w} height={b.h} fill={DIAGRAM_COLORS[b.node.color]?.fill ?? PAPER} stroke={INK} strokeWidth={STROKE} />
        <T x={cx} y={b.y + b.h / 2} bold underline={b.title[0]?.includes(":")}>{b.title[0] ?? ""}</T></>}
  </>;
}

/** The arrow heads (each points along +x with its tip at refX; a start marker is turned round). */
export function Markers({ prefix }: { prefix: string }) {
  const m = (id: MarkerKind, w: number, h: number, refX: number, body: ReactNode) => (
    <marker id={prefix + id} viewBox={`0 0 ${w} ${h}`} refX={refX} refY={h / 2} markerWidth={w} markerHeight={h} markerUnits="userSpaceOnUse" orient="auto-start-reverse">{body}</marker>
  );
  return (
    <defs>
      {m("arrow", 12, 12, 12, <path d="M0,0 L12,6 L0,12 Z" fill={INK} />)}
      {m("open", 13, 14, 12, <path d="M1,1 L12,7 L1,13" fill="none" stroke={INK} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />)}
      {m("triangle", 16, 16, 15, <path d="M1,1 L15,8 L1,15 Z" fill={PAPER} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />)}
      {m("diamond", 22, 14, 21, <path d="M1,7 L11,1 L21,7 L11,13 Z" fill={PAPER} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />)}
      {m("diamondFilled", 22, 14, 21, <path d="M1,7 L11,1 L21,7 L11,13 Z" fill={INK} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />)}
      {m("crow", 18, 18, 17, <path d="M2,1 V17 M5,9 L17,1 M5,9 L17,9 M5,9 L17,17" fill="none" stroke={INK} strokeWidth={1.5} />)}
      {m("bar", 16, 16, 15, <path d="M6,1 V15 M10,1 V15" fill="none" stroke={INK} strokeWidth={1.5} />)}
    </defs>
  );
}

/** A text on an arrow, on a patch of paper so the line never runs through it. */
function EdgeText({ x, y, children, size = SMALL, bold }: { x: number; y: number; children: string; size?: number; bold?: boolean }) {
  if (!children) return null;
  const w = measureText(children, size, bold) + 8, h = size + 6;
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={3} fill={PAPER} />
      <text x={x} y={y} fontFamily={FONT_FAMILY} fontSize={size} fontWeight={bold ? 600 : 400} fill={INK} textAnchor="middle" dominantBaseline="central" direction={textDir(children)}>{children}</text>
    </g>
  );
}

export const EdgeShape = memo(function EdgeShape({ edge, path, spec, prefix }: { edge: DEdge; path: EdgePath; spec: EdgeSpec; prefix: string }) {
  const color = spec.color ?? INK;
  const dash = spec.dash === "dashed" ? "7 5" : spec.dash === "dotted" ? "2 5" : undefined;
  const marker = (k: MarkerKind) => (k === "none" ? undefined : `url(#${prefix}${k})`);
  return (
    <g>
      {spec.double && <path d={path.d} fill="none" stroke={color} strokeWidth={5.5} />}
      <path d={path.d} fill="none" stroke={spec.double ? PAPER : color} strokeWidth={spec.double ? 2 : spec.color ? 2.2 : STROKE} strokeDasharray={dash}
        strokeLinecap={spec.dash === "dotted" ? "round" : undefined} markerStart={spec.double ? undefined : marker(spec.start)} markerEnd={spec.double ? undefined : marker(spec.end)} />
      {spec.zigzag && <path transform={`translate(${path.mid.x},${path.mid.y}) rotate(${path.angle})`} d="M-9,0 L-3,-7 L3,7 L9,0" fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" />}
      <EdgeText x={path.mid.x} y={path.mid.y - (spec.zigzag ? 14 : 0)}>{edge.label}</EdgeText>
      <EdgeText x={path.fromAt.x} y={path.fromAt.y} bold>{edge.fromLabel}</EdgeText>
      <EdgeText x={path.toAt.x} y={path.toAt.y} bold>{edge.toLabel}</EdgeText>
    </g>
  );
});

/** The whole drawing (components under the arrows; containers under everything). */
export function DiagramDrawing({ doc, boxes, paths, prefix }: { doc: DiagramDoc; boxes: ReadonlyMap<string, NodeBox>; paths: ReadonlyMap<string, EdgePath>; prefix: string }) {
  const bottom = doc.kind === "sequence" ? lifelineBottom(doc) : 0;
  return (
    <g>
      {doc.nodes.map(n => {
        const b = boxes.get(n.id);
        if (!b) return null;
        return <g key={n.id} data-node={n.id}>{b.form === "lifeline" ? <Lifeline b={b} bottom={bottom} /> : <NodeShape b={b} />}</g>;
      })}
      {doc.edges.map(e => {
        const p = paths.get(e.id), spec = edgeSpec(doc.kind, e.type);
        return p && spec ? <g key={e.id} data-edge={e.id}><EdgeShape edge={e} path={p} spec={spec} prefix={prefix} /></g> : null;
      })}
    </g>
  );
}
