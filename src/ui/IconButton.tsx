import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children" | "type"> & {
  /** Required accessible name (also shown as the hover tooltip). */
  label: string;
  icon: ReactNode;
  /** Dark-surface variant (sidebar): inverse focus ring and light glyph. */
  inverse?: boolean;
};

// Icon-only control with an enforced accessible name. Minimum 40×40 target, canonical focus ring.
export default function IconButton({ label, icon, inverse, className, ...rest }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={"eb-icon-button" + (inverse ? " eb-on-dark" : "") + (className ? " " + className : "")}
      {...rest}
    >
      {icon}
    </button>
  );
}
