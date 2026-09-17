// The ONE student identity-number rule used by the Classes & Students workspace (TeacherPlatform gates create/edit on
// it) and, since UX-8b, by the student form dialogs to name the field-specific error. Pure, no React.
export const validIdentity = (value: string): boolean => /^\d{9}$/.test(value);
export const IDENTITY_ERROR = "رقم الهوية يجب أن يتكوّن من 9 أرقام.";
