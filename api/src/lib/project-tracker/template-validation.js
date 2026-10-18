// Phase P-1 (B3 / B4) — server-side validation of a teacher's `template.update` patch, run against the class's CURRENT
// snapshot inside the same CAS round (service.updateTemplate `options.validate`). Before this, any `stages` array was
// stored as sent: duplicate ids, unknown tracks or groups, empty titles, a weight of 0 that the engine silently counts as
// 1 (core.stageWeight), or a removed stage whose progress and scores would become orphans. Pure; throws an error with
// httpStatus 400 and an Arabic message on the first problem, so the caller writes nothing.
//
// Rules (only the parts the patch carries are checked):
//   stages       — array (≤ 500); each: non-empty unique stageId (≤ 32), a track of the project, a groupId that exists in
//                  that track (snapshot groups, or the patch's own groups when it sends them), a non-empty title (≤ 200),
//                  a finite order, a finite weight > 0 (≤ 1000) unless it is the SAME value already stored for that stage
//                  (legacy data never blocks an unrelated edit), boolean required / active when present; every stage of
//                  the current snapshot must still be present (deactivate instead of deleting).
//   trackWeights — object keyed by the project's tracks only, finite values ≥ 0, sum > 0.
//   config       — known keys only: staleDays integer 1–365, lateThreshold 0–100, balanceWarningThreshold 0–100.
//   groups       — when sent: array of { groupId (unique, non-empty), track of the project, non-empty title, finite order }.
const MAX_STAGES = 500;
const CONFIG_RULES = {
  staleDays: v => Number.isInteger(v) && v >= 1 && v <= 365,
  lateThreshold: v => Number.isFinite(v) && v >= 0 && v <= 100,
  balanceWarningThreshold: v => Number.isFinite(v) && v >= 0 && v <= 100
};

function fail(message) { const err = new Error(message); err.httpStatus = 400; throw err; }
const isObject = v => !!v && typeof v === "object" && !Array.isArray(v);
const nonEmpty = v => typeof v === "string" && v.trim() !== "";

function validateGroups(groups, trackIds) {
  if (!Array.isArray(groups)) fail("المجموعات يجب أن تكون قائمة.");
  const seen = new Set();
  for (const g of groups) {
    if (!isObject(g) || !nonEmpty(g.groupId)) fail("كل مجموعة تحتاج معرّفًا.");
    if (seen.has(g.groupId)) fail("معرّف المجموعة مكرّر: " + g.groupId);
    seen.add(g.groupId);
    if (!trackIds.has(g.track)) fail("مسار غير معروف للمجموعة " + g.groupId + ".");
    if (!nonEmpty(g.title)) fail("عنوان المجموعة " + g.groupId + " فارغ.");
    if (!Number.isFinite(g.order)) fail("ترتيب المجموعة " + g.groupId + " غير صحيح.");
  }
}

/**
 * @param {object} current  the class snapshot as stored now (stages, groups, trackWeights, config)
 * @param {object} patch    the teacher's patch ({ stages?, groups?, trackWeights?, config? })
 * @param {string[]} tracks the project's track ids (registry)
 */
function validateTemplatePatch(current, patch, tracks) {
  if (!isObject(patch)) fail("بيانات الإعداد غير صحيحة.");
  const trackIds = new Set(tracks);
  if (patch.groups !== undefined) validateGroups(patch.groups, trackIds);
  const groups = Array.isArray(patch.groups) ? patch.groups : (current && Array.isArray(current.groups) ? current.groups : []);
  const groupTrack = new Map(groups.filter(g => g && g.groupId).map(g => [g.groupId, g.track]));

  if (patch.stages !== undefined) {
    if (!Array.isArray(patch.stages)) fail("المراحل يجب أن تكون قائمة.");
    if (patch.stages.length > MAX_STAGES) fail("عدد المراحل أكبر من الحد المسموح (" + MAX_STAGES + ").");
    const storedWeight = new Map(((current && current.stages) || []).filter(s => s && s.stageId).map(s => [s.stageId, s.weight]));
    const seen = new Set();
    for (const s of patch.stages) {
      if (!isObject(s) || !nonEmpty(s.stageId) || s.stageId.trim() !== s.stageId || s.stageId.length > 32) fail("كل مرحلة تحتاج معرّفًا صحيحًا.");
      const id = s.stageId;
      if (seen.has(id)) fail("معرّف المرحلة مكرّر: " + id);
      seen.add(id);
      if (!trackIds.has(s.track)) fail("مسار غير معروف للمرحلة " + id + ".");
      if (groupTrack.get(s.groupId) !== s.track) fail("المجموعة غير موجودة في مسار المرحلة " + id + ".");
      if (!nonEmpty(s.title)) fail("عنوان المرحلة " + id + " فارغ.");
      if (s.title.length > 200) fail("عنوان المرحلة " + id + " أطول من 200 حرف.");
      if (!Number.isFinite(s.order)) fail("ترتيب المرحلة " + id + " غير صحيح.");
      if (s.weight !== undefined) {
        const unchangedLegacy = storedWeight.has(id) && Object.is(storedWeight.get(id), s.weight);
        if (!unchangedLegacy && !(typeof s.weight === "number" && Number.isFinite(s.weight) && s.weight > 0 && s.weight <= 1000)) fail("وزن المرحلة " + id + " يجب أن يكون رقمًا أكبر من 0.");
      }
      if (s.required !== undefined && typeof s.required !== "boolean") fail("قيمة «إلزامية» غير صحيحة للمرحلة " + id + ".");
      if (s.active !== undefined && typeof s.active !== "boolean") fail("قيمة «مفعّلة» غير صحيحة للمرحلة " + id + ".");
    }
    for (const id of storedWeight.keys()) if (!seen.has(id)) fail("لا يمكن حذف المرحلة " + id + " — ألغِ تفعيلها بدلًا من ذلك.");
  }

  if (patch.trackWeights !== undefined) {
    if (!isObject(patch.trackWeights)) fail("أوزان المسارات غير صحيحة.");
    let sum = 0;
    for (const [k, v] of Object.entries(patch.trackWeights)) {
      if (!trackIds.has(k)) fail("مسار غير معروف في الأوزان: " + k);
      if (!(typeof v === "number" && Number.isFinite(v) && v >= 0)) fail("وزن المسار " + k + " يجب أن يكون رقمًا ≥ 0.");
      sum += v;
    }
    if (!(sum > 0)) fail("مجموع أوزان المسارات يجب أن يكون أكبر من 0.");
  }

  if (patch.config !== undefined) {
    if (!isObject(patch.config)) fail("الإعدادات غير صحيحة.");
    for (const [k, v] of Object.entries(patch.config)) {
      const rule = CONFIG_RULES[k];
      if (!rule) fail("إعداد غير معروف: " + k);
      if (!rule(v)) fail("قيمة الإعداد " + k + " خارج النطاق.");
    }
  }
}

module.exports = { validateTemplatePatch };
