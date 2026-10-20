import { useId, type ReactNode } from "react";

/**
 * UX-R3 — Card: the reference's flat container — a 1 px hairline border, 8 px radius, no shadow. An optional header carries
 * the title (a real heading, which also names the card as a region) and a quiet end-side `aside` (a "عرض الكل" link, a sort
 * hint, a button). `flush` drops the body padding so a ListRows list can run edge to edge with its own hairlines.
 * Presentation only.
 */
export type CardProps = {
  title?: ReactNode;
  level?: 2 | 3;
  aside?: ReactNode;
  flush?: boolean;
  className?: string;
  children: ReactNode;
};

export default function Card({ title, level = 2, aside, flush = false, className, children }: CardProps) {
  const id = "eb-card-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const Heading = level === 2 ? "h2" : "h3";
  const cls = ["eb-card", flush ? "is-flush" : "", className || ""].filter(Boolean).join(" ");
  return (
    <section className={cls} aria-labelledby={title ? id : undefined}>
      {(title || aside) && (
        <div className="eb-card-head">
          {title && <Heading id={id} className="eb-card-title">{title}</Heading>}
          {aside && <div className="eb-card-aside">{aside}</div>}
        </div>
      )}
      <div className="eb-card-body">{children}</div>
    </section>
  );
}
