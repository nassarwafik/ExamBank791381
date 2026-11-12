import Dialog from "../ui/Dialog";
import { IosInstallSteps, ManualInstallGuidance } from "./InstallGuidanceViews";
import "./pwa.css";

/** The guidance dialog of the «تثبيت التطبيق» entry (Phase 10C): iPhone / iPad steps, or the browser-menu path. Written once — the
 *  student bar renders it directly (`useInstallEntry`); startup modules load it on the first open (`useDeferredInstallEntry`). */
export default function InstallGuidanceDialog({ open, ios, win, onClose }: { open: boolean; ios: boolean; win: Window; onClose: () => void }) {
  return (
    <Dialog open={open} title={<>تثبيت <bdi dir="ltr">Tadris+</bdi></>} onClose={onClose} size="sm" className="eb-install-dialog">
      <p className="eb-install-desc">افتح <bdi dir="ltr">Tadris+</bdi> من أيقونة على الشاشة الرئيسية مثل أي تطبيق. التثبيت اختياري.</p>
      {ios ? <IosInstallSteps /> : <ManualInstallGuidance win={win} />}
    </Dialog>
  );
}
