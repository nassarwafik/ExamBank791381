// DG10 «مكتبة الأيقونات» (docs/enterprise-diagram-editor-design.md §22) — the drawings of the icons listed in diagramIconSet.ts: original,
// flat and coloured, each in a 64 × 64 circle (the people as faceless busts, in the style of the books' organisation charts; women in
// hijab). Plain shapes only (no text, no clip paths, no ids), so a picture saved as PNG or SVG draws them exactly, offline.

import type { ReactNode } from "react";
import { iconOf, type IconGroup } from "./diagramIconSet";

const INK = "#1f2937";
/** The circle behind each group's icons. */
const ICON_BACKDROP: Readonly<Record<IconGroup, string>> = { "أشخاص": "#dbeafe", "المبيعات والمنتجات": "#fef3c7", "الإدارة": "#dcfce7", "التقنية": "#ede9fe" };

const SKIN = "#f2c9a0", SKIN2 = "#e0b088", DARK = "#3f2a1d", BROWN = "#6b4423", GREY = "#9ca3af";
type Person = {
  hair: "short" | "side" | "hijab" | "cap" | "helmet" | "bald"; hairColor?: string; scarf?: string;
  top: string; collar?: "tie" | "shirt" | "round" | "hood" | "vest"; tie?: string; inner?: string;
  glasses?: true; headset?: true; beard?: true; badge?: true;
};
/** A bust inside the circle: the shoulders follow the circle's bottom (r 30 around 32, 32). */
function Bust({ p, at = [0, 0], scale = 1 }: { p: Person; at?: [number, number]; scale?: number }) {
  const hc = p.hairColor ?? DARK;
  const body = "M11.6,54 C13,44.5 20,40 32,40 C44,40 51,44.5 52.4,54 A30,30 0 0 1 11.6,54 Z";
  return (
    <g transform={`translate(${at[0]},${at[1]}) scale(${scale})`}>
      {p.hair === "hijab" && <path d="M19.5,30 C19,16 25,10.5 32,10.5 C39,10.5 45,16 44.5,30 C44.5,36 42,40 38,42 L26,42 C22,40 19.5,36 19.5,30 Z" fill={p.scarf} />}
      <path d={body} fill={p.top} />
      {p.collar === "tie" && <><path d="M26,40 L32,50 L38,40 Z" fill="#fff" /><path d="M30.6,42 L33.4,42 L34.4,51 L32,54 L29.6,51 Z" fill={p.tie ?? "#dc2626"} /></>}
      {p.collar === "shirt" && <path d="M26,40 L32,48 L38,40 Z" fill={p.inner ?? "#fff"} />}
      {p.collar === "round" && <path d="M27,40.3 Q32,44 37,40.3 Z" fill={SKIN2} />}
      {p.collar === "hood" && <path d="M21,43 Q32,49 43,43 Q40,40.5 32,40 Q24,40.5 21,43 Z" fill="#00000022" />}
      {p.collar === "vest" && <><path d="M26,40 L32,47 L38,40 Z" fill={p.inner ?? "#fff"} /><path d="M24,41 L28,58 M40,41 L36,58" stroke="#facc15" strokeWidth={2.4} /></>}
      {p.hair === "hijab" && <path d="M24,39 Q32,46 40,39 L38,44 Q32,48 26,44 Z" fill={p.scarf} />}
      {p.hair !== "hijab" && <rect x={28.5} y={33} width={7} height={8} rx={2} fill={SKIN2} />}
      {p.hair === "hijab"
        ? <ellipse cx={32} cy={26.5} rx={8.2} ry={9.6} fill={SKIN} />
        : <ellipse cx={32} cy={25} rx={9.6} ry={11.2} fill={SKIN} />}
      {p.hair === "short" && <path d="M22.2,25.5 C21,15 26.5,12.6 32,12.6 C38,12.6 43,15.2 41.8,25.5 C41,20 37.5,18.6 32.5,18.4 C28,18.6 24,19.6 22.2,25.5 Z" fill={hc} />}
      {p.hair === "side" && <path d="M22.2,26 C20.5,15.5 26,12.4 32.5,12.4 C38.5,12.4 43.5,15.6 41.8,26 C41,21 38,17.6 33,17.4 C30,19.5 26,20.5 22.2,26 Z" fill={hc} />}
      {p.hair === "bald" && <path d="M22.4,26 C22,22 22.4,21 23.2,20 L23.6,25 Z M41.6,26 C42,22 41.6,21 40.8,20 L40.4,25 Z" fill={GREY} />}
      {p.hair === "cap" && <><path d="M22,21.5 C22,13.5 27,11.4 32,11.4 C37,11.4 42,13.5 42,21.5 Z" fill="#2563eb" /><path d="M20,21.5 H48 Q48,24 44,24 H22 Q20,24 20,21.5 Z" fill="#1d4ed8" /></>}
      {p.hair === "helmet" && <><path d="M21.5,22 C21.5,13 26.5,10.6 32,10.6 C37.5,10.6 42.5,13 42.5,22 Z" fill="#facc15" /><rect x={19} y={21} width={26} height={3.4} rx={1.7} fill="#eab308" /><rect x={30.8} y={10.8} width={2.4} height={10} fill="#eab308" /></>}
      {p.beard && <path d="M22.6,27 C23,34.5 27,37 32,37 C37,37 41,34.5 41.4,27 C39,31.5 36,32.6 32,32.6 C28,32.6 25,31.5 22.6,27 Z" fill={hc} />}
      {p.glasses && <g fill="none" stroke={INK} strokeWidth={1.3}><circle cx={28} cy={26} r={3} /><circle cx={36} cy={26} r={3} /><path d="M31,26 H33" /></g>}
      {p.headset && <><path d="M21.4,26 C21.4,13.5 42.6,13.5 42.6,26" fill="none" stroke={INK} strokeWidth={2} /><rect x={19.6} y={23.5} width={4} height={7} rx={2} fill={INK} />
        <rect x={40.4} y={23.5} width={4} height={7} rx={2} fill={INK} /><path d="M22,30 Q23,35.5 29,35" fill="none" stroke={INK} strokeWidth={1.4} /></>}
      {p.badge && <rect x={39.5} y={46} width={6} height={4} rx={1} fill="#fff" />}
    </g>
  );
}
const PEOPLE: Readonly<Record<string, Person>> = {
  manager: { hair: "side", top: "#1e293b", collar: "tie", tie: "#dc2626" },
  managerF: { hair: "hijab", scarf: "#7c3aed", top: "#1e293b", collar: "shirt" },
  employee: { hair: "short", top: "#2563eb", collar: "shirt" },
  employeeF: { hair: "hijab", scarf: "#0f766e", top: "#60a5fa", collar: "round" },
  customer: { hair: "short", hairColor: BROWN, top: "#16a34a", collar: "round", beard: true },
  customerF: { hair: "hijab", scarf: "#db2777", top: "#f9a8d4", collar: "round" },
  sales: { hair: "side", hairColor: BROWN, top: "#475569", collar: "tie", tie: "#2563eb", badge: true },
  support: { hair: "hijab", scarf: "#2563eb", top: "#93c5fd", collar: "round", headset: true },
  accountant: { hair: "bald", top: "#64748b", collar: "tie", tie: "#16a34a", glasses: true, beard: true, hairColor: GREY },
  developer: { hair: "short", top: "#7c3aed", collar: "hood", glasses: true },
  technician: { hair: "helmet", top: "#ea580c", collar: "vest", inner: "#fdba74" },
  driver: { hair: "cap", top: "#2563eb", collar: "round", beard: true },
  supplier: { hair: "short", hairColor: BROWN, top: "#92400e", collar: "shirt", inner: "#fde68a" },
  student: { hair: "short", top: "#0ea5e9", collar: "round" },
  teacher: { hair: "hijab", scarf: "#92400e", top: "#334155", collar: "shirt", glasses: true },
};

