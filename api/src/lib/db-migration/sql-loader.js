// Phase 15A — writes transformed rows into an EMPTY database, in one transaction.
//
// Refuses to run when any target table already has rows: 15A is a first load, not a sync. (Each later phase does
// its own cutover — docs/database-architecture-15.md §6.) Parameter types come from the schema catalog, so a
// value is always sent with its column's exact type; datetime2 values are sent as Date objects (UTC).

const MAX_PARAMS = 2000; // SQL Server allows 2100 parameters per request; keep a margin.
const MAX_ROWS_PER_INSERT = 1000; // a VALUES list may hold at most 1000 rows (error 10738)

function sqlTypeFor(sqlLib, col) {
  const len = col.length === "max" ? sqlLib.MAX : col.length;
  switch (col.type) {
    case "nvarchar": return sqlLib.NVarChar(len);
    case "varchar": return sqlLib.VarChar(len);
    case "char": return sqlLib.Char(len);
    case "int": return sqlLib.Int;
    case "bigint": return sqlLib.BigInt;
    case "bit": return sqlLib.Bit;
    case "float": return sqlLib.Float;
    case "datetime2": return sqlLib.DateTime2(col.length || 3);
    default: throw new Error("Unsupported column type " + col.type);
  }
}

function toParam(col, value) {
  if (value === null || value === undefined) return null;
  if (col.type === "datetime2") return new Date(value);
  return value;
}

/** Splits rows into multi-row INSERT statements that stay under the parameter limit. */
function planInserts(table, spec, rows) {
  if (!rows.length) return [];
  const columns = spec.order.filter(c => rows.some(r => c in r));
  const perStatement = Math.max(1, Math.min(MAX_ROWS_PER_INSERT, Math.floor(MAX_PARAMS / columns.length)));
  const statements = [];
  for (let start = 0; start < rows.length; start += perStatement) {
    const chunk = rows.slice(start, start + perStatement);
    const values = chunk.map((_, r) => "(" + columns.map((__, c) => "@p" + (r * columns.length + c)).join(", ") + ")");
    statements.push({
      text: "INSERT INTO dbo." + table + " (" + columns.join(", ") + ") VALUES " + values.join(", "),
      columns, rows: chunk
    });
  }
  return statements;
}

async function countRows(requestFactory, tables) {
  const counts = {};
  for (const t of tables) {
    const r = await requestFactory().query("SELECT COUNT_BIG(*) AS n FROM dbo." + t);
    counts[t] = Number(r.recordset[0].n);
  }
  return counts;
}

/**
 * @param pool      a connected mssql ConnectionPool
 * @param tables    { table: rows[] } from transformLegacy
 * @param catalog   loadSchemaCatalog()
 * @param order     table names in load (FK) order
 * @returns { inserted: { table: n }, verified: { table: n } }
 */
async function loadIntoEmptyDatabase(pool, tables, catalog, order, { sqlLib = require("mssql"), log = () => {} } = {}) {
  const before = await countRows(() => pool.request(), order);
  const nonEmpty = Object.entries(before).filter(([, n]) => n > 0).map(([t, n]) => t + "=" + n);
  if (nonEmpty.length) throw new Error("Target tables are not empty (" + nonEmpty.join(", ") + "). 15A only loads into an empty database.");

  const tx = new sqlLib.Transaction(pool);
  await tx.begin();
  const inserted = {};
  try {
    for (const table of order) {
      const rows = tables[table] || [];
      const spec = catalog.tables[table];
      inserted[table] = 0;
      for (const stmt of planInserts(table, spec, rows)) {
        const req = new sqlLib.Request(tx);
        stmt.rows.forEach((row, r) => stmt.columns.forEach((column, c) => {
          const col = spec.columns[column];
          req.input("p" + (r * stmt.columns.length + c), sqlTypeFor(sqlLib, col), toParam(col, row[column]));
        }));
        await req.query(stmt.text);
        inserted[table] += stmt.rows.length;
      }
      log(table + ": " + inserted[table]);
    }
    const verified = await countRows(() => new sqlLib.Request(tx), order);
    const mismatch = order.filter(t => verified[t] !== (tables[t] || []).length);
    if (mismatch.length) throw new Error("Row count mismatch after load: " + mismatch.map(t => t + " " + verified[t] + "≠" + (tables[t] || []).length).join(", "));
    await tx.commit();
    return { inserted, verified };
  } catch (error) {
    try { await tx.rollback(); } catch { /* already rolled back */ }
    throw error;
  }
}

module.exports = { MAX_PARAMS, MAX_ROWS_PER_INSERT, planInserts, sqlTypeFor, loadIntoEmptyDatabase };
