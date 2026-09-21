import type { LearningVisualProps } from "../../types";

/**
 * «حماية السويتشات والراوترات» (Book 791381, PDF 185) — the FRAMING page: we protect the Cisco DEVICE ITSELF (not the
 * traffic) with passwords, so that only the technician can change its settings. The page names the three ways in which
 * access is controlled — Console, VTY and Enable — each guarded by a password against unauthorized access. Static
 * diagram (no motion): the device at the centre with the three guarded access areas, complete as a still frame. It
 * stays at PDF 185's level: it names the three areas and shows each is password-guarded, but it does NOT show the
 * line/enable COMMANDS (those are PDF 186's card table) nor any password VALUE (PDF 187+). Book scope: protect the
 * device itself · three password-guarded access areas.
 */
const AREAS: [string, string][] = [
  ["console", "Console"],
  ["vty", "VTY"],
  ["enable", "Enable"],
];
export default function DeviceSecurityLayers({ ariaLabel, className }: LearningVisualProps) {
  const colX = (i: number) => 74 + i * 116;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 214"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏نحمي الجهاز نفسه بكلمات المرور</text>

      {/* the three password-guarded access areas */}
      {AREAS.map(([key, label], i) => (
        <g key={key} data-area={key}>
          <rect className="eb-visual-seg is-v4" x={colX(i) - 50} y="44" width="100" height="62" rx="7" />
          <text className="eb-visual-node-label" x={colX(i)} y="64" textAnchor="middle" fontSize="12">{label}</text>
          {/* a small padlock = protected by a password (no command shown) */}
          <rect className="eb-visual-token is-octet" x={colX(i) - 12} y="74" width="24" height="18" rx="3" />
          <path d={`M ${colX(i) - 6} 74 v -4 a 6 6 0 0 1 12 0 v 4`} fill="none" stroke="var(--eb-ink-soft)" strokeWidth="2" />
          <text className="eb-visual-meta" x={colX(i)} y="100" textAnchor="middle">كلمة مرور</text>
        </g>
      ))}

      {/* the device the three areas protect */}
      <rect className="eb-visual-router" x="140" y="130" width="100" height="38" rx="8" />
      <text className="eb-visual-node-label is-inverse" x="190" y="149" textAnchor="middle" dominantBaseline="central" fontSize="12">جهاز Cisco</text>
      {AREAS.map(([key], i) => (
        <line key={key} className="eb-visual-link is-strong" x1={colX(i)} y1="106" x2="190" y2="130" />
      ))}

      <text className="eb-visual-part-label" x="190" y="186" textAnchor="middle">الهدف: يعدّل الإعدادات التقنيّ فقط — تُمنع كل محاولة دخول غير مصرّح بها</text>
      <text className="eb-visual-caption-svg" x="190" y="206" textAnchor="middle">‏حماية الجهاز نفسه: ثلاث طرق للدخول (Console · VTY · Enable) كلٌّ منها محميّ بكلمة مرور</text>
    </svg>
  );
}
