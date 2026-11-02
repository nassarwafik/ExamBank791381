// Tadris+ P3-A/P3-B2 — the Arabic wording of an access refusal, shared by every owner route that saves a revision.
const ACCESS_REFUSAL = Object.freeze({
  PRESET_UNKNOWN: "الحزمة المختارة غير موجودة.",
  PRESET_REQUIRED: "التطبيق الفعلي للصلاحيات مفعّل: اختر حزمة صلاحيات للمعلم الجديد.",
  CAPABILITY_UNKNOWN: "صلاحية غير معروفة.",
  CAPABILITY_DUPLICATE: "صلاحية مكررة في القائمة.",
  CAPABILITY_CONFLICT: "لا يمكن منح صلاحية ومنعها في الوقت نفسه.",
  PLATFORM_CAPABILITY_FORBIDDEN: "صلاحيات المنصة للمالك وحده، ولا تُمنح لمعلم.",
  DEPENDENCY_UNMET: "صلاحية تحتاج صلاحية أخرى غير ممنوحة.",
  RESOURCES_NOT_SUPPORTED: "تخصيص الموارد يأتي في مرحلة لاحقة.",
  REVISION_MALFORMED: "طلب غير صالح."
});
module.exports = { ACCESS_REFUSAL };
