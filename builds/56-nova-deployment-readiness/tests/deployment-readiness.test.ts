import { describe, expect, it } from "vitest";
import { checkDatabaseReadiness, validateRuntimeConfiguration } from "../src/deployment-readiness";

describe("Build 56 deployment readiness", () => {
  it("blocks missing database, security adapter, origin, and invalid numeric configuration", () => {
    const report = validateRuntimeConfiguration({ port: "70000", dbPoolMax: "0" });
    expect(report.ready).toBe(false);
    expect(report.blockers).toContain("DATABASE_URL_INVALID_OR_MISSING");
    expect(report.blockers).toContain("SECURITY_ADAPTER_MISSING");
    expect(report.blockers).toContain("ALLOWED_ORIGIN_INVALID_OR_MISSING");
    expect(report.blockers).toContain("PORT_INVALID");
    expect(report.blockers).toContain("DB_POOL_MAX_INVALID");
  });
  it("accepts a valid production-shaped configuration without claiming adapter verification", () => {
    const report = validateRuntimeConfiguration({ databaseUrl: "postgresql://user:secret@db.example:5432/nova", securityAdapterModule: "/srv/nova/security-adapter.mjs", allowedOrigin: "https://ops.example.com", port: "8443", dbPoolMax: "20" });
    expect(report.ready).toBe(true);
    expect(report.checks.every(check => check.passed)).toBe(true);
    expect(report.checks.find(check => check.name === "security_adapter_configured")?.detail).toContain("must still be checked");
  });
  it("warns when a non-local allowed origin uses HTTP", () => {
    expect(validateRuntimeConfiguration({ databaseUrl: "postgres://db", securityAdapterModule: "/security.mjs", allowedOrigin: "http://ops.example.com" }).warnings).toContain("NON_TLS_ALLOWED_ORIGIN: use HTTPS outside local development.");
  });
  it("reports a ready database when the probe succeeds", async () => {
    const report = await checkDatabaseReadiness(async () => 1, () => new Date("2026-10-09T12:00:00.000Z"));
    expect(report.status).toBe("ready");
    expect(report.checkedAt).toBe("2026-10-09T12:00:00.000Z");
  });
  it("reports not ready and withholds low-level error details on database failure", async () => {
    const report = await checkDatabaseReadiness(async () => { throw new Error("secret connection string leaked"); });
    expect(report.status).toBe("not_ready");
    expect(JSON.stringify(report)).not.toContain("secret connection string");
  });
});