/** The other icons, drawn in the same box. */
const THINGS: Readonly<Record<string, ReactNode>> = {
  team: <>
    <Bust p={{ hair: "hijab", scarf: "#0f766e", top: "#60a5fa", collar: "round" }} at={[-0.5, 6]} scale={0.72} />
    <Bust p={{ hair: "short", hairColor: BROWN, top: "#16a34a", collar: "round" }} at={[18.5, 6]} scale={0.72} />
    <Bust p={{ hair: "side", top: "#1e293b", collar: "tie" }} at={[6.4, 4]} scale={0.8} />
  </>,
  product: <>
    <path d="M32,14 L50,22 L32,30 L14,22 Z" fill="#fcd34d" /><path d="M14,22 L32,30 V50 L14,42 Z" fill="#f59e0b" /><path d="M50,22 L32,30 V50 L50,42 Z" fill="#d97706" />
    <path d="M23,18 L41,26 V33 L37,31 V27.8 L19,20 Z" fill="#fef3c7" />
  </>,
  cart: <>
    <path d="M12,17 H18 L23,39 H45 L50,23 H20" fill="none" stroke={INK} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
    <path d="M21,23 H49 L45,36 H24 Z" fill="#fb923c" /><circle cx={26} cy={45} r={3.4} fill={INK} /><circle cx={42} cy={45} r={3.4} fill={INK} />
  </>,
  invoice: <>
    <path d="M19,12 H40 L46,18 V52 L42,49 L38,52 L34,49 L30,52 L26,49 L22,52 L19,50 Z" fill="#fff" stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
    <path d="M40,12 V18 H46" fill="#e5e7eb" stroke={INK} strokeWidth={1.4} />
    {[22, 27, 32].map(y => <rect key={y} x={23} y={y} width={y === 32 ? 10 : 17} height={2.4} rx={1.2} fill={GREY} />)}
    <rect x={30} y={39} width={12} height={5} rx={1.5} fill="#16a34a" />
  </>,
  order: <>
    <rect x={17} y={13} width={30} height={39} rx={3} fill="#a16207" /><rect x={20} y={17} width={24} height={32} rx={1.5} fill="#fff" /><rect x={26} y={10.5} width={12} height={6} rx={2} fill="#78350f" />
    {[24, 32, 40].map(y => <g key={y}><path d={`M23,${y} L25,${y + 2} L28.5,${y - 2}`} fill="none" stroke="#16a34a" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /><rect x={31} y={y - 1.2} width={10} height={2.4} rx={1.2} fill={GREY} /></g>)}
  </>,
  cash: <>
    <rect x={12} y={26} width={40} height={20} rx={2.5} fill="#15803d" /><rect x={12} y={21} width={40} height={20} rx={2.5} fill="#22c55e" />
    <circle cx={32} cy={31} r={6} fill="#bbf7d0" /><path d="M32,27 V35 M29.6,29.2 Q32,27.2 34.2,29 Q34.6,31 32,31 Q29.4,31 29.8,33 Q32,35 34.4,33" fill="none" stroke="#15803d" strokeWidth={1.3} strokeLinecap="round" />
    <circle cx={17.5} cy={31} r={1.6} fill="#bbf7d0" /><circle cx={46.5} cy={31} r={1.6} fill="#bbf7d0" />
  </>,
  card: <>
    <rect x={11} y={18} width={42} height={28} rx={4} fill="#2563eb" /><rect x={11} y={23} width={42} height={6} fill="#1e3a8a" />
    <rect x={16} y={33} width={8} height={6} rx={1.4} fill="#fcd34d" /><rect x={28} y={38} width={19} height={2.6} rx={1.3} fill="#93c5fd" />
  </>,
  discount: <>
    <path d="M14,32 L30,14 H48 V32 L30,50 Z" fill="#f97316" strokeLinejoin="round" /><circle cx={42} cy={20} r={2.6} fill="#fff7ed" />
    <path d="M27,38 L37,24" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" /><circle cx={27.5} cy={27.5} r={3} fill="none" stroke="#fff" strokeWidth={2} /><circle cx={36} cy={35.5} r={3} fill="none" stroke="#fff" strokeWidth={2} />
  </>,
  store: <>
    <rect x={15} y={28} width={34} height={22} fill="#fff" stroke={INK} strokeWidth={1.4} />
    <path d="M13,20 H51 V27 Q48.6,31 46.2,27 Q43.8,31 41.4,27 Q39,31 36.6,27 Q34.2,31 31.8,27 Q29.4,31 27,27 Q24.6,31 22.2,27 Q19.8,31 17.4,27 Q15.2,31 13,27 Z" fill="#ef4444" />
    {[17.4, 26.8, 36.2, 45.6].map(x => <rect key={x} x={x - 2.4} y={20} width={4.8} height={7} fill="#fff" opacity={0.85} />)}
    <rect x={20} y={35} width={9} height={15} fill="#60a5fa" /><rect x={33} y={35} width={12} height={8} fill="#bfdbfe" />
  </>,
  warehouse: <>
    <path d="M12,27 L32,15 L52,27 V50 H12 Z" fill="#94a3b8" /><rect x={20} y={31} width={24} height={19} fill="#475569" />
    {[35, 39, 43, 47].map(y => <rect key={y} x={20} y={y} width={24} height={1.2} fill="#64748b" />)}
    <rect x={23} y={41} width={8} height={9} fill="#f59e0b" /><rect x={33} y={44} width={7} height={6} fill="#fbbf24" />
  </>,
  truck: <>
    <rect x={9} y={20} width={28} height={20} rx={2} fill="#0ea5e9" /><path d="M37,26 H47 L54,33 V40 H37 Z" fill="#0369a1" /><path d="M40,28 H46 L50.5,33 H40 Z" fill="#bae6fd" />
    <circle cx={19} cy={42} r={5} fill={INK} /><circle cx={19} cy={42} r={2} fill="#e5e7eb" /><circle cx={45} cy={42} r={5} fill={INK} /><circle cx={45} cy={42} r={2} fill="#e5e7eb" />
    <path d="M14,27 H26 M14,32 H22" stroke="#e0f2fe" strokeWidth={2} strokeLinecap="round" />
  </>,
  factory: <>
    <rect x={42} y={13} width={6} height={20} fill="#64748b" /><path d="M12,50 V30 L22,24 V30 L32,24 V30 L42,24 V30 H52 V50 Z" fill="#94a3b8" />
    {[17, 27, 37].map(x => <rect key={x} x={x} y={36} width={6} height={5} fill="#fde68a" />)}<rect x={44} y={40} width={6} height={10} fill="#475569" />
    <circle cx={46} cy={9.5} r={3} fill="#cbd5e1" /><circle cx={50} cy={7} r={2.2} fill="#e2e8f0" />
  </>,
  report: <>
    <path d="M18,11 H39 L46,18 V53 H18 Z" fill="#fff" stroke={INK} strokeWidth={1.6} strokeLinejoin="round" /><path d="M39,11 V18 H46" fill="#e5e7eb" stroke={INK} strokeWidth={1.4} />
    <rect x={22} y={16} width={13} height={2.6} rx={1.3} fill={GREY} />
    <rect x={23} y={38} width={5} height={10} fill="#22c55e" /><rect x={30} y={31} width={5} height={17} fill="#3b82f6" /><rect x={37} y={34} width={5} height={14} fill="#f59e0b" />
    <rect x={22} y={23} width={20} height={2.4} rx={1.2} fill="#d1d5db" />
  </>,
  chart: <>
    <path d="M14,14 V49 H51" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
    <rect x={19} y={36} width={6} height={12} fill="#93c5fd" /><rect x={28} y={30} width={6} height={18} fill="#60a5fa" /><rect x={37} y={24} width={6} height={24} fill="#3b82f6" />
    <path d="M18,33 L28,25 L35,28 L47,15" fill="none" stroke="#16a34a" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /><path d="M41,15 H47 V21" fill="none" stroke="#16a34a" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
  </>,
  calendar: <>
    <rect x={13} y={16} width={38} height={34} rx={3} fill="#fff" stroke={INK} strokeWidth={1.6} /><path d="M13,19 Q13,16 16,16 H48 Q51,16 51,19 V26 H13 Z" fill="#ef4444" />
    <rect x={21} y={11} width={3} height={9} rx={1.5} fill={INK} /><rect x={40} y={11} width={3} height={9} rx={1.5} fill={INK} />
    {[0, 1, 2, 3].flatMap(c => [0, 1, 2].map(r => <rect key={c + "-" + r} x={18 + c * 7.6} y={30 + r * 6.4} width={4.6} height={3.8} rx={1} fill={c === 2 && r === 1 ? "#ef4444" : "#d1d5db"} />))}
  </>,
  contract: <>
    <path d="M17,11 H40 L46,17 V53 H17 Z" fill="#fff" stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
    {[19, 24, 29].map(y => <rect key={y} x={21} y={y} width={y === 29 ? 13 : 20} height={2.4} rx={1.2} fill={GREY} />)}
    <path d="M21,44 Q24,37 26,43 T31,42 T36,43" fill="none" stroke="#2563eb" strokeWidth={1.8} strokeLinecap="round" />
    <path d="M38,50 L52,30 L55,32 L41,52 L37,53 Z" fill="#f59e0b" stroke={INK} strokeWidth={1} strokeLinejoin="round" />
  </>,
  company: <>
    <rect x={16} y={14} width={22} height={38} fill="#3b82f6" /><rect x={38} y={26} width={12} height={26} fill="#1d4ed8" />
    {[19, 26, 33, 40].flatMap(y => [20, 29].map(x => <rect key={x + "-" + y} x={x} y={y} width={5} height={4} fill="#bfdbfe" />))}
    {[30, 37, 44].map(y => <rect key={y} x={41} y={y} width={6} height={3.5} fill="#93c5fd" />)}<rect x={24} y={45} width={6} height={7} fill="#1e3a8a" />
  </>,
  target: <>
    <circle cx={30} cy={34} r={17} fill="#ef4444" /><circle cx={30} cy={34} r={12} fill="#fff" /><circle cx={30} cy={34} r={7} fill="#ef4444" /><circle cx={30} cy={34} r={2.6} fill="#fff" />
    <path d="M30,34 L48,16" stroke={INK} strokeWidth={2.2} strokeLinecap="round" /><path d="M44,14 L50,12 L48,18 Z M46,12 L52,10 L50,16" fill="#16a34a" stroke="#16a34a" strokeWidth={1} strokeLinejoin="round" />
  </>,
  meeting: <>
    <ellipse cx={32} cy={38} rx={18} ry={7} fill="#a16207" /><ellipse cx={32} cy={36.5} rx={18} ry={6} fill="#ca8a04" />
    <circle cx={16} cy={26} r={4.6} fill={SKIN} /><path d="M9,36 Q16,28 23,36 Z" fill="#2563eb" />
    <circle cx={48} cy={26} r={4.6} fill={SKIN} /><path d="M41,36 Q48,28 55,36 Z" fill="#16a34a" />
    <circle cx={32} cy={19} r={4.6} fill={SKIN} /><path d="M25,29.5 Q32,22 39,29.5 Z" fill="#1e293b" />
  </>,
  idea: <>
    <path d="M32,12 C22,12 17,19 17,26 C17,32 21,35 24,39 V43 H40 V39 C43,35 47,32 47,26 C47,19 42,12 32,12 Z" fill="#facc15" />
    <path d="M28,43 V34 L32,30 L36,34 V43" fill="none" stroke="#ca8a04" strokeWidth={1.6} strokeLinejoin="round" />
    <rect x={24} y={43} width={16} height={4} rx={1} fill="#9ca3af" /><rect x={25} y={47.5} width={14} height={3.6} rx={1} fill="#6b7280" /><rect x={28} y={51.5} width={8} height={2.6} rx={1.3} fill="#4b5563" />
  </>,
  computer: <>
    <rect x={12} y={14} width={40} height={27} rx={2.5} fill="#334155" /><rect x={15} y={17} width={34} height={20} fill="#7dd3fc" />
    <path d="M28,41 L26,48 H38 L36,41 Z" fill="#64748b" /><rect x={21} y={48} width={22} height={3} rx={1.5} fill="#334155" />
    <path d="M18,32 L25,25 L30,29 L38,21 L46,28" fill="none" stroke="#0369a1" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
  </>,
  mobile: <>
    <rect x={21} y={9} width={22} height={46} rx={4} fill="#1f2937" /><rect x={23.5} y={14} width={17} height={34} fill="#c7d2fe" />
    {[0, 1].flatMap(r => [0, 1, 2].map(c => <rect key={r + "-" + c} x={25.5 + c * 5} y={17 + r * 6} width={3.6} height={3.6} rx={1} fill={["#ef4444", "#22c55e", "#3b82f6", "#f59e0b", "#a855f7", "#14b8a6"][r * 3 + c]} />))}
    <rect x={25.5} y={31} width={13} height={14} rx={1.5} fill="#fff" /><circle cx={32} cy={51.5} r={1.6} fill="#9ca3af" />
  </>,
  website: <>
    <rect x={10} y={14} width={44} height={36} rx={3} fill="#fff" stroke={INK} strokeWidth={1.6} /><path d="M10,17 Q10,14 13,14 H51 Q54,14 54,17 V22 H10 Z" fill="#6366f1" />
    <circle cx={15} cy={18} r={1.5} fill="#fff" /><circle cx={19.5} cy={18} r={1.5} fill="#fff" /><rect x={25} y={16.5} width={25} height={3} rx={1.5} fill="#c7d2fe" />
    <rect x={14} y={26} width={16} height={12} rx={1} fill="#a5b4fc" />{[27, 32, 37].map(y => <rect key={y} x={33} y={y} width={17} height={2.4} rx={1.2} fill={GREY} />)}
    <rect x={14} y={42} width={36} height={4} rx={1} fill="#e0e7ff" />
  </>,
  database: <>
    {[38, 28, 18].map(y => <g key={y}><path d={`M17,${y} V${y + 8} C17,${y + 13} 47,${y + 13} 47,${y + 8} V${y} Z`} fill="#7c3aed" /><ellipse cx={32} cy={y} rx={15} ry={5} fill={y === 18 ? "#a78bfa" : "#8b5cf6"} /></g>)}
    {[30, 40].map(y => <circle key={y} cx={41} cy={y} r={1.4} fill="#ddd6fe" />)}
  </>,
  server: <>
    {[12, 26, 40].map(y => <g key={y}><rect x={16} y={y} width={32} height={12} rx={2} fill="#475569" /><circle cx={22} cy={y + 6} r={1.8} fill="#22c55e" />
      <rect x={27} y={y + 5} width={16} height={2} rx={1} fill="#94a3b8" /></g>)}
  </>,
  cloud: <path d="M19,46 C10,46 9,34 17,32 C16,22 29,17 34,25 C38,19 50,21 49,31 C57,32 56,46 47,46 Z" fill="#38bdf8" />,
  email: <>
    <rect x={11} y={19} width={42} height={28} rx={3} fill="#fff" stroke={INK} strokeWidth={1.6} /><path d="M12,21 L32,36 L52,21" fill="none" stroke="#ef4444" strokeWidth={2.4} strokeLinejoin="round" />
    <path d="M12,45 L27,32 M52,45 L37,32" stroke="#d1d5db" strokeWidth={1.6} />
  </>,
  security: <>
    <path d="M23,29 V22 C23,11 41,11 41,22 V29" fill="none" stroke="#64748b" strokeWidth={4} /><rect x={17} y={28} width={30} height={23} rx={3} fill="#f59e0b" />
    <circle cx={32} cy={37} r={3.4} fill={INK} /><path d="M30.6,38 H33.4 L34.4,45 H29.6 Z" fill={INK} />
  </>,
  settings: <>
    {Array.from({ length: 8 }, (_, i) => <rect key={i} x={29} y={11} width={6} height={10} rx={1.2} fill="#64748b" transform={`rotate(${i * 45} 32 32)`} />)}
    <circle cx={32} cy={32} r={14} fill="#64748b" /><circle cx={32} cy={32} r={6} fill="#ede9fe" />
  </>,
};

/** One icon, `size` px wide, its top left at (x, y); `backdrop`: the circle's fill (the component's colour, or the group's). */
export function IconGlyph({ id, x, y, size = 56, backdrop }: { id: string | undefined; x: number; y: number; size?: number; backdrop?: string }) {
  const def = iconOf(id);
  const s = size / 64;
  const fill = backdrop ?? (def ? ICON_BACKDROP[def.group] : "#f1f5f9");
  return (
    <g transform={`translate(${x},${y}) scale(${s})`} strokeLinecap="round">
      <circle cx={32} cy={32} r={30} fill={fill} stroke={INK} strokeWidth={1.6} />
      {!def ? <path d="M26,25 Q26,18 32,18 Q38,18 38,24 Q38,28 32,30 V35 M32,41 V42" fill="none" stroke={INK} strokeWidth={2.4} />
        : PEOPLE[def.id] ? <Bust p={PEOPLE[def.id]} /> : THINGS[def.id]}
    </g>
  );
}
