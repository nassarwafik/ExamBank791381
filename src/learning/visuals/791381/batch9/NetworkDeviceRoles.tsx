import type { LearningVisualProps } from "../../types";

/**
 * «أجهزة الشبكة — الوظيفة والطبقة» (Book 791381, PDF 234) — the exact five devices the summary table lists, each with
 * its role and the OSI layer it works at: Hub (Physical), Switch (Data Link), Router (Network), Access Point (Data
 * Link), Modem (Physical). Purely a still card grid (no motion). Book scope: exactly these five devices and their
 * printed roles / layers — NO extra device is added.
 */
const DEVICES: { key: string; role: string; layer: string }[] = [
  { key: "Hub", role: "يرسل للجميع (قديم)", layer: "Physical" },
  { key: "Switch", role: "للمقصود فقط ويحفظ MAC", layer: "Data Link" },
  { key: "Router", role: "يربط شبكات مختلفة (IP)", layer: "Network" },
  { key: "Access Point", role: "وصول WiFi لاسلكي", layer: "Data Link" },
  { key: "Modem", role: "يحوّل الإشارة (رقمي ↔ تناظري)", layer: "Physical" },
];
export default function NetworkDeviceRoles({ ariaLabel, className }: LearningVisualProps) {
  const X = 20, W = 340, Y0 = 42, RH = 32;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 214"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏الجهاز · الوظيفة · الطبقة</text>
      {DEVICES.map((d, i) => {
        const y = Y0 + i * RH;
        return (
          <g key={d.key} data-device={d.key} data-layer={d.layer}>
            <rect className="eb-visual-zone" x={X} y={y} width={W} height={28} rx="6" />
            <text className="eb-visual-node-label" x={X + 12} y={y + 14} dominantBaseline="central" textAnchor="start" fontSize="11" direction="ltr">{d.key}</text>
            <text className="eb-visual-meta" x={X + 150} y={y + 14} dominantBaseline="central" textAnchor="middle">{d.role}</text>
            <text className="eb-visual-part-label" x={X + W - 12} y={y + 14} dominantBaseline="central" textAnchor="end" direction="ltr">{d.layer}</text>
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="208" textAnchor="middle">‏الطبقة تكشف ما «يفهمه» كل جهاز: إشارة أم MAC أم IP</text>
    </svg>
  );
}
