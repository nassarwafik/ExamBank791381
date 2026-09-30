import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import sql from "mssql";
import { buildPoolConfig } from "../src/lib/db/sql-client.js";
import { migrate, loadMigrationFiles } from "../src/lib/db/migrations-runner.js";
import { loadSchemaCatalog } from "../src/lib/db/schema-catalog.js";
import { readLegacyPlatform } from "../src/lib/db-migration/legacy-reader.js";
import { transformLegacy, validateRowsAgainstCatalog, TABLES } from "../src/lib/db-migration/legacy-transform.js";
import { loadIntoEmptyDatabase } from "../src/lib/db-migration/sql-loader.js";
import { buildLegacyPlatform, TEACHER_CODE } from "./fixtures/db-legacy-fixture.js";

// Phase 15A — against a REAL SQL Server (CI: .github/workflows/db-integration.yml). Skipped when
// TEST_SQL_CONNECTION_STRING is not set, so `npm test` needs no database.

const CS = process.env.TEST_SQL_CONNECTION_STRING;
const runId = crypto.randomBytes(4).toString("hex");
const created = [];
let master;

async function connectWithPatience(config, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try { return await new sql.ConnectionPool(config).connect(); }
    catch (error) { if (Date.now() > deadline) throw error; await new Promise(r => setTimeout(r, 3000)); }
  }
}

async function freshDatabase(label) {
  const name = "exambank_it_" + label + "_" + runId;
  await master.request().batch("CREATE DATABASE [" + name + "]");
  created.push(name);
  return connectWithPatience({ ...buildPoolConfig(CS), database: name });
}

