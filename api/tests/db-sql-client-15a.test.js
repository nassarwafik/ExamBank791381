import { describe, it, expect } from "vitest";
import { buildPoolConfig, isTransientConnectError, connectWithRetry, databaseStatus, isDatabaseConfigured, MIN_CONNECT_TIMEOUT_MS } from "../src/lib/db/sql-client.js";

// Phase 15A — the SQL client's configuration and serverless-resume behaviour, without a database.

const CS = "Server=tcp:example.database.windows.net,1433;Initial Catalog=exambank;User ID=u;Password=p;Encrypt=True;Connection Timeout=30";

describe("15A sql-client", () => {
  it("is not configured without AZURE_SQL_CONNECTION_STRING, and then never connects", async () => {
    expect(isDatabaseConfigured({})).toBe(false);
    expect(isDatabaseConfigured({ AZURE_SQL_CONNECTION_STRING: "  " })).toBe(false);
    expect(await databaseStatus({})).toEqual({ state: "not-configured" });
  });

  it("parses the connection string, forces encryption and raises the connect timeout for serverless resume", () => {
    const cfg = buildPoolConfig(CS);
    expect(cfg.server).toBe("example.database.windows.net");
    expect(cfg.database).toBe("exambank");
    expect(cfg.options.encrypt).toBe(true);
    expect(cfg.connectionTimeout).toBe(MIN_CONNECT_TIMEOUT_MS);
    expect(buildPoolConfig(CS.replace("Connection Timeout=30", "Connection Timeout=120")).connectionTimeout).toBe(120000);
    expect(cfg.pool.max).toBe(5);
    // tedious retries transient login failures itself; the defaults (3 × 500 ms) are far shorter than a resume.
    expect(cfg.options.maxRetriesOnTransientErrors).toBe(6);
    expect(cfg.options.connectionRetryInterval).toBe(10000);
    expect(buildPoolConfig(CS, { requestTimeout: 300000 }).requestTimeout).toBe(300000);
    expect(() => buildPoolConfig("")).toThrow(/not configured/);
  });

  it("recognizes the transient errors of a resuming database", () => {
    expect(isTransientConnectError({ number: 40613 })).toBe(true);
    expect(isTransientConnectError({ originalError: { info: { number: 40613 } } })).toBe(true);
    expect(isTransientConnectError({ code: "ETIMEOUT" })).toBe(true);
    // The shape tedious/mssql actually produce for a resuming database: ELOGIN, no number, the server's message.
    expect(isTransientConnectError({ name: "ConnectionError", code: "ELOGIN", message: "Database 'exambank' on server 'x' is not currently available.  Please retry the connection later." })).toBe(true);
    expect(isTransientConnectError({ code: "ELOGIN", message: "Login failed for user 'u'." })).toBe(false); // wrong password: never retried
    expect(isTransientConnectError({ number: 18456 })).toBe(false);
    expect(isTransientConnectError(null)).toBe(false);
  });

  it("retries a transient first connect exactly once, and never retries other errors", async () => {
    let calls = 0;
    const flaky = () => ({ connect: async () => { calls++; if (calls === 1) { const e = new Error("resuming"); e.number = 40613; throw e; } return "pool"; } });
    expect(await connectWithRetry({}, { createPool: flaky, wait: async () => {} })).toBe("pool");
    expect(calls).toBe(2);

    calls = 0;
    const denied = () => ({ connect: async () => { calls++; const e = new Error("login failed"); e.number = 18456; throw e; } });
    await expect(connectWithRetry({}, { createPool: denied, wait: async () => {} })).rejects.toThrow(/login failed/);
    expect(calls).toBe(1);
  });
});
