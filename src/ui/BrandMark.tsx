import { useId } from "react";

// Phase 10A — the ExamBank 791381 brand mark: three "exam lines" whose ends are network nodes joined by a link
// (education + networking), on the platform-blue tile. The SAME artwork ships as public/favicon.svg and, rasterised,
// as the PWA / home-screen icons under public/pwa, so the tab, the installed app and the in-app brand all match.
// Purely decorative wherever it is rendered (aria-hidden); the accessible name stays on the surrounding text.
type Props = { size?: number; rounded?: boolean; className?: string };

export default function BrandMark({ size = 36, rounded = true, className }: Props) {
  const gradientId = useId() + "-eb-brand";
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f6df6" />
          <stop offset="1" stopColor="#1b3fb8" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx={rounded ? 112 : 0} fill={"url(#" + gradientId + ")"} />
      <path d="M176 178 L124 136" stroke="#ffffff" strokeOpacity=".55" strokeWidth="10" strokeLinecap="round" />
      <rect x="171" y="178" width="10" height="156" fill="#ffffff" fillOpacity=".55" />
      <rect x="198" y="154" width="186" height="48" rx="24" fill="#ffffff" />
      <rect x="198" y="232" width="186" height="48" rx="24" fill="#ffffff" />
      <rect x="198" y="310" width="186" height="48" rx="24" fill="#ffffff" />
      <circle cx="176" cy="178" r="32" fill="#7dd3fc" stroke="#ffffff" strokeWidth="8" />
      <circle cx="176" cy="256" r="32" fill="#7dd3fc" stroke="#ffffff" strokeWidth="8" />
      <circle cx="176" cy="334" r="32" fill="#7dd3fc" stroke="#ffffff" strokeWidth="8" />
      <circle cx="124" cy="136" r="14" fill="#7dd3fc" stroke="#ffffff" strokeWidth="6" />
    </svg>
  );
}
