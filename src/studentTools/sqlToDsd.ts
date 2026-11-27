// DG3 «ولّد من الكود» (docs/enterprise-diagram-editor-design.md §7, §15) — `CREATE TABLE` code → a DSD (the tables' relationships).
// A small, bounded reader of the table declarations a project book carries (SQL Server, Access, MySQL dialects). Pure: no React, no
// DOM, no I/O, no eval, no SQL engine. It reads declarations only and never runs anything: `INSERT`, `SELECT`, `ALTER` … are skipped.
// What it cannot read is reported with its line («الجدول Students لم يُغلق» — the fault the 899373 reviews found), never guessed.

import { DIAGRAM_LIMITS, type DEdge, type DiagramDoc, type DNode } from "./diagramDoc";

export const SQL_LIMITS = Object.freeze({ chars: 100_000, tables: 40, columns: 80 });

export type SqlColumn = { name: string; type: string; pk: boolean; fk?: { table: string; column: string } };
export type SqlTable = { name: string; line: number; columns: SqlColumn[] };
export type SqlProblem = { line: number; message: string };
export type SqlRead = { tables: SqlTable[]; problems: SqlProblem[] };

/** The text with comments blanked (same length, so lines stay where they were). */
function blankComments(src: string): string {
  let out = "";
  for (let i = 0; i < src.length;) {
    if (src.startsWith("--", i)) { while (i < src.length && src[i] !== "\n") { out += " "; i++; } continue; }
    if (src.startsWith("/*", i)) {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      for (; i < stop; i++) out += src[i] === "\n" ? "\n" : " ";
      continue;
    }
    if (src[i] === "'") {
      // a string literal (DEFAULT 'x', CHECK (x IN ('a','b'))): kept in place, but the brackets, commas and semicolons inside it are
      // blanked so they cannot end a table or split a column; '' is the escaped quote
      out += src[i++];
      while (i < src.length) {
        if (src[i] === "'" && src[i + 1] === "'") { out += "''"; i += 2; continue; }
        if (src[i] === "'") { out += src[i++]; break; }
        out += "(),;".includes(src[i]) ? "_" : src[i];
        i++;
      }
      continue;
    }
    out += src[i++];
  }
  return out;
}

