import type { LearningVisualProps } from "../../types";

/**
 * «Wi-Fi — الشبكة اللاسلكية» (Book 791381, PDF 160) — Wi-Fi is a connection technology WITHOUT cables that relies on
 * radio waves; a device connects to the network within the coverage area. Motion TEACHES the wireless link: a signal
 * travels from the device to the network over radio waves (three wave arcs light up in sequence, one after another),
 * a finite one-shot demonstration that then rests with the link established — no cable is drawn. Reduced motion ⇒ the
 * device, the network and the (static) wave arcs shown complete. Book scope for PDF 160 ONLY: the radio-wave / no-cable
 * idea — NOT SSID (PDF 162) or security (PDF 163+).
 */
export default function WifiRadioLink({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const DEV = { x: 70, y: 110 }, NET = { x: 300, y: 110 };
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 180"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏Wi-Fi — اتصال بدون كابلات عبر موجات الراديو</text>

      {/* the wireless device */}
      <rect className="eb-visual-node is-target" x={DEV.x - 26} y={DEV.y - 20} width="52" height="40" rx="6" />
      <text className="eb-visual-node-label" x={DEV.x} y={DEV.y} textAnchor="middle" dominantBaseline="central" fontSize="11">جهاز</text>

      {/* the network */}
      <rect className="eb-visual-server" x={NET.x - 30} y={NET.y - 20} width="60" height="40" rx="6" />
      <text className="eb-visual-node-label is-inverse" x={NET.x} y={NET.y} textAnchor="middle" dominantBaseline="central" fontSize="11">الشبكة</text>

      {/* radio waves between them: three arcs light up one after another (finite one-shot) */}
      {[0, 1, 2].map(k => {
        const cx = DEV.x + 34 + k * 52;
        return (
          <path key={k} className="eb-visual-ring" data-wave={k} d={`M ${cx} ${DEV.y - 26} A 26 26 0 0 1 ${cx} ${DEV.y + 26}`}
            fill="none" opacity={reducedMotion ? 1 : 0}>
            {!reducedMotion && <animate id={`wave${k}`} attributeName="opacity"
              begin={k === 0 ? "0.4s" : `wave${k - 1}.end`} dur="0.5s" values="0;1" fill="freeze" />}
          </path>
        );
      })}
      <text className="eb-visual-meta" x="190" y="150" textAnchor="middle">موجات راديو بدل الكابل — ضمن مدى التغطية</text>
      <text className="eb-visual-caption-svg" x="190" y="168" textAnchor="middle">‏الجهاز يتصل بالشبكة لاسلكيًا عبر موجات الراديو</text>
    </svg>
  );
}
