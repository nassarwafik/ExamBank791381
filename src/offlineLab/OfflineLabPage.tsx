import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { isDesktopViewport, plainDeviceRunner } from "../studentTools/deviceCSharpLab";
import { packChannel, readPackInfo, type PackInfo, type PackReply } from "./offlinePack";

const CSharpEditorTool = lazy(() => import("../studentTools/CSharpEditorTool"));

/**
 * Visual lab V14 (docs/enterprise-csharp-visual-lab-plan.md §24; owner decision 2026-11-24) — «مختبر C#»: the learner's OWN programs on
 * their own computer, with «تشغيل» and «تشغيل مرئي» and every drawing. No sign-in, no request to the API, no book content (C#'s own
 * collections only). On a desktop only, as every use of the lab. «تنزيل للعمل بلا إنترنت» asks the service worker to store this page
 * and the lab (static public files, listed in /offline-lab.json); only then does it open offline. «تحديث» / «حذف من الجهاز».
 */
const mb = (bytes: number) => Math.max(1, Math.round(bytes / 1048576));

export default function OfflineLabPage() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  const [info, setInfo] = useState<PackInfo | null>(null);
  const [stored, setStored] = useState<PackReply | null>(null);
  const channel = useMemo(() => packChannel(), []);
  const desktop = useMemo(() => isDesktopViewport(), []);
  const runner = useMemo(() => (desktop ? plainDeviceRunner() : undefined), [desktop]);

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  useEffect(() => { if (online) void readPackInfo().then(setInfo); }, [online]);
  useEffect(() => {
    if (!channel) return;
    const stop = channel.listen(setStored);
    void channel.send("status");
    return stop;
  }, [channel]);

  const installed = stored?.state === "installed" ? stored : null;
  const newer = !!installed && !!info?.available && info.version !== installed.version;
  const pack = !channel ? <p className="olab-note" role="note">هذا المتصفح لا يحفظ الصفحات للعمل بلا إنترنت؛ المختبر يعمل هنا ما دام الاتصال قائمًا.</p>
    : stored?.state === "installing" ? (
      <div className="olab-pack" role="status">
        <span>جارٍ التنزيل… {stored.done} / {stored.total}</span>
        <progress max={stored.total || 1} value={stored.done} aria-label="تنزيل المختبر" />
      </div>
    ) : installed ? (
      <div className="olab-pack">
        <p className="olab-ready" role="status">جاهز بلا إنترنت على هذا الجهاز{newer ? "، وتوجد نسخة أحدث." : "."}</p>
        {newer && online && <button type="button" className="stt-btn is-primary" onClick={() => void channel.send("install")}>تحديث</button>}
        <button type="button" className="stt-btn" onClick={() => void channel.send("remove")}>حذف من الجهاز</button>
      </div>
    ) : info?.available && online ? (
      <div className="olab-pack">
        {stored?.state === "error" && <p className="olab-note" role="alert">تعذّر التنزيل. تحقّق من الاتصال وحاول مرة أخرى.</p>}
        <button type="button" className="stt-btn is-primary" onClick={() => void channel.send("install")}>تنزيل للعمل بلا إنترنت (نحو {mb(info.bytes)} ميغابايت)</button>
        <p className="olab-note">يُحفظ المختبر في هذا المتصفح فقط، ولا يُرسل شيء إلى الخادم.</p>
      </div>
    ) : null;

  return (
    <main className="olab" dir="rtl">
      <header className="olab-head">
        <h1>مختبر C#</h1>
        <p>اكتب برنامجك وشغّله على جهازك، وشاهده خطوة خطوة بـ«تشغيل مرئي». لا يُحفظ برنامجك ولا يُرسل إلى أي مكان.</p>
        {!online && <p className="olab-offline" role="status">أنت الآن بلا اتصال: المختبر يعمل من النسخة المحفوظة على هذا الجهاز.</p>}
      </header>
      {pack}
      {desktop ? (
        <section className="olab-editor" aria-label="المحرر">
          <Suspense fallback={<p className="stt-hint" role="status">جارٍ تحميل المحرر…</p>}>
            <CSharpEditorTool runner={runner} full />
          </Suspense>
        </section>
      ) : (
        <p className="olab-note" role="note">المختبر يعمل على الحاسوب فقط (شاشة عريضة وفأرة).</p>
      )}
    </main>
  );
}
