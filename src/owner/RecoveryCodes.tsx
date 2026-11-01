import { useState } from "react";
import { IconCopy, IconDownload, IconCheck } from "../icons";

/**
 * Tadris+ P1-A2 — the owner's one-time recovery codes, shown ONCE (after the bootstrap and after a regeneration). Codes are
 * read left-to-right in a monospace list; «نسخ» copies them, «تنزيل» saves a plain text file on this device. Nothing is sent.
 */
export default function RecoveryCodes({ codes, ownerLabel }: { codes: string[]; ownerLabel: string }) {
  const [copied, setCopied] = useState(false);
  const text = ["Tadris+ — رموز الاسترداد لحساب مالك المنصة: " + ownerLabel, "كل رمز يُستخدم مرة واحدة فقط.", "", ...codes].join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([text + "\n"], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "tadris-owner-recovery-codes.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="eb-owner-recovery">
      <ol className="eb-owner-recovery-list" dir="ltr" aria-label="رموز الاسترداد">
        {codes.map(code => <li key={code}><code>{code}</code></li>)}
      </ol>
      <div className="eb-owner-actions">
        <button type="button" className="eb-owner-secondary" onClick={copy}>
          {copied ? <IconCheck size={16} aria-hidden="true" /> : <IconCopy size={16} aria-hidden="true" />}
          {copied ? "تم النسخ" : "نسخ الرموز"}
        </button>
        <button type="button" className="eb-owner-secondary" onClick={download}>
          <IconDownload size={16} aria-hidden="true" />
          تنزيل ملف نصي
        </button>
      </div>
      <p className="eb-owner-hint" role="status" aria-live="polite">{copied ? "نُسخت الرموز. الصقها في مكان آمن خارج هذا الجهاز." : ""}</p>
    </div>
  );
}
