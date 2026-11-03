import { useEffect, useState } from "react";
import "../ui/kit.css";
import "../owner/owner.css";
import { BRAND_NAME } from "../brand";
import BrandMark from "../ui/BrandMark";
import { IconWarning } from "../icons";
import { handoffTokenFromHash, HANDOFF_BARE_HASH } from "./handoffRoute";

/**
 * Tadris+ P4-D — «الانتقال إلى مساحة المعلم الخاصة بي» lands here, in a NEW tab (owner decision D19):
 *   1. the one-time ticket is read ONCE from the URL fragment and removed from the address bar and history;
 *   2. defence in depth: this tab never keeps an owner token (the console opens it with noopener, so it starts with its own empty
 *      session storage; any owner token found here is removed anyway);
 *   3. POST /api/owner-handoff/redeem → an ORDINARY teacher session of the owner's linked teacher account, stored exactly like a
 *      teacher sign-in, then the teacher app opens (its own boot check validates the session with the server);
 *   4. an expired / used / refused ticket is one clear message, with the way back. Nothing else is stored.
 */
const OWNER_TOKEN_KEY = "tadrisOwnerToken";
type View = { kind: "working" } | { kind: "failed"; message: string } | { kind: "missing" };

export default function HandoffApp() {
  const [token] = useState(() => handoffTokenFromHash());
  const [view, setView] = useState<View>(() => (token ? { kind: "working" } : { kind: "missing" }));

  useEffect(() => {
    if (!token) return;
    try { window.history.replaceState(null, "", window.location.pathname + window.location.search + HANDOFF_BARE_HASH); } catch { /* best effort */ }
    try { sessionStorage.removeItem(OWNER_TOKEN_KEY); } catch { /* nothing stored */ }
    let live = true;
    void (async () => {
      let status = 0, json: Record<string, unknown> = {};
      try {
        const r = await fetch("/api/owner-handoff/redeem", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ token }), cache: "no-store", credentials: "same-origin" });
        status = r.status;
        try { json = (await r.json()) as Record<string, unknown>; } catch { json = {}; }
      } catch { status = 0; }
      if (!live) return;
      if (status === 200 && json.ok === true && json.role === "teacher" && typeof json.token === "string" && json.token) {
        try {
          sessionStorage.setItem("examBankBuilderToken", json.token);
          sessionStorage.setItem("examBankSessionRole", "teacher");
          sessionStorage.setItem("examBankSessionDisplayName", typeof json.displayName === "string" ? json.displayName : "");
        } catch { setView({ kind: "failed", message: "تعذر حفظ الجلسة في هذا المتصفح (التخزين معطّل). سجّل الدخول كمعلم من صفحة الدخول." }); return; }
        window.location.replace(window.location.pathname + window.location.search);
        return;
      }
      setView({ kind: "failed", message: status === 0 ? "تعذر الاتصال بالخادم. ارجع إلى لوحة المالك وحاول مرة أخرى." : typeof json.error === "string" && json.error ? json.error : "تعذر فتح مساحة المعلم. ارجع إلى لوحة المالك وحاول مرة أخرى." });
    })();
    return () => { live = false; };
  }, [token]);

  return (
    <main className="eb-owner-page" dir="rtl">
      <header className="eb-owner-top">
        <span className="eb-owner-brand"><BrandMark size={32} /><bdi dir="ltr">{BRAND_NAME}</bdi></span>
      </header>
      <div className="eb-owner-body">
        <section className="auth-card eb-owner-card" aria-labelledby="eb-handoff-title">
          <h1 id="eb-handoff-title" className="auth-welcome">الانتقال إلى مساحة المعلم</h1>
          {view.kind === "working" && <p className="auth-sub" role="status">جارٍ فتح مساحة المعلم الخاصة بك…</p>}
          {view.kind === "failed" && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{view.message}</div>}
          {view.kind === "missing" && <p className="auth-sub" role="alert">رابط الانتقال غير مكتمل أو استُخدم من قبل. افتح لوحة المالك واضغط «الانتقال إلى مساحة المعلم الخاصة بي».</p>}
          {view.kind !== "working" && <a className="auth-submit eb-invite-go" href={window.location.pathname + "#/owner"}>العودة إلى لوحة المالك</a>}
        </section>
      </div>
    </main>
  );
}
