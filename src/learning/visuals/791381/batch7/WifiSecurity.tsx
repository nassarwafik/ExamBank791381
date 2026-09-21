import type { LearningVisualProps } from "../../types";

/**
 * «أمان الشبكة اللاسلكية» (Book 791381, PDF 163) — the GENERIC wireless-security concept on this page: wireless is
 * easier to target than wired; the risks are eavesdropping (التنصّت), unauthorized access and Spoofing (انتحال الهوية);
 * the remedy is encryption and a strong password, and the rule is to never leave a Wi-Fi network open without a
 * password. Static diagram (no motion): an OPEN network exposed to the named risks versus a PROTECTED network with
 * encryption + password. Book scope for PDF 163 ONLY — the generic concept and named risks; NO protection-technology
 * names (WEP / WPA / WPA2 / WPA3 arrive on PDF 164).
 */
export default function WifiSecurity({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 200"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏أمان الشبكة اللاسلكية — مفتوحة مقابل محمية</text>

      {/* OPEN network — exposed to the risks */}
      <g data-state="open">
        <rect className="eb-visual-seg" x="16" y="42" width="168" height="120" rx="8" stroke="var(--eb-danger)" />
        <text className="eb-visual-node-label" x="100" y="62" textAnchor="middle" fill="var(--eb-danger)">شبكة مفتوحة</text>
        <text className="eb-visual-meta" x="100" y="82" textAnchor="middle">بلا كلمة مرور — أسهل استهدافًا</text>
        <text className="eb-visual-part-label" x="100" y="104" textAnchor="middle" fill="var(--eb-danger)">المخاطر:</text>
        <text className="eb-visual-meta" x="100" y="122" textAnchor="middle">التنصّت على البيانات</text>
        <text className="eb-visual-meta" x="100" y="138" textAnchor="middle">دخول دون إذن</text>
        <text className="eb-visual-token" x="100" y="154" textAnchor="middle" fontSize="10">Spoofing (انتحال)</text>
      </g>

      {/* PROTECTED network — encryption + password */}
      <g data-state="protected">
        <rect className="eb-visual-seg is-v4" x="196" y="42" width="168" height="120" rx="8" stroke="var(--eb-success)" />
        <text className="eb-visual-node-label" x="280" y="62" textAnchor="middle" fill="var(--eb-success)">شبكة محمية</text>
        <text className="eb-visual-meta" x="280" y="86" textAnchor="middle">تشفير للبيانات</text>
        <text className="eb-visual-meta" x="280" y="108" textAnchor="middle">كلمة مرور قوية</text>
        <text className="eb-visual-meta" x="280" y="134" textAnchor="middle">يصعب التنصّت أو الدخول</text>
      </g>
      <text className="eb-visual-caption-svg" x="190" y="184" textAnchor="middle">‏لا تترك شبكة Wi-Fi مفتوحة دون كلمة مرور أبدًا</text>
    </svg>
  );
}
