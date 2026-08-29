/* ============================================================
   ExamBank — Inline icon set (no external dependency)
   Outline style, 20x20 viewBox, stroke=currentColor.
   Used to replace emoji glyphs in buttons/labels across phases.
   ============================================================ */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base(props: IconProps) {
  const { size = 18, ...rest } = props;
  return {
    width: size,
    height: size,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...rest,
  };
}

export function IconDashboard(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2.5" y="2.5" width="6.5" height="7.5" rx="1.6" />
      <rect x="11" y="2.5" width="6.5" height="4.5" rx="1.6" />
      <rect x="11" y="9.5" width="6.5" height="8" rx="1.6" />
      <rect x="2.5" y="12.5" width="6.5" height="5" rx="1.6" />
    </svg>
  );
}

export function IconStudents(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="7" cy="6.5" r="2.6" />
      <circle cx="14.5" cy="7.5" r="2" />
      <path d="M2 17c0-2.8 2.2-4.7 5-4.7s5 1.9 5 4.7" />
      <path d="M13 17c.2-2 1.6-3.5 3.4-3.9" />
    </svg>
  );
}

export function IconAssignments(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="2.5" width="13" height="15" rx="1.8" />
      <path d="M7 2.5v-.3a1.3 1.3 0 0 1 1.3-1.3h3.4A1.3 1.3 0 0 1 13 2.2v.3" />
      <path d="M6.5 9h7M6.5 12.2h7M6.5 15.4h4.5" />
    </svg>
  );
}

export function IconBuilder(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M11.3 2.6a3 3 0 0 0-4.1 3.8L2.7 11a1.9 1.9 0 0 0 2.7 2.7l4.6-4.5a3 3 0 0 0 3.8-4.1l-2 2-1.9-1.9 2-2Z" />
      <path d="m12.5 12.5 3.6 3.6a1.6 1.6 0 0 0 2.3-2.3l-3.6-3.6" />
    </svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="8.5" width="12" height="8.5" rx="1.8" />
      <path d="M6.5 8.5V6a3.5 3.5 0 0 1 7 0v2.5" />
    </svg>
  );
}

export function IconUnlock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="8.5" width="12" height="8.5" rx="1.8" />
      <path d="M6.5 8.5V6a3.5 3.5 0 0 1 6.6-1.6" />
    </svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 5.5h13" />
      <path d="M7 5.5V4a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 13 4v1.5" />
      <path d="M5.5 5.5 6.2 16a1.6 1.6 0 0 0 1.6 1.5h4.4a1.6 1.6 0 0 0 1.6-1.5l.7-10.5" />
      <path d="M8.3 8.7v5M11.7 8.7v5" />
    </svg>
  );
}

export function IconEdit(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12.9 3.3a1.9 1.9 0 0 1 2.7 2.7L6.4 15.2l-3.6.9.9-3.6 9.2-9.2Z" />
    </svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="7.5" y="7.5" width="9.5" height="9.5" rx="1.6" />
      <path d="M4.9 12.5H4a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 4 2.5h7a1.5 1.5 0 0 1 1.5 1.5v.9" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="8.7" cy="8.7" r="5.4" />
      <path d="m16.5 16.5-3.6-3.6" />
    </svg>
  );
}

export function IconFilter(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.5 4h15M5.5 10h9M8.5 16h3" />
    </svg>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 2.5v10.5M6 9.5l4 4 4-4" />
      <path d="M3.5 16h13" />
    </svg>
  );
}

export function IconUpload(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 13V2.5M6 6.5l4-4 4 4" />
      <path d="M3.5 16h13" />
    </svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m4.5 7 5.5 5.5L15.5 7" />
    </svg>
  );
}

export function IconChevronUp(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m4.5 13 5.5-5.5L15.5 13" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 10.5 8 15l8.5-10" />
    </svg>
  );
}

export function IconWarning(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 2.5 18 16.5H2Z" />
      <path d="M10 8v3.6" />
      <circle cx="10" cy="14.2" r="0.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 2.5H4.6A1.6 1.6 0 0 0 3 4.1v11.8a1.6 1.6 0 0 0 1.6 1.6H8" />
      <path d="M12.5 6.5 17 10l-4.5 3.5M17 10H7.5" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 3.5v13M3.5 10h13" />
    </svg>
  );
}

export function IconArrowUp(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 16V4M4.5 9.5 10 4l5.5 5.5" />
    </svg>
  );
}

export function IconArrowDown(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 4v12M4.5 10.5 10 16l5.5-5.5" />
    </svg>
  );
}

export function IconEye(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2 10s2.8-5.5 8-5.5S18 10 18 10s-2.8 5.5-8 5.5S2 10 2 10Z" />
      <circle cx="10" cy="10" r="2.3" />
    </svg>
  );
}

export function IconEyeOff(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.5 2.5l15 15" />
      <path d="M8.4 4.8A8.6 8.6 0 0 1 10 4.5c5.2 0 8 5.5 8 5.5a13.6 13.6 0 0 1-2.7 3.5M5.6 6.1C3.4 7.6 2 10 2 10s2.8 5.5 8 5.5c1 0 1.9-.2 2.7-.5" />
      <path d="M7.8 8.2a2.3 2.3 0 0 0 3.2 3.2" />
    </svg>
  );
}

export function IconSort(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 4v12M3 7.5 6 4l3 3.5" />
      <path d="M14 16V4M11 12.5l3 3.5 3-3.5" />
    </svg>
  );
}

export function IconUser(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="10" cy="6.8" r="3.3" />
      <path d="M3.5 17c0-3.3 2.9-5.6 6.5-5.6s6.5 2.3 6.5 5.6" />
    </svg>
  );
}

export function IconKey(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="6.3" cy="13.7" r="3.2" />
      <path d="m8.5 11.5 7-7M13 7l2 2M15.5 4.5l2 2" />
    </svg>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 5l10 10M15 5 5 15" />
    </svg>
  );
}

export function IconMore(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="10" cy="4.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="10" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSparkles(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6.5 2.5 7.6 5.4 10.5 6.5 7.6 7.6 6.5 10.5 5.4 7.6 2.5 6.5 5.4 5.4Z" />
      <path d="M14.5 10 15.3 12 17.3 12.8 15.3 13.6 14.5 15.6 13.7 13.6 11.7 12.8 13.7 12Z" />
    </svg>
  );
}

export function IconImage(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2.5" y="4" width="15" height="12" rx="1.8" />
      <circle cx="7" cy="8.2" r="1.4" />
      <path d="m4 15 4.3-4.3a1.6 1.6 0 0 1 2.2 0L16 15" />
    </svg>
  );
}
