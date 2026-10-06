import type { TopologyDeviceKind } from "../networkTopologyModel";
import type { ReachabilityResult } from "../networkConnectivity";

// Phase 20B — Arabic display text for networkTopology@1 (device kinds, connectivity reasons). Presentation only; shared by the workspace,
// the editor and the review so the three surfaces explain a result in the same words.
export const DEVICE_KIND_LABEL: Readonly<Record<TopologyDeviceKind, string>> = Object.freeze({ router: "راوتر", switch: "سويتش", pc: "حاسوب" });
export const REACH_TEXT: Readonly<Record<string, string>> = Object.freeze({
  SOURCE_NOT_CONFIGURED: "عنوان هذا الحاسوب أو قناع شبكته غير مضبوط.",
  SOURCE_ADDRESS_INVALID: "عنوان هذا الحاسوب ليس عنوان مضيف صالحًا ضمن شبكته (عنوان الشبكة أو عنوان البث).",
  DESTINATION_NOT_CONFIGURED: "الجهاز الوجهة بلا عنوان IPv4 صالح.",
  DESTINATION_UNSUPPORTED: "اختبار الاتصال يدعم الحواسيب والراوترات في هذا الإصدار.",
  SOURCE_NOT_CONNECTED: "هذا الحاسوب غير موصول بأي جهاز.",
  SOURCE_LINK_DOWN: "الوصلة من هذا الحاسوب معطّلة (المنفذ المقابل في وضع shutdown).",
  NO_DEFAULT_GATEWAY: "الوجهة في شبكة أخرى ولا توجد بوابة افتراضية.",
  GATEWAY_NOT_IN_LOCAL_SUBNET: "البوابة الافتراضية ليست ضمن شبكة الحاسوب.",
  GATEWAY_UNREACHABLE: "لا يوجد راوتر يعمل بعنوان البوابة الافتراضية على هذه الشبكة (تحقق من عنوان الواجهة وأنها مفعّلة).",
  NO_ROUTE_TO_DESTINATION: "الراوتر لا يملك شبكة متصلة مباشرة تصل إلى الوجهة (تحقق من عنوان واجهة الراوتر وأنها مفعّلة وموصولة).",
  DESTINATION_UNREACHABLE: "لم يُعثر على الوجهة على الشبكة (تحقق من الوصلات وأرقام VLAN والعناوين).",
  ADDRESS_CONFLICT: "العنوان نفسه مستخدم على أكثر من جهاز في الشبكة نفسها.",
  SAME_DEVICE: "اختر جهازًا آخر.",
  DEVICE_UNKNOWN: "الجهاز غير موجود.",
  SOURCE_NOT_PC: "اختبار الاتصال يبدأ من حاسوب.",
  DESTINATION_INVALID: "عنوان الوجهة غير صالح."
});
export function reachText(r: ReachabilityResult, name: (id: string) => string): string {
  if (r.reachable) return "نجح الاتصال — المسار: " + r.path.map(name).join(" → ");
  return "فشل الاتصال: " + (r.leg === "return" ? "وصل الطلب لكن الرد لم يرجع — " : "") + (REACH_TEXT[r.reason] ?? r.reason);
}