describe.skipIf(!CS)("15A on SQL Server", () => {
  const catalog = loadSchemaCatalog();
  let db;

  beforeAll(async () => {
    master = await connectWithPatience(buildPoolConfig(CS));
    db = await freshDatabase("main");
  }, 240000);

  afterAll(async () => {
    try { await db?.close(); } catch { /* ignore */ }
    for (const name of created) {
      try { await master.request().batch("ALTER DATABASE [" + name + "] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [" + name + "]"); } catch { /* ignore */ }
    }
    try { await master?.close(); } catch { /* ignore */ }
  }, 120000);

  it("status (dry run) is read-only; apply runs every migration; a second run applies nothing", async () => {
    const status = await migrate(db, { dryRun: true });
    expect(status.plan.pending).toHaveLength(loadMigrationFiles().length);
    const none = await db.request().query("SELECT OBJECT_ID(N'dbo.schema_migrations', N'U') AS id");
    expect(none.recordset[0].id).toBeNull();
    const first = await migrate(db);
    expect(first.applied).toEqual(loadMigrationFiles().map(f => f.name));
    const second = await migrate(db);
    expect(second.applied).toEqual([]);
    const r = await db.request().query("SELECT COUNT(*) AS n FROM sys.tables WHERE schema_id = SCHEMA_ID('dbo') AND name <> 'schema_migrations'");
    expect(r.recordset[0].n).toBe(catalog.tableOrder.length);
  }, 120000);

  it("the catalog matches the real columns (types, lengths, nullability)", async () => {
    const r = await db.request().query(`
      SELECT t.name AS table_name, c.name AS column_name, ty.name AS type_name, c.max_length, c.is_nullable
      FROM sys.columns c JOIN sys.tables t ON t.object_id = c.object_id JOIN sys.types ty ON ty.user_type_id = c.user_type_id
      WHERE t.name <> 'schema_migrations'`);
    const actual = new Map(r.recordset.map(x => [x.table_name + "." + x.column_name, x]));
    for (const t of catalog.tableOrder) for (const c of catalog.tables[t].order) {
      const col = catalog.tables[t].columns[c], real = actual.get(t + "." + c);
      expect(real, t + "." + c).toBeTruthy();
      expect(real.type_name === "timestamp" ? "rowversion" : real.type_name, t + "." + c).toBe(col.type);
      expect(!!real.is_nullable, t + "." + c + " nullable").toBe(col.nullable);
      if (typeof col.length === "number" && col.type !== "datetime2") expect(real.max_length, t + "." + c).toBe(col.type === "nvarchar" ? col.length * 2 : col.length);
      if (col.length === "max") expect(real.max_length, t + "." + c).toBe(-1);
    }
    expect(actual.size).toBe(catalog.tableOrder.reduce((n, t) => n + catalog.tables[t].order.length, 0));
  }, 60000);

  it("loads the real-handler fixture, verifies counts, and refuses a second load", async () => {
    const fixture = await buildLegacyPlatform();
    const result = transformLegacy(await readLegacyPlatform(fixture.ctx.container), {
      school: { schoolId: "school-1", name: "البطوف الشاملة" }, teacher: { userId: "teacher-user-1", loginCode: TEACHER_CODE }, now: new Date().toISOString()
    });
    expect(validateRowsAgainstCatalog(result.tables, catalog)).toEqual([]);
    const { verified } = await loadIntoEmptyDatabase(db, result.tables, catalog, TABLES);
    for (const t of TABLES) expect(verified[t], t).toBe(result.tables[t].length);

    const a = await db.request().input("id", sql.NVarChar(64), fixture.ids.assignmentId)
      .query("SELECT JSON_VALUE(exam_snapshot_json, '$.title') AS title, status FROM dbo.assignments WHERE assignment_id = @id");
    expect(a.recordset[0]).toEqual({ title: "امتحان قصير", status: "published" });
    const names = await db.request().query("SELECT display_name FROM dbo.users WHERE kind = 'student' ORDER BY display_name");
    expect(names.recordset.map(x => x.display_name).sort()).toEqual([fixture.names.s1, fixture.names.s2].sort()); // Arabic round-trips

    await expect(loadIntoEmptyDatabase(db, result.tables, catalog, TABLES)).rejects.toThrow(/not empty/);
  }, 120000);

  it("enforces foreign keys and JSON checks", async () => {
    await expect(db.request().query("INSERT INTO dbo.attempts (assignment_id, student_user_id, attempt_number, answers_json) VALUES (N'nope', N'nope', 1, N'{}')")).rejects.toThrow(/FOREIGN KEY/);
    await expect(db.request().query("INSERT INTO dbo.schools (school_id, name, settings_json) VALUES (N'bad', N'x', N'not json')")).rejects.toThrow(/CHECK/);
    // A second OWNER (a different teacher) must hit the filtered unique index, not the primary key.
    await db.request().query("INSERT INTO dbo.users (user_id, kind, login_code, display_name) VALUES (N'teacher-2', 'staff', N'T2', N'معلم ثان')");
    await expect(db.request().query("INSERT INTO dbo.class_teachers (class_id, teacher_user_id, role) SELECT TOP 1 class_id, N'teacher-2', 'owner' FROM dbo.classes")).rejects.toThrow(/ux_class_teachers_owner/);
    await db.request().query("INSERT INTO dbo.class_teachers (class_id, teacher_user_id, role) SELECT TOP 1 class_id, N'teacher-2', 'co_teacher' FROM dbo.classes");
    await expect(db.request().query("INSERT INTO dbo.users (user_id, kind, login_code, display_name) VALUES (N'teacher-3', 'staff', N't2', N'x')")).rejects.toThrow(/ux_users_login_code/);
  }, 60000);

  it("a failing migration file leaves nothing behind (one transaction per file)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mig-it-"));
    fs.writeFileSync(path.join(dir, "0001_ok.sql"), "CREATE TABLE dbo.t_ok (id int NOT NULL PRIMARY KEY);\nGO\n");
    fs.writeFileSync(path.join(dir, "0002_broken.sql"), "CREATE TABLE dbo.t_half (id int NOT NULL PRIMARY KEY);\nGO\nINSERT INTO dbo.does_not_exist VALUES (1);\nGO\n");
    const scratch = await freshDatabase("rollback");
    try {
      await expect(migrate(scratch, { dir })).rejects.toThrow(/0002_broken\.sql failed/);
      const r = await scratch.request().query("SELECT OBJECT_ID('dbo.t_ok') AS ok, OBJECT_ID('dbo.t_half') AS half, (SELECT COUNT(*) FROM dbo.schema_migrations) AS n");
      expect(r.recordset[0].ok).not.toBeNull();
      expect(r.recordset[0].half).toBeNull();
      expect(r.recordset[0].n).toBe(1);
    } finally {
      await scratch.close();
      fs.rmSync(dir, { recursive: true });
    }
  }, 120000);
});
