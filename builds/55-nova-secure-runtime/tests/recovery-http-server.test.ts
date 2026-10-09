import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { RecoveryOperationsApi } from "../../../builds/54-nova-recovery-operations-dashboard-ui/src/recovery-operations-api";
import { createRecoveryHttpServer } from "../src/recovery-http-server";

describe("Build 55 secure HTTP runtime", () => {
  let server: Server | undefined;
  let base = "";
  afterEach(async () => {
    if (server?.listening) { server.close(); await once(server, "close"); }
    server = undefined;
  });
  async function start() {
    const api = new RecoveryOperationsApi(async () => null, {} as never, {} as never);
    server = createRecoveryHttpServer({ api, uiPath: "/path/that/does/not/exist", allowedOrigin: "http://127.0.0.1" });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS_MISSING");
    base = `http://127.0.0.1:${address.port}`;
  }
  it("exposes a minimal health endpoint with safe headers", async () => {
    await start();
    const response = await fetch(base + "/healthz");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).status).toBe("healthy");
  });
  it("rejects cross-origin and missing-origin mutation requests before API routing", async () => {
    await start();
    const spy = vi.spyOn(RecoveryOperationsApi.prototype, "handle");
    const cross = await fetch(base + "/api/recovery/escalations", { method: "POST", headers: { origin: "https://attacker.example", "content-type": "application/json" }, body: "{}" });
    expect(cross.status).toBe(403);
    expect((await cross.json()).error).toBe("ORIGIN_NOT_ALLOWED");
    const missing = await fetch(base + "/api/recovery/escalations", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(missing.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("requires JSON for mutation and rejects unsupported methods", async () => {
    await start();
    const contentType = await fetch(base + "/api/recovery/escalations", { method: "POST", headers: { origin: "http://127.0.0.1", "content-type": "text/plain" }, body: "{}" });
    expect(contentType.status).toBe(415);
    const method = await fetch(base + "/api/recovery/escalations", { method: "DELETE" });
    expect(method.status).toBe(405);
    expect(method.headers.get("allow")).toBe("GET, POST");
  });
  it("does not expose unknown paths or claim unauthenticated access", async () => {
    await start();
    expect((await fetch(base + "/not-a-route")).status).toBe(404);
    const response = await fetch(base + "/api/recovery/escalations");
    expect(response.status).toBe(401);
  });
});
