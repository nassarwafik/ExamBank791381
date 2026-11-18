// Phase T6 — the unit converter behind the `unitConverter` student tool. Pure; no I/O.
//
// Every unit is a factor to its category's base unit (temperature is affine). Data sizes follow the standard the curriculum teaches:
// decimal prefixes (kB = 1000 B, Mbps = 10^6 bit/s) and binary prefixes written as such (KiB = 1024 B). 1 B = 8 bit.
// Results are shown with 12 significant digits (the calculator's display rule), so 0.1 + 0.2-type artefacts never appear.

import { formatCalculatorNumber } from "./calculatorEngine";

export const UNIT_CATEGORIES = ["length", "mass", "time", "temperature", "speed", "data", "dataRate"] as const;
export type UnitCategory = (typeof UNIT_CATEGORIES)[number];

export type Unit = { id: string; label: string; factor: number };
export const UNIT_CATEGORY_LABEL: Record<UnitCategory, string> = {
  length: "الطول", mass: "الكتلة", time: "الزمن", temperature: "درجة الحرارة", speed: "السرعة", data: "حجم البيانات", dataRate: "سرعة نقل البيانات"
};

const K = 1e3, M = 1e6, G = 1e9, T = 1e12;
export const UNITS: Record<UnitCategory, readonly Unit[]> = {
  length: [
    { id: "nm", label: "نانومتر (nm)", factor: 1e-9 }, { id: "um", label: "ميكرومتر (µm)", factor: 1e-6 }, { id: "mm", label: "مليمتر (mm)", factor: 1e-3 },
    { id: "cm", label: "سنتيمتر (cm)", factor: 1e-2 }, { id: "m", label: "متر (m)", factor: 1 }, { id: "km", label: "كيلومتر (km)", factor: K },
    { id: "in", label: "إنش (in)", factor: 0.0254 }, { id: "ft", label: "قدم (ft)", factor: 0.3048 }, { id: "mi", label: "ميل (mi)", factor: 1609.344 }
  ],
  mass: [
    { id: "mg", label: "مليغرام (mg)", factor: 1e-6 }, { id: "g", label: "غرام (g)", factor: 1e-3 }, { id: "kg", label: "كيلوغرام (kg)", factor: 1 },
    { id: "t", label: "طن (t)", factor: K }, { id: "lb", label: "رطل (lb)", factor: 0.45359237 }
  ],
  time: [
    { id: "ns", label: "نانوثانية (ns)", factor: 1e-9 }, { id: "us", label: "ميكروثانية (µs)", factor: 1e-6 }, { id: "ms", label: "ملي ثانية (ms)", factor: 1e-3 },
    { id: "s", label: "ثانية (s)", factor: 1 }, { id: "min", label: "دقيقة (min)", factor: 60 }, { id: "h", label: "ساعة (h)", factor: 3600 }, { id: "d", label: "يوم", factor: 86400 }
  ],
  temperature: [
    { id: "C", label: "سلسيوس (°C)", factor: 1 }, { id: "F", label: "فهرنهايت (°F)", factor: 1 }, { id: "K", label: "كلفن (K)", factor: 1 }
  ],
  speed: [
    { id: "mps", label: "متر/ثانية (m/s)", factor: 1 }, { id: "kmh", label: "كيلومتر/ساعة (km/h)", factor: 1000 / 3600 }, { id: "mph", label: "ميل/ساعة (mph)", factor: 1609.344 / 3600 }
  ],
  data: [
    { id: "bit", label: "بت (bit)", factor: 1 }, { id: "B", label: "بايت (B)", factor: 8 },
    { id: "kB", label: "كيلوبايت (kB = 1000 B)", factor: 8 * K }, { id: "MB", label: "ميغابايت (MB)", factor: 8 * M }, { id: "GB", label: "غيغابايت (GB)", factor: 8 * G }, { id: "TB", label: "تيرابايت (TB)", factor: 8 * T },
    { id: "KiB", label: "كيبيبايت (KiB = 1024 B)", factor: 8 * 1024 }, { id: "MiB", label: "ميبيبايت (MiB)", factor: 8 * 1024 ** 2 }, { id: "GiB", label: "غيبيبايت (GiB)", factor: 8 * 1024 ** 3 }
  ],
  dataRate: [
    { id: "bps", label: "بت/ثانية (bps)", factor: 1 }, { id: "kbps", label: "كيلوبت/ثانية (kbps)", factor: K }, { id: "Mbps", label: "ميغابت/ثانية (Mbps)", factor: M },
    { id: "Gbps", label: "غيغابت/ثانية (Gbps)", factor: G }, { id: "Bps", label: "بايت/ثانية (B/s)", factor: 8 }, { id: "kBps", label: "كيلوبايت/ثانية (kB/s)", factor: 8 * K },
    { id: "MBps", label: "ميغابايت/ثانية (MB/s)", factor: 8 * M }
  ]
};

export type ConvertUnitResult = { ok: true; value: number; display: string } | { ok: false; message: string };

const toKelvin = (v: number, u: string) => (u === "C" ? v + 273.15 : u === "F" ? (v - 32) * 5 / 9 + 273.15 : v);
const fromKelvin = (k: number, u: string) => (u === "C" ? k - 273.15 : u === "F" ? (k - 273.15) * 9 / 5 + 32 : k);

export function convertUnit(category: UnitCategory, from: string, to: string, text: string): ConvertUnitResult {
  const list = UNITS[category];
  const a = list?.find(u => u.id === from), b = list?.find(u => u.id === to);
  if (!a || !b) return { ok: false, message: "وحدة غير معروفة." };
  const t = String(text).trim().replace(/[−–]/g, "-").replace(/٫/g, ".");
  if (!/^-?(\d+(\.\d+)?|\.\d+)(e[+-]?\d+)?$/i.test(t) || t.length > 30) return { ok: false, message: "اكتب قيمة عددية، مثل 12.5." };
  const v = Number(t);
  if (!Number.isFinite(v)) return { ok: false, message: "القيمة كبيرة جدًّا." };
  let out: number;
  if (category === "temperature") {
    const k = toKelvin(v, from);
    if (k < -1e-9) return { ok: false, message: "درجة الحرارة أقل من الصفر المطلق (0 K) غير ممكنة." };
    out = fromKelvin(k, to);
  } else {
    if (v < 0 && (category === "mass" || category === "data" || category === "dataRate" || category === "time")) return { ok: false, message: "هذه الكمية لا تكون سالبة." };
    out = (v * a.factor) / b.factor;
  }
  if (!Number.isFinite(out)) return { ok: false, message: "الناتج كبير جدًّا." };
  const value = Object.is(out, -0) ? 0 : out;
  return { ok: true, value, display: formatCalculatorNumber(value) };
}
