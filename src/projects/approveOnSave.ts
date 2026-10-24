// Phase P8 — «اعتماد المرحلة عند حفظ العلامة»: the remembered switch (per device; a storage failure falls back to the default
// ON). Phase G1 — shared by the student profile and the class matrix, so a score saved in either place approves the stage the
// same way, and turning the switch off in one turns it off in the other.
export const APPROVE_ON_SAVE_KEY = "eb.projects.approveOnSave";
export function readApproveOnSave(): boolean {
  try { return window.localStorage.getItem(APPROVE_ON_SAVE_KEY) !== "0"; } catch { return true; }
}
export function writeApproveOnSave(on: boolean) {
  try { window.localStorage.setItem(APPROVE_ON_SAVE_KEY, on ? "1" : "0"); } catch { /* the switch still works for this session */ }
}
