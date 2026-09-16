import { IconChevronBack } from "../icons";

export type Crumb = { label: string; onSelect?: () => void };

// Location trail. Ancestors with onSelect are buttons (no routing library here); the last item is the current
// page and carries aria-current="page". The separator is an SVG chevron flipped under dir="rtl".
export default function Breadcrumb({ items }: { items: Crumb[] }) {
  if (!items.length) return null;
  return (
    <nav className="eb-breadcrumb" aria-label="مسار الصفحة">
      <ol>
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={index}>
              {last ? (
                <span aria-current="page">{item.label}</span>
              ) : item.onSelect ? (
                <button type="button" className="eb-breadcrumb-link" onClick={item.onSelect}>{item.label}</button>
              ) : (
                <span>{item.label}</span>
              )}
              {!last && <IconChevronBack size={14} className="eb-breadcrumb-sep eb-flip-rtl" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
