// Roadmap #18 — Stage-1 LOCAL parse + normalize of a teacher's roster-import file (JSON or CSV) into the
// canonical { firstName, familyName, identityNumber } shape the server preview/import already accepts.
//
// This runs entirely in the browser on the picked file; nothing is created or sent until the teacher
// explicitly imports. The server is still authoritative — it re-normalizes and re-validates every row
// (manage-students.normalizeBulkStudents + createStudentRecord) — so this module only has to turn a file
// into rows. No XLS/XLSX, no AI parser, no large dependency: a small deterministic CSV reader plus JSON.

import { toAsciiDigits } from "./students/rosterText";

export type ParsedBulkStudent = { firstName: string; familyName: string; identityNumber: string };

// Digits only; a short id is left-padded to 9 (matches the server's normalizeIdentityNumber). A longer
// run of digits is kept as-is so the server can reject it as invalid rather than silently truncating.
// Arabic-Indic digits are digits (mapped first, like the server); a value with letters is kept as text so the preview
// marks it invalid instead of silently stripping the letters into a different, zero-padded identity.
export function normalizeImportedIdentity(value: unknown): string {
  const text = toAsciiDigits(String(value ?? "")).trim();
  if (/[^\d\s\-./]/.test(text)) return text.replace(/\s+/g, "");
  const digits = text.replace(/\D/g, "");
  if (!digits) return "";
  return digits.length <= 9 ? digits.padStart(9, "0") : digits;
}

function splitName(value: unknown): { firstName: string; familyName: string } {
  const parts = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  return { firstName: parts.shift() || "", familyName: parts.join(" ") };
}

// Header alias sets, normalized (lowercased, punctuation/space-stripped) so "First Name", "firstName",
// "الاسم الشخصي" and "שם פרטי" all resolve deterministically. Arabic/Hebrew headers are added inline (no
// dependency). Canonical English names are included so a canonical file always maps.
function normalizeHeader(h: string): string {
  return String(h || "").trim().toLowerCase().replace(/[\s_\-.]/g, "");
}
const FIRST_NAME_HEADERS = new Set([
  "firstname", "first", "givenname", "given",
  "الاسم", "الاسمالشخصي", "الاسمالأول", "الاسمالاول", "الإسم",
  "שמפרטי", "שם"
].map(normalizeHeader));
const FAMILY_NAME_HEADERS = new Set([
  "familyname", "family", "lastname", "last", "surname",
  "العائلة", "اسمالعائلة", "الكنية", "اللقب",
  "שממשפחה", "משפחה"
].map(normalizeHeader));
const IDENTITY_HEADERS = new Set([
  "identitynumber", "idnumber", "identity", "nationalid",
  "رقمالهوية", "الهوية", "هوية",
  "תעודתזהות", "זהות", "מספרזהות", "תז"
].map(normalizeHeader));
// QA2-12 — a student-number column (school code, student id) is the identity only when the file has no explicit identity column:
// rosters often carry both, and «رقم الطالب» / studentId is frequently a running number (1, 2, 3 …). Before, the FIRST matching column
// won, so «رقم الطالب» before «رقم الهوية» created accounts 000000001, 000000002 ….
const STUDENT_NUMBER_HEADERS = new Set(["studentid", "code", "studentcode", "رقمالطالب"].map(normalizeHeader));
// QA-2 — generic headers that rosters also use for a running SERIAL column («رقم» 1, 2, 3 …). They are the identity only when
// the file has no explicit identity header; otherwise every student would become 000000001, 000000002 ….
const WEAK_IDENTITY_HEADERS = new Set(["id", "رقم"].map(normalizeHeader));
const FULLNAME_HEADERS = new Set([
  "displayname", "name", "fullname", "studentname",
  "الاسمالكامل", "الاسمواللقب", "اسمالطالب",
  "שםמלא"
].map(normalizeHeader));

// Excel writes CSV with the list separator of the OS locale: "," in most locales, ";" in many Arabic/European ones,
// and "Unicode text" exports are tab-separated. The delimiter is the candidate that occurs most often (outside quotes)
// in the header line; "," wins ties so canonical files are read exactly as before.
function detectDelimiter(text: string): string {
  const header = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] || "";
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (const ch of header) { if (ch === '"') inQuotes = !inQuotes; else if (!inQuotes && ch in counts) counts[ch]++; }
  return [";", "\t"].reduce((best, d) => counts[d] > counts[best] ? d : best, ",");
}

// Minimal RFC-4180-ish CSV row splitter: handles quoted fields, escaped "" quotes, and delimiters/newlines
// inside quotes. Returns an array of rows, each an array of cell strings. Strips a leading BOM.
function parseCsvRows(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delimiter) { row.push(cell); cell = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ""));
}

