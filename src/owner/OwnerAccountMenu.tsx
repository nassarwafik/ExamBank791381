import { useState } from "react";
import ActionMenu from "../ui/ActionMenu";
import { ownerApi, type OwnerSessionView } from "./ownerApi";
import { OWNER_QR_SCAN_HASH } from "../qrLogin/qrRoute";   // Tadris+ QR-2
import { IconDownload } from "../icons";
import { useDeferredInstallEntry } from "../pwa/useDeferredInstallEntry";   // PWA-INSTALL-ALL

/**
 * UX-O3 — the owner's account menu in the console header (design docs/enterprise-ux-owner-console-o3.md §2.3), on the shared
 * ActionMenu: who is signed in and until when, «حسابك وأمانه» (the account card on «نظرة عامة», unchanged) and «تسجيل الخروج» —
 * the SAME request as the button on «نظرة عامة» (which stays): the session ends on the server, then locally either way.
 * Shown only once signed in. Presentation only.
 * PWA-INSTALL-ALL — «تثبيت التطبيق» while the app is not installed (the student bar's own behaviour, `useDeferredInstallEntry`); its guidance
 * dialog is rendered beside the menu, so it stays when the menu closes.
 */
export default function OwnerAccountMenu({ token, view, onAccount, onSignedOut }: { token: string; view: OwnerSessionView; onAccount: () => void; onSignedOut: () => void }) {
  const [busy, setBusy] = useState(false);
  const install = useDeferredInstallEntry();
  const name = view.owner.displayName || view.owner.username;
  const expires = new Date(view.session.expiresAt);
  const expiresText = Number.isNaN(expires.getTime()) ? "" : expires.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });

  async function signOut() {
    setBusy(true);
    await ownerApi.logout(token);          // the session ends on the server; locally it ends either way
    setBusy(false);
    onSignedOut();
  }

  return (
    <>
    <ActionMenu label={"حساب " + name} className="eb-owner-account" disabled={busy} text={name}
      icon={<span className="eb-owner-avatar" aria-hidden="true">{Array.from(name.trim())[0] || "؟"}</span>}>
      <p className="eb-owner-account-info"><bdi dir="ltr">{view.owner.username}</bdi>{expiresText && <> · الجلسة حتى <bdi>{expiresText}</bdi></>}</p>
      <button type="button" className="eb-menu-item" onClick={onAccount}>حسابك وأمانه</button>
      {/* Tadris+ QR-2 — sign the owner in on another device by scanning the QR its owner sign-in page shows. */}
      <button type="button" className="eb-menu-item" onClick={() => { window.location.hash = OWNER_QR_SCAN_HASH; }}>ربط جهاز آخر بالباركود</button>
      {install.visible && <button type="button" className="eb-menu-item" disabled={install.busy} onClick={install.start}><IconDownload size={16} />تثبيت التطبيق</button>}
      <button type="button" className="eb-menu-item is-danger" onClick={() => void signOut()}>تسجيل الخروج</button>
    </ActionMenu>
    {install.dialog}
    </>
  );
}
