import { describe, expect, it, vi, afterEach } from "vitest";

const keys = ["COGNITO_ISSUER","COGNITO_CLIENT_ID","NOVA_COGNITO_GROUP_CLINICIAN","NOVA_COGNITO_GROUP_SUPERVISOR","NOVA_COGNITO_GROUP_OWNER","NOVA_COGNITO_GROUP_ADMIN","DATABASE_URL","NOVA_SECURITY_ADAPTER_MODULE","NOVA_COGNITO_TENANT_CLAIM"];
const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
afterEach(() => { for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } vi.restoreAllMocks(); });
describe("Cognito adapter fail-closed contract", () => {
  it("returns unauthenticated for missing bearer token without trusting tenant headers", async () => {
    process.env.COGNITO_ISSUER = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_example";
    process.env.COGNITO_CLIENT_ID = "example-client";
    const adapter = await import("../src/security-adapter.mjs");
    expect(await adapter.resolveContext({ headers: { "x-tenant-id": "attacker-tenant" } })).toBeNull();
  });
  it("rejects missing required identity configuration", async () => {
    delete process.env.COGNITO_ISSUER;
    const adapter = await import("../src/security-adapter.mjs");
    await expect(adapter.resolveContext({ headers: { authorization: "Bearer not-a-jwt" } })).resolves.toBeNull();
  });
  it("denies authorization for forged context not minted by verified token resolution", async () => {
    process.env.DATABASE_URL = "postgres://invalid.invalid/nova";
    const adapter = await import("../src/security-adapter.mjs");
    const forged = { contractVersion:"1.0",requestId:"r",correlationId:"c",tenantId:"tenant-a",actor:{type:"user",reference:"admin"},authorizationDecisionReference:"fake" };
    await expect(adapter.authorize(forged,"workspace.note.approve")).resolves.toBe(false);
    await adapter.closeSecurityAdapter();
  });
});