import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { ApiRequest, ApiResponse } from "../../../builds/54-nova-recovery-operations-dashboard-ui/src/recovery-operations-api";
import { RecoveryOperationsApi } from "../../../builds/54-nova-recovery-operations-dashboard-ui/src/recovery-operations-api";
import type { DependencyReadiness } from "../../../builds/56-nova-deployment-readiness/src/deployment-readiness";

const MAX_BODY_BYTES = 64 * 1024;
export interface RecoveryRuntimeOptions {
  api: RecoveryOperationsApi;
  workspaceApi?: { handle(request: ApiRequest): Promise<ApiResponse> };
  chartApi?: { handle(request: ApiRequest): Promise<ApiResponse> };
  chartUiPath?: string;
  uiPath?: string;
  allowedOrigin?: string;
  serviceName?: string;
  readiness?: { check(): Promise<DependencyReadiness> };
}
const DEFAULT_CSP = "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
/** CSP that allows only the page's own inline script(s), by hash (no 'unsafe-inline' scripts). */
function hashedCsp(html: string): string {
  const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => `'sha256-${createHash("sha256").update(m[1], "utf8").digest("base64")}'`);
  return `default-src 'self'; script-src ${hashes.join(" ") || "'none'"}; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'`;
}
function send(response: ServerResponse, status: number, body: unknown, contentType = "application/json; charset=utf-8", csp = DEFAULT_CSP): void {
  response.statusCode = status;
  response.setHeader("Content-Type", contentType);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Content-Security-Policy", csp);
  response.end(typeof body === "string" ? body : JSON.stringify(body));
}
function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    let raw = "";
    let bytes = 0;
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk, "utf8");
      if (bytes > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("REQUEST_BODY_TOO_LARGE"), { statusCode: 413 }));
        request.destroy();
        return;
      }
      raw += chunk;
    });
    request.on("end", () => {
      if (!raw) return resolveBody(undefined);
      try { resolveBody(JSON.parse(raw)); }
      catch { reject(Object.assign(new Error("REQUEST_JSON_INVALID"), { statusCode: 400 })); }
    });
    request.on("error", reject);
  });
}
export function createRecoveryHttpServer(options: RecoveryRuntimeOptions): Server {
  const uiPath = options.uiPath ?? resolve(process.cwd(), "builds/54-nova-recovery-operations-dashboard-ui/ui/index.html");
  const serviceName = options.serviceName ?? "nova-recovery-operations";
  return createServer(async (request, response) => {
    try {
      const method = (request.method ?? "GET").toUpperCase();
      const host = request.headers.host;
      const url = new URL(request.url ?? "/", `http://${host || "localhost"}`);
      if (method === "GET" && url.pathname === "/healthz") {
        send(response, 200, { service: serviceName, status: "healthy", checkedAt: new Date().toISOString() });
        return;
      }
      if (method === "GET" && url.pathname === "/readyz") {
        if (!options.readiness) { send(response, 503, { service: serviceName, status: "not_ready", reason: "READINESS_CHECK_NOT_CONFIGURED", checkedAt: new Date().toISOString() }); return; }
        const result = await options.readiness.check();
        send(response, result.status === "ready" ? 200 : 503, { service: serviceName, ...result });
        return;
      }
      if (method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        const html = await readFile(uiPath, "utf8");
        send(response, 200, html, "text/html; charset=utf-8");
        return;
      }
      if (method === "GET" && options.chartApi && (url.pathname === "/chart" || url.pathname === "/chart/")) {
        const chartUi = options.chartUiPath ?? resolve(process.cwd(), "builds/67-clinical-chart-api-ui/ui/index.html");
        const html = await readFile(chartUi, "utf8");
        send(response, 200, html, "text/html; charset=utf-8", hashedCsp(html));
        return;
      }
      if (!url.pathname.startsWith("/api/")) { send(response, 404, { error: "ROUTE_NOT_FOUND" }); return; }
      if (!["GET", "POST"].includes(method)) {
        response.setHeader("Allow", "GET, POST");
        send(response, 405, { error: "METHOD_NOT_ALLOWED" });
        return;
      }
      if (method === "POST") {
        const origin = request.headers.origin;
        if (!origin) { send(response, 403, { error: "ORIGIN_REQUIRED" }); return; }
        const expected = options.allowedOrigin ?? `http://${host}`;
        if (origin !== expected) { send(response, 403, { error: "ORIGIN_NOT_ALLOWED" }); return; }
        if (!(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
          send(response, 415, { error: "JSON_CONTENT_TYPE_REQUIRED" }); return;
        }
      }
      const body = method === "POST" ? await readBody(request) : undefined;
      const query: Record<string, string> = {};
      url.searchParams.forEach((value, key) => { query[key] = value; });
      const apiRequest: ApiRequest = { method, path: url.pathname, query, body, headers: Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : value])) };
      const result: ApiResponse = url.pathname.startsWith("/api/chart/") || url.pathname === "/api/chart"
        ? (options.chartApi ? await options.chartApi.handle(apiRequest) : { status: 404, body: { error: "ROUTE_NOT_FOUND" } })
        : url.pathname.startsWith("/api/workspace") && options.workspaceApi
        ? await options.workspaceApi.handle(apiRequest)
        : await options.api.handle(apiRequest);
      send(response, result.status, result.body);
    } catch (error) {
      const statusCode = typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500;
      send(response, statusCode, { error: statusCode === 500 ? "INTERNAL_SERVER_ERROR" : (error instanceof Error ? error.message : "REQUEST_FAILED") });
    }
  });
}
