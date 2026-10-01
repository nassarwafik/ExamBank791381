// Phase 16B-A — the authenticated client behind SimulationService (loaded on demand by App; never by the Builder). JSON calls
// go through App's request helper; the raw binary upload uses XMLHttpRequest for progress with the SAME auth headers App
// uses. The token never leaves this closure and is never placed into exam state, localStorage or the sandbox.
import type { SimulationService, SimulationPackageRecord, SimulationUploadResult, SimulationValidationReport } from "./simulationService";

export type SimulationClientDeps = {
  requestJson: <T>(url: string) => Promise<T>;
  authHeaders: () => Record<string, string>;
  uploadUrl?: string;
};
const asRecord = (v: unknown): SimulationPackageRecord => v as SimulationPackageRecord;

export function createSimulationService(deps: SimulationClientDeps): SimulationService {
  const uploadUrl = deps.uploadUrl || "/api/simulators/upload";
  return {
    list: () => deps.requestJson<{ packages?: unknown[] }>("/api/simulators").then(r => (r.packages || []).map(asRecord)),
    versions: packageId => deps.requestJson<{ versions?: unknown[] }>("/api/simulators/" + encodeURIComponent(packageId)).then(r => (r.versions || []).map(asRecord)),
    upload: (file, onProgress) => new Promise<SimulationUploadResult>(resolve => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", uploadUrl, true);
      for (const [k, v] of Object.entries(deps.authHeaders())) xhr.setRequestHeader(k, v);
      xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
      xhr.setRequestHeader("x-file-type", file.type || "application/zip");
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      if (xhr.upload && onProgress) xhr.upload.onprogress = e => { if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total)); };
      xhr.onerror = () => resolve({ status: "error", message: "تعذّر الاتصال بالخادم أثناء الرفع." });
      xhr.onload = () => {
        let body: Record<string, unknown> = {};
        try { body = JSON.parse(xhr.responseText || "{}") as Record<string, unknown>; } catch { body = {}; }
        const report = body.report as SimulationValidationReport | undefined;
        if (xhr.status === 201 || xhr.status === 200) { resolve({ status: body.status === "exists" ? "exists" : "created", package: asRecord(body.package), report }); return; }
        if (xhr.status === 409) { resolve({ status: "conflict", existing: (body.existing as { packageHash: string } | null) ?? null, report }); return; }
        if (xhr.status === 400 && report) { resolve({ status: "rejected", report }); return; }
        resolve({ status: "error", message: typeof body.error === "string" ? body.error : xhr.status === 401 ? "انتهت الجلسة. سجّل الدخول مرة أخرى." : xhr.status === 413 ? "حجم الحزمة يتجاوز الحد المسموح." : "تعذّر رفع الحزمة (" + xhr.status + ")." });
      };
      xhr.send(file);
    })
  };
}
