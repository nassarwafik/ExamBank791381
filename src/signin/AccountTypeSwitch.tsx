import "./account-type-switch.css";

/**
 * Tadris+ SIGN-IN-1 — one sign-in screen for every account (owner request): the same card on the main page and on the owner's page
 * starts with «نوع الحساب» — «معلم أو طالب» | «مالك المنصة». Choosing the other type moves to its form. The two forms stay two
 * SURFACES on purpose (P1-A2): the owner's screens are their own lazy chunk that teachers and students never download, and crossing
 * the boundary reloads the page, so the two never share state. This switch is navigation only (links, `aria-current`), tiny, and
 * decides nothing: each form's server route decides who signs in.
 */
export type AccountType = "platform" | "owner";

export default function AccountTypeSwitch({ current }: { current: AccountType }) {
  const path = typeof window === "undefined" ? "/" : window.location.pathname + window.location.search;
  const items: { type: AccountType; label: string; href: string }[] = [
    { type: "platform", label: "معلم أو طالب", href: path },
    { type: "owner", label: "مالك المنصة", href: path + "#/owner" }
  ];
  return (
    <nav className="eb-account-switch" aria-label="نوع الحساب">
      {items.map(item => (
        <a key={item.type} className="eb-account-switch-item" href={item.href} aria-current={item.type === current ? "page" : undefined}>
          {item.label}
        </a>
      ))}
    </nav>
  );
}
