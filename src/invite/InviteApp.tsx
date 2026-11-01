import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import "../owner/owner.css";
import { BRAND_NAME } from "../brand";
import BrandMark from "../ui/BrandMark";
import { IconLock, IconWarning, IconCheck } from "../icons";
import { inviteTokenFromHash, INVITE_BARE_HASH } from "./inviteRoute";

/**
 * Tadris+ P2-A2b — the teacher's invitation / password-reset page (`#/invite/<token>`, P2-A2a /api/teacher-invitation).
 *   1. the token is read ONCE from the URL fragment and removed from the address bar and history (history.replaceState);
 *   2. the server says who is invited (display name, username, invitation or reset) — an unusable link is one clear message;
 *   3. the teacher sets their own password (≥ 12 characters + confirmation; the server enforces the policy);
 *   4. done: sign in from the normal sign-in page with that username.
 * The owner never sees the password. Nothing is stored in the browser.
 */
const MIN_PASSWORD = 12;
type Info = { displayName: string; username: string; purpose: "invite" | "reset"; expiresAt: string };
type View = { kind: "loading" } | { kind: "missing" } | { kind: "invalid"; message: string } | { kind: "error"; message: string } | { kind: "form"; info: Info } | { kind: "done"; username: string; reset: boolean };

async function post(action: "inspect" | "accept", body: Record<string, string>): Promise<{ status: number; json: Record<string, unknown> }> {
  try {
    const r = await fetch("/api/teacher-invitation/" + action, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), cache: "no-store", credentials: "same-origin" });
    let json: Record<string, unknown> = {};
    try { json = (await r.json()) as Record<string, unknown>; } catch { json = {}; }
    return { status: r.status, json };
  } catch {
    return { status: 0, json: { error: "تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مرة أخرى." } };
  }
}
const errorText = (json: Record<string, unknown>, fallback: string) => (typeof json.error === "string" && json.error ? json.error : fallback);

export default function InviteApp() {
  // Read once, then forget it from the URL (the fragment never reached a server; now it also leaves the history entry).
  const tokenRef = useRef<string>(inviteTokenFromHash());
  const [view, setView] = useState<View>(() => (tokenRef.current ? { kind: "loading" } : { kind: "missing" }));

  useEffect(() => {
    if (!tokenRef.current) return;
    try { window.history.replaceState(null, "", window.location.pathname + window.location.search + INVITE_BARE_HASH); } catch { /* best effort */ }
    let live = true;
    void post("inspect", { token: tokenRef.current }).then(({ status, json }) => {
      if (!live) return;
      if (status === 200 && json.ok) setView({ kind: "form", info: json as unknown as Info });
      else if (status === 404) setView({ kind: "invalid", message: errorText(json, "الرابط غير صالح أو انتهت صلاحيته.") });
      else setView({ kind: "error", message: errorText(json, "تعذر التحقق من الرابط حاليًا.") });
    });
    return () => { live = false; };
  }, []);

  let body;
  if (view.kind === "loading") body = <p className="auth-sub" role="status">جارٍ التحقق من الرابط…</p>;
  else if (view.kind === "missing") body = (
    <>
      <h1 className="auth-welcome">رابط الدعوة غير مكتمل</h1>
      <p className="auth-sub">افتح الرابط كما وصلك من إدارة المنصة. إذا أعدت تحميل هذه الصفحة بعد فتح الرابط، افتحه مرة أخرى من الرسالة.</p>
    </>
  );
  else if (view.kind === "invalid") body = (
    <>
      <h1 className="auth-welcome">لا يمكن استخدام هذا الرابط</h1>
      <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{view.message}</div>
      <p className="auth-sub">الروابط صالحة 72 ساعة وتُستخدم مرة واحدة، وأي رابط أحدث يُلغي ما قبله.</p>
    </>
  );
  else if (view.kind === "error") body = (
    <>
      <h1 className="auth-welcome">تعذر التحقق من الرابط</h1>
      <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{view.message}</div>
    </>
  );
  else if (view.kind === "form") body = <SetPassword info={view.info} token={tokenRef.current} onDone={(username, reset) => { tokenRef.current = ""; setView({ kind: "done", username, reset }); }} onInvalid={message => setView({ kind: "invalid", message })} />;
  else body = (
    <>
      <h1 className="auth-welcome"><IconCheck size={22} aria-hidden="true" /> {view.reset ? "تم تغيير كلمة المرور" : "تم تفعيل حسابك"}</h1>
      <p className="auth-sub">ادخل الآن من صفحة الدخول باسم المستخدم <bdi dir="ltr"><strong>{view.username}</strong></bdi> وكلمة المرور التي اخترتها.</p>
      <a className="auth-submit eb-invite-go" href={window.location.pathname}>الذهاب إلى صفحة الدخول</a>
    </>
  );

  return (
    <main className="eb-owner-page" dir="rtl">
      <header className="eb-owner-top">
        <span className="eb-owner-brand"><BrandMark size={32} /><bdi dir="ltr">{BRAND_NAME}</bdi></span>
      </header>
      <div className="eb-owner-body">
        <section className="auth-card eb-owner-card" aria-live="polite">{body}</section>
      </div>
    </main>
  );
}

function SetPassword({ info, token, onDone, onInvalid }: { info: Info; token: string; onDone: (username: string, reset: boolean) => void; onInvalid: (m: string) => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reset = info.purpose === "reset";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if ([...password].length < MIN_PASSWORD) { setError(`كلمة المرور قصيرة: ${MIN_PASSWORD} حرفًا على الأقل.`); return; }
    if (password !== confirm) { setError("تأكيد كلمة المرور لا يطابقها."); return; }
    setBusy(true);
    setError("");
    const { status, json } = await post("accept", { token, password });
    setBusy(false);
    if (status === 200 && json.ok) { setPassword(""); setConfirm(""); onDone(String(json.username || info.username), reset); return; }
    if (status === 404) { onInvalid(errorText(json, "الرابط غير صالح أو انتهت صلاحيته.")); return; }
    setError(errorText(json, "تعذر حفظ كلمة المرور حاليًا."));
  }

  return (
    <>
      <h1 className="auth-welcome">{reset ? "إعادة تعيين كلمة المرور" : "تفعيل حسابك"}</h1>
      <p className="auth-sub">مرحبًا <bdi>{info.displayName}</bdi>. اسم المستخدم الخاص بك: <bdi dir="ltr"><strong>{info.username}</strong></bdi>. اختر كلمة مرور لا يعرفها أحد غيرك.</p>
      <form className="auth-form" onSubmit={submit} noValidate>
        <label className="auth-field">
          <span>كلمة المرور الجديدة</span>
          <div className="auth-input"><IconLock size={18} />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" aria-describedby={error ? "eb-invite-error" : undefined} />
          </div>
          <small className="eb-owner-hint">{MIN_PASSWORD} حرفًا على الأقل. عبارة طويلة يسهل تذكّرها أفضل من كلمة معقدة قصيرة.</small>
        </label>
        <label className="auth-field">
          <span>تأكيد كلمة المرور</span>
          <div className="auth-input"><IconLock size={18} />
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
          </div>
        </label>
        {error && <div id="eb-invite-error" className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</div>}
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ كلمة المرور"}</button>
      </form>
    </>
  );
}
