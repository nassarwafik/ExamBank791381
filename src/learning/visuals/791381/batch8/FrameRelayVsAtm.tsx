import type { LearningVisualProps } from "../../types";

/**
 * «تقنيات WAN القديمة» (Book 791381, PDF 208) — the page's side-by-side of two older WAN technologies used to move
 * data between remote sites: Frame Relay carries data as Frames and relies on Packet Switching; ATM carries voice,
 * video and data together. Static diagram (no motion): the two labelled cards, complete as a still frame. It reproduces
 * ONLY the book's own comparison at the book's level — it does not modernize, correct or add attributes beyond the two
 * facts printed for each. Book scope for THIS page: Frame Relay (Frames · Packet Switching) vs ATM (voice + video +
 * data).
 */
export default function FrameRelayVsAtm({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 200"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏تقنيات WAN قديمة لنقل البيانات بين المواقع</text>

      {/* Frame Relay */}
      <g data-tech="frame-relay">
        <rect className="eb-visual-seg is-v4" x="20" y="40" width="160" height="118" rx="8" />
        <text className="eb-visual-node-label" x="100" y="62" textAnchor="middle" fontSize="12">Frame Relay</text>
        <rect className="eb-visual-token is-octet" x="46" y="80" width="108" height="22" rx="4" />
        <text className="eb-visual-token" x="100" y="91" textAnchor="middle" dominantBaseline="central" fontSize="9.5">Frames</text>
        <text className="eb-visual-meta" x="100" y="120" textAnchor="middle">ينقل البيانات على شكل Frames</text>
        <text className="eb-visual-meta" x="100" y="138" textAnchor="middle">يعتمد على Packet Switching</text>
      </g>

      {/* ATM */}
      <g data-tech="atm">
        <rect className="eb-visual-seg is-v6" x="200" y="40" width="160" height="118" rx="8" />
        <text className="eb-visual-node-label" x="280" y="62" textAnchor="middle" fontSize="12">ATM</text>
        <text className="eb-visual-token" x="280" y="88" textAnchor="middle" fontSize="10">Voice · Video · Data</text>
        <text className="eb-visual-meta" x="280" y="112" textAnchor="middle">ينقل صوتًا وفيديو</text>
        <text className="eb-visual-meta" x="280" y="130" textAnchor="middle">وبيانات معًا</text>
      </g>

      <text className="eb-visual-caption-svg" x="190" y="186" textAnchor="middle">‏Frame Relay ينقل Frames بـ Packet Switching · ATM يجمع الصوت والفيديو والبيانات</text>
    </svg>
  );
}
