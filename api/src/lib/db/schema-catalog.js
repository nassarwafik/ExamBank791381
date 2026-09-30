// Phase 15A — a column catalog read from the migration files themselves.
//
// The migration SQL is the single source of truth for the schema. This small parser understands exactly the
// layout used in api/db/migrations (one column per line, two-space indent, lower_snake names) and gives:
//   - the schema tests: conventions checked statically (every table has a PK, every *_json column has ISJSON, …);
//   - the backfill: column types for query parameters, and length / NOT NULL checks before anything is written.
// It is not a general T-SQL parser and does not try to be one.

const { loadMigrationFiles, DEFAULT_DIR } = require("./migrations-runner");

const COLUMN_LINE = /^ {2}([a-z_][a-z0-9_]*)\s+(nvarchar|varchar|char|int|bigint|bit|float|datetime2|rowversion)(?:\((max|\d+)\))?(.*)$/i;

function parseTable(name, body) {
  // Pass 1: one entry per column; continuation lines (deeper indent, e.g. a CHECK or REFERENCES written under the
  // column) are appended to the column they follow.
  const raw = [];
  for (const line of body.split("\n")) {
    const m = COLUMN_LINE.exec(line);
    if (m) { raw.push({ column: m[1], rawType: m[2], rawLength: m[3], rest: m[4] }); continue; }
    const last = raw[raw.length - 1];
    if (last && /^ {3,}\S/.test(line) && !/^\s*\(/.test(line)) last.rest += " " + line.trim();
    else if (!/^ {3,}/.test(line)) raw.push(null); // a table-level line ends the continuation of the last column
  }
  const columns = {};
  const order = [];
  for (const entry of raw) {
    if (!entry) continue;
    const { column, rawType, rawLength, rest } = entry;
    const type = rawType.toLowerCase();
    const upperRest = rest.toUpperCase();
    columns[column] = {
      type,
      length: rawLength === undefined ? null : rawLength.toLowerCase() === "max" ? "max" : Number(rawLength),
      nullable: !/\bNOT NULL\b/.test(upperRest),
      identity: /\bIDENTITY\b/.test(upperRest),
      hasDefault: /\bDEFAULT\b/.test(upperRest),
      primaryKey: /\bPRIMARY KEY\b/.test(upperRest),
      references: (/\bREFERENCES\s+dbo\.([a-z_]+)\s*\(([a-z_]+)\)/i.exec(rest) || []).slice(1, 3),
      isJsonChecked: new RegExp("ISJSON\\(" + column + "\\)").test(rest)
    };
    order.push(column);
  }
  const tablePk = /CONSTRAINT\s+(pk_[a-z_]+)\s+PRIMARY KEY\s*\(([^)]+)\)/i.exec(body);
  const inlinePk = order.filter(c => columns[c].primaryKey);
  const primaryKey = tablePk ? tablePk[2].split(",").map(s => s.trim()) : inlinePk;
  const foreignKeys = [];
  for (const c of order) if (columns[c].references.length) foreignKeys.push({ columns: [c], table: columns[c].references[0], refColumns: [columns[c].references[1]] });
  const tableFk = /FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+dbo\.([a-z_]+)\s*\(([^)]+)\)/gi;
  let fk;
  while ((fk = tableFk.exec(body))) foreignKeys.push({ columns: fk[1].split(",").map(s => s.trim()), table: fk[2], refColumns: fk[3].split(",").map(s => s.trim()) });
  return { name, columns, order, primaryKey, foreignKeys, body };
}

// Filtered unique indexes use only the two predicate forms below; anything else is refused so that a new kind of
// filter cannot be silently mis-evaluated by the dry-run uniqueness check.
function parseFilter(indexName, text) {
  if (!text) return undefined;
  let m = /^([a-z_]+) IS NOT NULL$/i.exec(text.trim());
  if (m) { const col = m[1]; return row => row[col] !== null && row[col] !== undefined; }
  m = /^([a-z_]+) = '([^']*)'$/i.exec(text.trim());
  if (m) { const col = m[1], value = m[2].toLowerCase(); return row => String(row[col] ?? "").toLowerCase() === value; }
  throw new Error("Unsupported filter on unique index " + indexName + ": " + text);
}

/** { tables: { name: { columns, order, primaryKey, foreignKeys, file } }, tableOrder: [names in creation order] } */
function loadSchemaCatalog(dir = DEFAULT_DIR) {
  const tables = {};
  const tableOrder = [];
  for (const file of loadMigrationFiles(dir)) {
    for (const batch of file.batches) {
      const code = batch.split("\n").filter(l => !/^\s*--/.test(l)).join("\n").trim();
      const m = /^CREATE TABLE dbo\.([a-z_]+)\s*\(([\s\S]*)\)\s*;?\s*$/i.exec(code);
      if (m) {
        tables[m[1]] = { ...parseTable(m[1], m[2]), uniqueIndexes: [], file: file.name };
        tableOrder.push(m[1]);
        continue;
      }
      const u = /^CREATE UNIQUE INDEX ([a-z_]+) ON dbo\.([a-z_]+)\s*\(([^)]+)\)(?:\s+WHERE\s+(.+?))?\s*;?$/i.exec(code);
      if (u) {
        if (!tables[u[2]]) throw new Error("Unique index " + u[1] + " on unknown table " + u[2]);
        tables[u[2]].uniqueIndexes.push({ name: u[1], columns: u[3].split(",").map(s => s.trim()), where: parseFilter(u[1], u[4]) });
      }
    }
  }
  return { tables, tableOrder };
}

module.exports = { loadSchemaCatalog, parseTable };
