// Class-scoped temporary batch of GENERATED student credentials (plaintext, UI-only).
//
// SECURITY: these are one-time plaintext passwords. This model is intentionally in-memory only — it is
// NEVER persisted to localStorage/sessionStorage/backend (this module touches no storage at all), it
// carries the class it was generated FOR (so a JSON download always uses the ORIGINAL class metadata,
// never the currently-selected class), and it is only shown while its owning class is selected. Pure
// and unit-testable; the TeacherPlatform panel is thin glue over these helpers.

export type CredentialLite = {
  userId?: string;
  firstName?: string;
  familyName?: string;
  displayName?: string;
  code: string;
  identityNumber?: string;
  password: string;
};

export type CredentialBatch = {
  classId: string;
  className: string;
  credentials: CredentialLite[];
  createdAt: string;
  collapsed: boolean;
};

// Capture the class AT GENERATION TIME (never derive it later from the selected class).
export function openCredentialBatch(
  classId: string,
  className: string,
  credentials: CredentialLite[],
  createdAt: string = new Date().toISOString()
): CredentialBatch {
  return { classId, className, credentials: Array.isArray(credentials) ? credentials : [], createdAt, collapsed: false };
}

export function toggleCredentialBatchCollapsed(batch: CredentialBatch): CredentialBatch {
  return { ...batch, collapsed: !batch.collapsed };
}

// The panel is shown ONLY for the class the credentials belong to — switching classes hides it
// (without discarding it), and returning shows it again until it is explicitly closed.
export function credentialBatchVisible(batch: CredentialBatch | null, selectedClassId: string): boolean {
  return !!batch && batch.credentials.length > 0 && batch.classId === selectedClassId;
}

// Download payload uses the batch's OWN class metadata + generation time — never the current selection.
export function buildCredentialsDownload(batch: CredentialBatch): {
  classId: string;
  className: string;
  generatedAt: string;
  students: { firstName: string; familyName: string; displayName: string; identityNumber: string; password: string }[];
} {
  return {
    classId: batch.classId,
    className: batch.className,
    generatedAt: batch.createdAt,
    students: batch.credentials.map(x => ({
      firstName: x.firstName || "",
      familyName: x.familyName || "",
      displayName: x.displayName || "",
      identityNumber: x.identityNumber || x.code,
      password: x.password
    }))
  };
}
