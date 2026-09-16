import type { ReactNode } from "react";
import Breadcrumb, { type Crumb } from "./Breadcrumb";

// The identity of a page: optional leading control (the drawer trigger on small screens), breadcrumb, one <h1>.
export default function PageHeader({ title, breadcrumb, leading }: { title: string; breadcrumb?: Crumb[]; leading?: ReactNode }) {
  return (
    <header className="eb-page-header">
      {leading}
      <div className="eb-page-header-text">
        {breadcrumb && breadcrumb.length > 1 && <Breadcrumb items={breadcrumb} />}
        <h1>{title}</h1>
      </div>
    </header>
  );
}
