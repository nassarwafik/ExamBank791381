// Phase 16B-A — a dependency-free, DEFENSIVE ZIP reader for uploaded SmartSim packages. It parses the central directory,
// verifies every entry's local header, and inflates each member through a BOUNDED inflater (zlib maxOutputLength) so a
// header that lies about its size, or a bomb-like member, is refused before memory is spent. Nothing here evaluates content.
// Unsupported: ZIP64, encryption, spanned archives, data descriptors without sizes (all refused as INVALID_ZIP).
const zlib = require("node:zlib");

const SIG_LOCAL = 0x04034b50, SIG_CENTRAL = 0x02014b50, SIG_EOCD = 0x06054b50;
const EOCD_MIN = 22, EOCD_MAX_COMMENT = 0xffff;

class ZipError extends Error { constructor(code, message) { super(message); this.code = code; } }

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/** True when the buffer starts with the local-file-header magic ("PK\x03\x04"). */
function hasZipMagic(buf) { return Buffer.isBuffer(buf) && buf.length >= 4 && buf.readUInt32LE(0) === SIG_LOCAL; }

function findEocd(buf) {
  const start = Math.max(0, buf.length - EOCD_MIN - EOCD_MAX_COMMENT);
  for (let i = buf.length - EOCD_MIN; i >= start; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      const commentLength = buf.readUInt16LE(i + 20);
      if (i + EOCD_MIN + commentLength === buf.length) return i;
    }
  }
  return -1;
}

/**
 * Lists the central-directory entries WITHOUT inflating anything.
 * entry: { name (raw bytes as utf8), method, crc, compressedSize, uncompressedSize, localHeaderOffset, externalAttributes, isDirectory, isSymlink, flags }
 */
function listEntries(buf, { maxEntries = 10000 } = {}) {
  if (!hasZipMagic(buf)) throw new ZipError("INVALID_ZIP", "الملف ليس أرشيف ZIP صالحًا.");
  const eocd = findEocd(buf);
  if (eocd < 0) throw new ZipError("INVALID_ZIP", "لم يُعثر على نهاية دليل الأرشيف (EOCD).");
  const diskNumber = buf.readUInt16LE(eocd + 4), cdDisk = buf.readUInt16LE(eocd + 6);
  const total = buf.readUInt16LE(eocd + 10), cdSize = buf.readUInt32LE(eocd + 12), cdOffset = buf.readUInt32LE(eocd + 16);
  if (diskNumber !== 0 || cdDisk !== 0) throw new ZipError("INVALID_ZIP", "الأرشيفات المجزّأة غير مدعومة.");
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new ZipError("INVALID_ZIP", "ZIP64 غير مدعوم.");
  if (total > maxEntries) throw new ZipError("TOO_MANY_FILES", "عدد الملفات في الأرشيف يتجاوز الحد.");
  if (cdOffset + cdSize > eocd) throw new ZipError("INVALID_ZIP", "دليل الأرشيف خارج حدود الملف.");
  const entries = [];
  let p = cdOffset;
  for (let n = 0; n < total; n++) {
    if (p + 46 > eocd || buf.readUInt32LE(p) !== SIG_CENTRAL) throw new ZipError("INVALID_ZIP", "سجل دليل غير صالح.");
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16);
    const compressedSize = buf.readUInt32LE(p + 20), uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLength = buf.readUInt16LE(p + 28), extraLength = buf.readUInt16LE(p + 30), commentLength = buf.readUInt16LE(p + 32);
    const externalAttributes = buf.readUInt32LE(p + 38), localHeaderOffset = buf.readUInt32LE(p + 42);
    if (p + 46 + nameLength + extraLength + commentLength > eocd) throw new ZipError("INVALID_ZIP", "اسم ملف خارج حدود الدليل.");
    if (flags & 0x0001) throw new ZipError("INVALID_ZIP", "الأرشيفات المشفّرة غير مدعومة.");
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) throw new ZipError("INVALID_ZIP", "ZIP64 غير مدعوم.");
    if (method !== 0 && method !== 8) throw new ZipError("INVALID_ZIP", "طريقة ضغط غير مدعومة: " + method);
    const name = buf.subarray(p + 46, p + 46 + nameLength).toString("utf8");
    const mode = (externalAttributes >>> 16) & 0xffff;
    const isSymlink = (mode & 0o170000) === 0o120000;
    const isDirectory = name.endsWith("/") || (mode & 0o170000) === 0o040000 || (externalAttributes & 0x10) !== 0;
    entries.push({ name, flags, method, crc, compressedSize, uncompressedSize, localHeaderOffset, externalAttributes, isDirectory, isSymlink });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * Reads ONE entry's bytes with a hard output bound. `maxBytes` caps the inflated size: a member that would inflate beyond it
 * (or whose real size disagrees with its header, or whose CRC does not match) is refused — the header is never trusted.
 */
function readEntry(buf, entry, { maxBytes }) {
  const p = entry.localHeaderOffset;
  if (p + 30 > buf.length || buf.readUInt32LE(p) !== SIG_LOCAL) throw new ZipError("INVALID_ZIP", "ترويسة ملف محلية غير صالحة: " + entry.name);
  const nameLength = buf.readUInt16LE(p + 26), extraLength = buf.readUInt16LE(p + 28);
  const start = p + 30 + nameLength + extraLength, end = start + entry.compressedSize;
  if (end > buf.length) throw new ZipError("INVALID_ZIP", "بيانات الملف خارج حدود الأرشيف: " + entry.name);
  if (entry.uncompressedSize > maxBytes) throw new ZipError("FILE_TOO_LARGE", "حجم الملف بعد فك الضغط يتجاوز الحد: " + entry.name);
  const stored = buf.subarray(start, end);
  let data;
  if (entry.method === 0) data = Buffer.from(stored);
  else {
    try { data = zlib.inflateRawSync(stored, { maxOutputLength: Math.max(1, maxBytes) }); }
    catch (e) { throw new ZipError(e && e.code === "ERR_BUFFER_TOO_LARGE" ? "ZIP_BOMB" : "INVALID_ZIP", (e && e.code === "ERR_BUFFER_TOO_LARGE" ? "الملف يتمدد إلى حجم يتجاوز الحد المسموح: " : "بيانات مضغوطة تالفة: ") + entry.name); }
  }
  if (data.length !== entry.uncompressedSize) throw new ZipError("ZIP_BOMB", "الحجم الحقيقي بعد فك الضغط لا يطابق الترويسة: " + entry.name);
  if (crc32(data) !== entry.crc) throw new ZipError("INVALID_ZIP", "فشل التحقق من سلامة الملف (CRC): " + entry.name);
  return data;
}

module.exports = { ZipError, hasZipMagic, listEntries, readEntry, crc32 };