function rowsFromJson(json: unknown): ParsedBulkStudent[] {
  const raw: unknown[] = Array.isArray(json)
    ? json
    : (json && typeof json === "object" && Array.isArray((json as { students?: unknown[] }).students))
      ? (json as { students: unknown[] }).students
      : [];
  return raw.map(item => {
    if (typeof item === "string") {
      const names = splitName(item);
      return { firstName: names.firstName, familyName: names.familyName, identityNumber: "" };
    }
    const x = (item || {}) as Record<string, unknown>;
    const directFirst = String(x.firstName ?? x.givenName ?? "").trim();
    const directFamily = String(x.familyName ?? x.lastName ?? x.surname ?? "").trim();
    const names = (directFirst || directFamily)
      ? { firstName: directFirst, familyName: directFamily }
      : splitName(x.displayName ?? x.name ?? x.studentName ?? "");
    const identityNumber = normalizeImportedIdentity(
      x.identityNumber ?? x.idNumber ?? x.nationalId ?? x.studentId ?? x.identity ?? x.code ?? x.studentCode ?? x.id ?? ""   // QA-2: a row id last
    );
    return { firstName: names.firstName, familyName: names.familyName, identityNumber };
  });
}

function rowsFromCsv(text: string): ParsedBulkStudent[] {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];
  const header = rows[0].map(normalizeHeader);
  let iFirst = -1, iFamily = -1, iIdentity = -1, iStudentNumber = -1, iWeakIdentity = -1, iFull = -1;
  header.forEach((h, idx) => {
    if (iFirst < 0 && FIRST_NAME_HEADERS.has(h)) iFirst = idx;
    else if (iFamily < 0 && FAMILY_NAME_HEADERS.has(h)) iFamily = idx;
    else if (iIdentity < 0 && IDENTITY_HEADERS.has(h)) iIdentity = idx;
    else if (iStudentNumber < 0 && STUDENT_NUMBER_HEADERS.has(h)) iStudentNumber = idx;
    else if (iWeakIdentity < 0 && WEAK_IDENTITY_HEADERS.has(h)) iWeakIdentity = idx;
    else if (iFull < 0 && FULLNAME_HEADERS.has(h)) iFull = idx;
  });
  if (iIdentity < 0) iIdentity = iStudentNumber;   // QA2-12: an explicit identity column first, then a student number, then a weak one
  if (iIdentity < 0) iIdentity = iWeakIdentity;
  // A header row is required (canonical fields). If nothing recognizable matched, refuse rather than guess.
  if (iFirst < 0 && iFamily < 0 && iIdentity < 0 && iFull < 0) {
    throw new Error("لم أتعرف على أعمدة الملف. استخدم عناوين: firstName, familyName, identityNumber.");
  }
  const out: ParsedBulkStudent[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const get = (i: number) => (i >= 0 ? String(cells[i] ?? "").trim() : "");
    let firstName = get(iFirst), familyName = get(iFamily);
    if (!firstName && !familyName && iFull >= 0) { const n = splitName(get(iFull)); firstName = n.firstName; familyName = n.familyName; }
    const identityNumber = normalizeImportedIdentity(get(iIdentity));
    out.push({ firstName, familyName, identityNumber });
  }
  return out;
}

function looksLikeCsv(fileName: string, text: string): boolean {
  if (/\.csv$/i.test(fileName)) return true;
  if (/\.json$/i.test(fileName)) return false;
  const trimmed = text.trim();
  return !(trimmed.startsWith("{") || trimmed.startsWith("["));
}

/**
 * Reads a picked roster file as text. UTF-8 is tried first (strictly); a file that is not valid UTF-8 is decoded as
 * Windows-1256 — what Excel's plain "CSV" export writes on an Arabic Windows — so names are not turned into "�".
 */
export async function readImportFileText(file: Blob): Promise<string> {
  if (typeof file.arrayBuffer !== "function" || typeof TextDecoder === "undefined") return file.text();
  const bytes = new Uint8Array(await file.arrayBuffer());
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch {
    try { return new TextDecoder("windows-1256").decode(bytes); }
    catch { return new TextDecoder("utf-8").decode(bytes); }
  }
}

/**
 * The import template: the recognized Arabic headers only (no sample row that could be imported by mistake), UTF-8 with
 * a BOM so Excel opens the Arabic headers correctly.
 */
export const IMPORT_TEMPLATE_CSV = "\uFEFF" + "الاسم,اسم العائلة,رقم الهوية\r\n";

// Parse a picked file's text into normalized rows, dropping fully-empty rows. Throws a friendly (Arabic)
// error for malformed input; the empty-result case is left to the caller to message.
export function parseBulkStudents(text: string, fileName = ""): { students: ParsedBulkStudent[]; format: "json" | "csv" } {
  if (looksLikeCsv(fileName, text)) {
    const students = rowsFromCsv(text).filter(x => x.firstName || x.familyName || x.identityNumber);
    return { students, format: "csv" };
  }
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new Error("ملف JSON غير صالح."); }
  const students = rowsFromJson(json).filter(x => x.firstName || x.familyName || x.identityNumber);
  return { students, format: "json" };
}
