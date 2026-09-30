import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { loadSchemaCatalog } from "../src/lib/db/schema-catalog.js";
import { splitBatches, checksumOf, loadMigrationFiles, planMigrations, migrate } from "../src/lib/db/migrations-runner.js";
import { TABLES } from "../src/lib/db-migration/legacy-transform.js";

// Phase 15A — the schema conventions of docs/database-architecture-15.md §5, checked statically over the migration
// files (no database needed). The same files are applied to a real SQL Server in the CI db-integration job.

const catalog = loadSchemaCatalog();
const tables = Object.values(catalog.tables);

describe("15A schema: files and tables", () => {
  it("parses every migration file and finds every designed table", () => {
    expect(loadMigrationFiles().map(f => f.name)).toEqual([
      "0001_tenancy_identity.sql", "0002_courses_classes.sql", "0003_assessment.sql",
      "0004_bank_exams.sql", "0005_communication.sql", "0006_activity_projects_audit.sql"
    ]);
    expect(catalog.tableOrder).toHaveLength(30);
    for (const t of TABLES) expect(catalog.tables[t], t).toBeTruthy();
  });

  it("every table has a primary key made of its own columns", () => {
    for (const t of tables) {
      expect(t.primaryKey.length, t.name).toBeGreaterThan(0);
      for (const c of t.primaryKey) expect(t.columns[c], t.name + "." + c).toBeTruthy();
    }
  });

  it("every foreign key points at an earlier table's primary key, with matching types", () => {
    for (const t of tables) {
      for (const fk of t.foreignKeys) {
        const target = catalog.tables[fk.table];
        expect(target, t.name + " → " + fk.table).toBeTruthy();
        expect(catalog.tableOrder.indexOf(fk.table), t.name + " → " + fk.table + " created earlier").toBeLessThanOrEqual(catalog.tableOrder.indexOf(t.name));
        expect(fk.refColumns, t.name + " → " + fk.table).toEqual(target.primaryKey);
        fk.columns.forEach((c, i) => {
          const from = t.columns[c], to = target.columns[fk.refColumns[i]];
          expect(from.type + "(" + from.length + ")", t.name + "." + c).toBe(to.type + "(" + to.length + ")");
        });
      }
    }
  });

  it("every *_json column is nvarchar(max) with an ISJSON check", () => {
    let count = 0;
    for (const t of tables) for (const c of t.order.filter(n => n.endsWith("_json"))) {
      const col = t.columns[c];
      expect(col.type + "(" + col.length + ")", t.name + "." + c).toBe("nvarchar(max)");
      expect(col.isJsonChecked, t.name + "." + c + " has ISJSON").toBe(true);
      count++;
    }
    expect(count).toBeGreaterThanOrEqual(28);
  });

  it("times are datetime2(3); no legacy types", () => {
    for (const t of tables) for (const c of t.order) {
      const col = t.columns[c];
      if (col.type === "datetime2") expect(col.length, t.name + "." + c).toBe(3);
      if (c.endsWith("_at")) expect(col.type, t.name + "." + c).toBe("datetime2");
    }
    const all = loadMigrationFiles().flatMap(f => f.batches).join("\n");
    expect(all).not.toMatch(/\b(ntext|text|image|datetime|smalldatetime|money)\s*(,|\n|NOT|NULL)/i);
  });

  it("every table with updated_at also has row_version (optimistic concurrency replaces blob ETags)", () => {
    for (const t of tables) if (t.columns.updated_at) expect(t.columns.row_version?.type, t.name).toBe("rowversion");
  });

  it("ids that reach the legacy data keep enough room (UUIDs and legacy ids verbatim)", () => {
    const idCols = ["user_id", "class_id", "assignment_id", "student_user_id", "teacher_user_id", "school_id"];
    for (const t of tables) for (const c of idCols) if (t.columns[c]) expect(t.columns[c].length, t.name + "." + c).toBeGreaterThanOrEqual(64);
  });
});

describe("15A migration runner (pure parts)", () => {
  it("splits on GO lines only, and drops comment-only batches", () => {
    const text = "-- header\nCREATE TABLE dbo.a (x int);\nGO\n-- only a comment\ngo ;\nSELECT 'GO' AS x;\n  GO  \n";
    expect(splitBatches(text)).toEqual(["-- header\nCREATE TABLE dbo.a (x int);", "SELECT 'GO' AS x;"]);
  });

  it("checksums ignore CRLF vs LF", () => {
    expect(checksumOf("a\r\nb")).toBe(checksumOf("a\nb"));
    expect(checksumOf("a\nb")).not.toBe(checksumOf("a\nc"));
  });

  it("plans pending files and refuses drift, missing files and out-of-order history", () => {
    const files = [{ version: "0001", checksum: "x" }, { version: "0002", checksum: "y" }, { version: "0003", checksum: "z" }];
    expect(planMigrations(files, []).pending.map(f => f.version)).toEqual(["0001", "0002", "0003"]);
    const ok = planMigrations(files, [{ version: "0001", checksum: "x" }]);
    expect(ok.ok).toBe(true);
    expect(ok.pending.map(f => f.version)).toEqual(["0002", "0003"]);
    expect(planMigrations(files, [{ version: "0001", checksum: "CHANGED" }]).drift).toEqual(["0001"]);
    expect(planMigrations(files, [{ version: "0009", checksum: "q" }]).missing).toEqual(["0009"]);
    const gap = planMigrations(files, [{ version: "0001", checksum: "x" }, { version: "0003", checksum: "z" }]);
    expect(gap.outOfOrder).toEqual(["0002"]);
    expect(gap.ok).toBe(false);
  });

  it("rejects badly named or duplicate-version files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mig-"));
    fs.writeFileSync(path.join(dir, "1_bad.sql"), "SELECT 1;");
    expect(() => loadMigrationFiles(dir)).toThrow(/Invalid migration file name/);
    fs.rmSync(path.join(dir, "1_bad.sql"));
    fs.writeFileSync(path.join(dir, "0001_a.sql"), "SELECT 1;");
    fs.writeFileSync(path.join(dir, "0001_b.sql"), "SELECT 2;");
    expect(() => loadMigrationFiles(dir)).toThrow(/Duplicate migration version/);
    fs.rmSync(dir, { recursive: true });
  });

  it("does not apply anything when history is inconsistent", async () => {
    const executed = [];
    const pool = { request: () => ({
      batch: async text => { executed.push(text); },
      query: async () => ({ recordset: [{ version: "0001", name: "0001_tenancy_identity.sql", checksum: "0".repeat(64) }] })
    }) };
    await expect(migrate(pool, { sqlLib: {} })).rejects.toThrow(/changed after being applied: 0001/);
    expect(executed).toHaveLength(1); // only the idempotent schema_migrations bootstrap
  });
});
