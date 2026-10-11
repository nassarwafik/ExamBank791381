import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children" | "type"> & {
  /** Required accessible name (also shown as the hover tooltip). */
  label: string;
  icon: ReactNode;
  /** Dark-surface variant (sidebar): inverse focus ring and light glyph. */
  inverse?: boolean;
  /** React 19 ref-as-prop (e.g. a trigger that must get focus back when its drawer closes). */
  ref?: Ref<HTMLButtonElement>;
};

// Icon-only control with an enforced accessible name. Minimum 40×40 target, canonical focus ring.
export default function IconButton({ label, icon, inverse, className, ref, ...rest }: Props) {
  return (
    <button
      ref={ref}
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
