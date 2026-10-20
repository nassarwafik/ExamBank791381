import type { ReactNode } from "react";
import Breadcrumb, { type Crumb } from "./Breadcrumb";

// The identity of a page: optional leading control, breadcrumb, one <h1>. UX-R2: a plain block, not a <header> — the shell's
// full-width top bar is the page's one banner landmark, and a second banner would be ambiguous for assistive technology.
// `icon` is an optional decorative page icon shown beside the title (hidden from assistive technology: the text is the name).
export default function PageHeader({ title, breadcrumb, leading, icon }: { title: string; breadcrumb?: Crumb[]; leading?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="eb-page-header">
      {leading}
      <div className="eb-page-header-text">
        {breadcrumb && breadcrumb.length > 1 && <Breadcrumb items={breadcrumb} />}
        <h1>{icon && <span className="eb-page-header-icon" aria-hidden="true">{icon}</span>}{title}</h1>
      </div>
    </div>
  );
}