const lineAt = (src: string, at: number) => src.slice(0, at).split("\n").length;
/** A name as written: [Students], `Students`, "Students", dbo.Students → Students. */
export const unquote = (s: string) => s.trim().split(".").pop()!.replace(/^[[`"]|[\]`"]$/g, "").trim();
const NAME = String.raw`(?:\[[^\]]+\]|` + "`[^`]+`" + String.raw`|"[^"]+"|[\p{L}_][\p{L}\p{N}_$#]*)`;
const QNAME = NAME + String.raw`(?:\s*\.\s*` + NAME + ")*";

/** The items of a bracketed list, split on the commas at its own level. */
function splitTop(body: string): { text: string; at: number }[] {
  const out: { text: string; at: number }[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i <= body.length; i++) {
    const c = body[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if ((c === "," && depth === 0) || i === body.length) { out.push({ text: body.slice(start, i), at: start }); start = i + 1; }
  }
  return out.filter(p => p.text.trim());
}
const names = (list: string) => splitTop(list).map(p => unquote(p.text));

/** Reads every `CREATE TABLE` of the code. */
export function readSqlTables(source: string): SqlRead {
  const problems: SqlProblem[] = [];
  if (source.length > SQL_LIMITS.chars) return { tables: [], problems: [{ line: 1, message: "الكود أطول من الحد (100 ألف حرف)." }] };
  const src = blankComments(source);
  const tables: SqlTable[] = [];
  const head = new RegExp(String.raw`\bCREATE\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(` + QNAME + String.raw`)\s*\(`, "giu");
  let m: RegExpExecArray | null;
  while ((m = head.exec(src))) {
    const name = unquote(m[1]);
    const line = lineAt(src, m.index);
    const open = m.index + m[0].length - 1;
    // the table's closing bracket: the first place its brackets balance, before the statement ends (a «;», a «GO» line, the next
    // CREATE) — so a table left open never swallows the code after it
    const after = src.slice(open + 1);
    const stop = after.search(/;|^\s*GO\s*$|\bCREATE\s+(?:TEMPORARY\s+)?TABLE\b/im);
    const limit = stop < 0 ? src.length : open + 1 + stop;
    let depth = 0, close = -1;
    for (let i = open; i < limit; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")" && --depth === 0) { close = i; break; }
    }
    if (close < 0) {
      problems.push({ line, message: "الجدول «" + name + "» لم يُغلق: ينقصه القوس «)» في آخره." });
      continue;
    }
    head.lastIndex = close + 1;
    if (tables.length >= SQL_LIMITS.tables) { problems.push({ line, message: "في الكود أكثر من " + SQL_LIMITS.tables + " جدولًا: قُرئت الأولى فقط." }); break; }
    if (tables.some(t => t.name.toLowerCase() === name.toLowerCase())) { problems.push({ line, message: "الجدول «" + name + "» معرَّف مرتين: قُرئ الأوّل فقط." }); continue; }
    const table: SqlTable = { name, line, columns: [] };
    const tablePk: string[] = [];
    const tableFk: { cols: string[]; table: string; refCols: string[] }[] = [];
    for (const item of splitTop(src.slice(open + 1, close))) {
      const text = item.text.trim().replace(/\s+/g, " ");
      const itemLine = lineAt(src, open + 1 + item.at + (item.text.length - item.text.trimStart().length));
      const constraint = /^(?:CONSTRAINT\s+\S+\s+)?(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|INDEX|KEY)\b(.*)$/i.exec(text);
      if (constraint) {
        const kind = constraint[1].toUpperCase().replace(/\s+/g, " ");
        const rest = constraint[2];
        if (kind === "PRIMARY KEY") { const cols = /\(([^)]*)\)/.exec(rest); if (cols) tablePk.push(...names(cols[1])); }
        if (kind === "FOREIGN KEY") {
          const fk = new RegExp(String.raw`^\s*\(([^)]*)\)\s*REFERENCES\s+(` + QNAME + String.raw`)\s*(?:\(([^)]*)\))?`, "iu").exec(rest);
          if (fk) tableFk.push({ cols: names(fk[1]), table: unquote(fk[2]), refCols: fk[3] ? names(fk[3]) : [] });
          else problems.push({ line: itemLine, message: "في الجدول «" + name + "»: لم أفهم المفتاح الأجنبي «" + text.slice(0, 60) + "»." });
        }
        continue;
      }
      const col = new RegExp("^(" + NAME + String.raw`)\s+(.*)$`, "u").exec(text);
      if (!col) { problems.push({ line: itemLine, message: "في الجدول «" + name + "»: لم أفهم السطر «" + text.slice(0, 60) + "»." }); continue; }
      const rest = col[2];
      // the type: everything before the first column constraint word
      const typeEnd = rest.search(/\s(?:NOT\s+NULL|NULL|PRIMARY|UNIQUE|DEFAULT|CHECK|REFERENCES|IDENTITY|AUTO_INCREMENT|AUTOINCREMENT|CONSTRAINT|COLLATE|GENERATED|COMMENT)\b/i);
      let type = (typeEnd < 0 ? rest : rest.slice(0, typeEnd)).trim().toUpperCase().replace(/\s*\(\s*/g, "(").replace(/\s*,\s*/g, ",").replace(/\s*\)/g, ")");
      if (/^(IDENTITY|AUTOINCREMENT|COUNTER)$/i.test(type)) type = type.toUpperCase();
      const column: SqlColumn = { name: unquote(col[1]), type, pk: /\bPRIMARY\s+KEY\b/i.test(rest) };
      const ref = new RegExp(String.raw`\bREFERENCES\s+(` + QNAME + String.raw`)\s*(?:\(([^)]*)\))?`, "iu").exec(rest);
      if (ref) column.fk = { table: unquote(ref[1]), column: ref[2] ? names(ref[2])[0] : "" };
      if (table.columns.length >= SQL_LIMITS.columns) { problems.push({ line: itemLine, message: "في الجدول «" + name + "» أكثر من " + SQL_LIMITS.columns + " حقلًا: قُرئت الأولى فقط." }); break; }
      if (table.columns.some(c => c.name.toLowerCase() === column.name.toLowerCase())) { problems.push({ line: itemLine, message: "في الجدول «" + name + "» الحقل «" + column.name + "» مكرّر." }); continue; }
      table.columns.push(column);
    }
    for (const k of tablePk) {
      const c = table.columns.find(x => x.name.toLowerCase() === k.toLowerCase());
      if (c) c.pk = true; else problems.push({ line, message: "المفتاح الأساسي للجدول «" + name + "» يذكر حقلًا غير موجود: «" + k + "»." });
    }
    for (const f of tableFk) f.cols.forEach((k, i) => {
      const c = table.columns.find(x => x.name.toLowerCase() === k.toLowerCase());
      if (c) c.fk = { table: f.table, column: f.refCols[i] ?? "" };
      else problems.push({ line, message: "المفتاح الأجنبي للجدول «" + name + "» يذكر حقلًا غير موجود: «" + k + "»." });
    });
    if (!table.columns.length) problems.push({ line, message: "الجدول «" + name + "» بلا حقول." });
    tables.push(table);
  }
  // a foreign key must point at a table of the code, and at its primary key
  for (const t of tables) for (const c of t.columns) {
    if (!c.fk) continue;
    const target = tables.find(x => x.name.toLowerCase() === c.fk!.table.toLowerCase());
    if (!target) { problems.push({ line: t.line, message: "الحقل «" + t.name + "." + c.name + "» يشير إلى جدول غير موجود في الكود: «" + c.fk.table + "»." }); continue; }
    c.fk.table = target.name;
    if (!c.fk.column) c.fk.column = target.columns.find(x => x.pk)?.name ?? "";
    const refCol = target.columns.find(x => x.name.toLowerCase() === c.fk!.column.toLowerCase());
    if (!refCol) problems.push({ line: t.line, message: "الحقل «" + t.name + "." + c.name + "» يشير إلى حقل غير موجود: «" + target.name + "." + c.fk.column + "»." });
    else if (refCol.type && c.type && refCol.type !== c.type && !/^(IDENTITY|AUTOINCREMENT|COUNTER)/.test(refCol.type)) {
      problems.push({ line: t.line, message: "نوعان مختلفان: «" + t.name + "." + c.name + "» (" + c.type + ") و«" + target.name + "." + refCol.name + "» (" + refCol.type + ")." });
    }
  }
  if (!tables.length && !problems.length) problems.push({ line: 1, message: "لم أجد في الكود أي «CREATE TABLE»." });
  return { tables, problems };
}

const fieldsText = (t: SqlTable) => t.columns.map(c => (c.pk ? "PK " : c.fk ? "FK " : "") + c.name + (c.type ? " : " + c.type : "")).join("\n");

/** The tables as a DSD: one table per `CREATE TABLE`, a 1 — ∞ line from each referenced table to the table holding the foreign key,
 *  laid out in columns from the tables nothing points to (on the right side of a right-to-left book: here on the left of the sheet). */
export function sqlToDsd(read: SqlRead): DiagramDoc {
  const tables = read.tables.slice(0, DIAGRAM_LIMITS.nodes);
  // level = how deep the table sits in its chain of references (a table with no foreign key is level 0)
  const level = new Map<string, number>();
  const levelOf = (t: SqlTable, seen: Set<string> = new Set()): number => {
    if (level.has(t.name)) return level.get(t.name)!;
    if (seen.has(t.name)) return 0;
    seen.add(t.name);
    let l = 0;
    for (const c of t.columns) {
      const target = c.fk && c.fk.table !== t.name ? tables.find(x => x.name === c.fk!.table) : undefined;
      if (target) l = Math.max(l, levelOf(target, seen) + 1);
    }
    level.set(t.name, l);
    return l;
  };
  tables.forEach(t => levelOf(t));
  // a table that points at nothing sits in the column just before the first table that points at it, so its line stays short and
  // does not cross the tables in between
  for (const t of tables) {
    if (t.columns.some(c => c.fk && c.fk.table !== t.name && tables.some(x => x.name === c.fk!.table))) continue;
    const users = tables.filter(x => x !== t && x.columns.some(c => c.fk?.table === t.name)).map(x => level.get(x.name)!);
    if (users.length) level.set(t.name, Math.max(0, Math.min(...users) - 1));
  }
  const columns = new Map<number, SqlTable[]>();
  for (const t of tables) columns.set(level.get(t.name)!, [...(columns.get(level.get(t.name)!) ?? []), t]);
  const nodes: DNode[] = [];
  const idOf = new Map<string, string>();
  let x = 60;
  for (const l of [...columns.keys()].sort((a, b) => a - b)) {
    let y = 60, widest = 0;
    for (const t of columns.get(l)!) {
      const longest = Math.max(t.name.length, ...t.columns.map(c => c.name.length + c.type.length + 6));
      const w = Math.min(420, Math.max(160, Math.round(longest * 7.6 + 40) - (Math.round(longest * 7.6 + 40) % 10)));
      const h = 50 + Math.max(1, t.columns.length) * 17;
      if (y + h > DIAGRAM_LIMITS.canvasH - 20) { y = 60; x += widest + 80; widest = 0; }
      const id = "n" + (nodes.length + 1);
      idOf.set(t.name, id);
      nodes.push({ id, type: "table", x: Math.min(x, DIAGRAM_LIMITS.canvasW - w), y, w: 150, h: 70, text: { name: t.name.slice(0, DIAGRAM_LIMITS.text), fields: fieldsText(t).slice(0, DIAGRAM_LIMITS.lines) }, color: "none" });
      y += Math.ceil((h + 50) / 10) * 10;
      widest = Math.max(widest, w);
    }
    x += widest + 120;
  }
  const edges: DEdge[] = [];
  for (const t of tables) for (const c of t.columns) {
    if (!c.fk || !idOf.has(c.fk.table) || edges.length >= DIAGRAM_LIMITS.edges) continue;
    // the foreign key that is also the table's only primary key: one to one
    const oneOne = c.pk && t.columns.filter(k => k.pk).length === 1;
    edges.push({ id: "e" + (edges.length + 1), type: oneOne ? "oneOne" : "oneMany", from: idOf.get(c.fk.table)!, to: idOf.get(t.name)!, label: "", fromLabel: "1", toLabel: oneOne ? "1" : "∞", y: 0 });
  }
  return { kind: "dsd", nodes, edges };
}
